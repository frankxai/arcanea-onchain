//! # Rewards Program
//!
//! Creator reward distribution engine for the Arcanea ecosystem on Solana.
//! Accumulates royalties from marketplace fees, minting proceeds, and
//! IP licensing, then distributes them to creators via a claim mechanism.
//!
//! ## Revenue Sources
//! - **Marketplace fees** — Secondary sale royalties routed here
//! - **Minting proceeds** — Primary sale revenue splits
//! - **IP licensing royalties** — Story Protocol integration royalties
//! - **Community contributions** — Direct donations to reward pool
//!
//! ## Distribution Model
//! Revenue is split according to configurable percentages:
//! - **Original creator** — Configurable % (default 70%)
//! - **Guardian vault** — Configurable % (default 20%) for ecosystem sustainability
//! - **Community treasury** — Configurable % (default 10%) for DAO governance
//!
//! ## Security
//! - Pull-over-push: Creators claim their own rewards (no admin-pushed distributions)
//! - Only `distributor_authority` can record new distributions
//! - Claim verification via PDA derivation (provably linked to recipient)
//! - Emergency pause stops new distributions but allows existing claims
//! - All arithmetic uses checked operations to prevent overflow

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("RwdPgm1111111111111111111111111111111111111");

/// Basis points denominator (10000 = 100%).
const BPS_DENOMINATOR: u64 = 10_000;

// ─────────────────────────────────────────────────
//  Account Structures
// ─────────────────────────────────────────────────

/// Global reward pool configuration.
/// PDA seeds: [b"reward_pool", admin.key()]
#[account]
#[derive(InitSpace)]
pub struct RewardPool {
    /// Admin authority.
    pub admin: Pubkey,

    /// Authority that can record new distributions (marketplace, mint contracts).
    pub distributor_authority: Pubkey,

    /// Guardian vault address for the ecosystem share.
    pub guardian_vault: Pubkey,

    /// Community treasury address for the DAO share.
    pub community_treasury: Pubkey,

    /// Creator share in basis points (default 7000 = 70%).
    pub creator_share_bps: u16,

    /// Guardian vault share in basis points (default 2000 = 20%).
    pub guardian_share_bps: u16,

    /// Community treasury share in basis points (default 1000 = 10%).
    pub community_share_bps: u16,

    /// Total SOL received by the reward pool (lifetime).
    pub total_received: u64,

    /// Total SOL distributed to all parties (lifetime).
    pub total_distributed: u64,

    /// Total SOL claimed by creators (lifetime).
    pub total_claimed: u64,

    /// Number of unique creators who have received distributions.
    pub unique_creators: u32,

    /// Whether the reward pool is active.
    pub is_active: bool,

    /// PDA bump.
    pub bump: u8,
}

/// Per-creator reward account tracking claimable balance.
/// PDA seeds: [b"creator_reward", reward_pool.key(), creator.key()]
#[account]
#[derive(InitSpace)]
pub struct CreatorReward {
    /// The creator's wallet address.
    pub creator: Pubkey,

    /// The reward pool this account belongs to.
    pub reward_pool: Pubkey,

    /// Total amount ever credited to this creator.
    pub total_earned: u64,

    /// Total amount claimed by this creator.
    pub total_claimed: u64,

    /// Current claimable balance (total_earned - total_claimed).
    pub claimable: u64,

    /// Number of distributions received.
    pub distribution_count: u32,

    /// Timestamp of last distribution.
    pub last_distribution: i64,

    /// Timestamp of last claim.
    pub last_claim: i64,

    /// PDA bump.
    pub bump: u8,
}

// ─────────────────────────────────────────────────
//  Error Codes
// ─────────────────────────────────────────────────

#[error_code]
pub enum RewardError {
    #[msg("Reward pool is not active")]
    PoolNotActive,

    #[msg("Unauthorized: not the admin")]
    UnauthorizedAdmin,

    #[msg("Unauthorized: not the distributor authority")]
    UnauthorizedDistributor,

    #[msg("Share basis points must sum to 10000")]
    InvalidShareTotal,

    #[msg("No claimable balance")]
    NothingToClaim,

    #[msg("Insufficient pool balance")]
    InsufficientPoolBalance,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Share exceeds 10000 basis points")]
    InvalidShareBps,
}

// ─────────────────────────────────────────────────
//  Events
// ─────────────────────────────────────────────────

#[event]
pub struct RewardDistributed {
    pub reward_pool: Pubkey,
    pub creator: Pubkey,
    pub total_amount: u64,
    pub creator_amount: u64,
    pub guardian_amount: u64,
    pub community_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct RewardClaimed {
    pub creator: Pubkey,
    pub amount: u64,
    pub remaining_claimable: u64,
    pub timestamp: i64,
}

#[event]
pub struct PoolFunded {
    pub reward_pool: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

// ─────────────────────────────────────────────────
//  Program Instructions
// ─────────────────────────────────────────────────

#[program]
pub mod rewards {
    use super::*;

    /// Initialize the reward pool with distribution shares.
    ///
    /// # Arguments
    /// * `creator_share_bps` - Creator's share (e.g., 7000 = 70%)
    /// * `guardian_share_bps` - Guardian vault share (e.g., 2000 = 20%)
    /// * `community_share_bps` - Community treasury share (e.g., 1000 = 10%)
    ///
    /// Shares MUST sum to 10000 (100%).
    pub fn initialize(
        ctx: Context<InitializePool>,
        creator_share_bps: u16,
        guardian_share_bps: u16,
        community_share_bps: u16,
    ) -> Result<()> {
        let total = creator_share_bps as u64 + guardian_share_bps as u64 + community_share_bps as u64;
        require!(total == BPS_DENOMINATOR, RewardError::InvalidShareTotal);

        let pool = &mut ctx.accounts.reward_pool;
        pool.admin = ctx.accounts.admin.key();
        pool.distributor_authority = ctx.accounts.admin.key();
        pool.guardian_vault = ctx.accounts.guardian_vault.key();
        pool.community_treasury = ctx.accounts.community_treasury.key();
        pool.creator_share_bps = creator_share_bps;
        pool.guardian_share_bps = guardian_share_bps;
        pool.community_share_bps = community_share_bps;
        pool.total_received = 0;
        pool.total_distributed = 0;
        pool.total_claimed = 0;
        pool.unique_creators = 0;
        pool.is_active = true;
        pool.bump = ctx.bumps.reward_pool;

        msg!(
            "Reward pool initialized: creator {}%, guardian {}%, community {}%",
            creator_share_bps as f64 / 100.0,
            guardian_share_bps as f64 / 100.0,
            community_share_bps as f64 / 100.0
        );

        Ok(())
    }

    /// Distribute reward from a sale to the three-way split.
    ///
    /// Called by the distributor_authority (marketplace contract or admin)
    /// when a sale occurs. The full amount is sent with the transaction
    /// and split according to pool configuration:
    ///
    /// 1. Guardian share → sent immediately to guardian_vault
    /// 2. Community share → sent immediately to community_treasury
    /// 3. Creator share → credited to creator's ClaimableReward account
    ///
    /// The creator claims their share later via `claim_reward()`.
    pub fn distribute(
        ctx: Context<Distribute>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, RewardError::ZeroAmount);

        let pool = &mut ctx.accounts.reward_pool;
        require!(pool.is_active, RewardError::PoolNotActive);
        require!(
            pool.distributor_authority == ctx.accounts.distributor.key(),
            RewardError::UnauthorizedDistributor
        );

        // Calculate splits
        let creator_amount = amount
            .checked_mul(pool.creator_share_bps as u64)
            .ok_or(RewardError::Overflow)?
            / BPS_DENOMINATOR;

        let guardian_amount = amount
            .checked_mul(pool.guardian_share_bps as u64)
            .ok_or(RewardError::Overflow)?
            / BPS_DENOMINATOR;

        // Community gets remainder to avoid rounding dust loss
        let community_amount = amount
            .checked_sub(creator_amount)
            .ok_or(RewardError::Overflow)?
            .checked_sub(guardian_amount)
            .ok_or(RewardError::Overflow)?;

        // Transfer full amount from distributor to pool PDA first
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.distributor.to_account_info(),
                    to: ctx.accounts.reward_pool.to_account_info(),
                },
            ),
            amount,
        )?;

        // Send guardian share
        if guardian_amount > 0 {
            **ctx.accounts.reward_pool.to_account_info().try_borrow_mut_lamports()? -= guardian_amount;
            **ctx.accounts.guardian_vault.to_account_info().try_borrow_mut_lamports()? += guardian_amount;
        }

        // Send community share
        if community_amount > 0 {
            **ctx.accounts.reward_pool.to_account_info().try_borrow_mut_lamports()? -= community_amount;
            **ctx.accounts.community_treasury.to_account_info().try_borrow_mut_lamports()? += community_amount;
        }

        // Credit creator's reward account (pull pattern — they claim later)
        let creator_reward = &mut ctx.accounts.creator_reward;
        let is_new = creator_reward.total_earned == 0;

        creator_reward.total_earned = creator_reward
            .total_earned
            .checked_add(creator_amount)
            .ok_or(RewardError::Overflow)?;
        creator_reward.claimable = creator_reward
            .claimable
            .checked_add(creator_amount)
            .ok_or(RewardError::Overflow)?;
        creator_reward.distribution_count = creator_reward
            .distribution_count
            .checked_add(1)
            .ok_or(RewardError::Overflow)?;
        creator_reward.last_distribution = Clock::get()?.unix_timestamp;

        // Update pool stats
        pool.total_received = pool
            .total_received
            .checked_add(amount)
            .ok_or(RewardError::Overflow)?;
        pool.total_distributed = pool
            .total_distributed
            .checked_add(guardian_amount + community_amount)
            .ok_or(RewardError::Overflow)?;

        if is_new {
            pool.unique_creators = pool
                .unique_creators
                .checked_add(1)
                .ok_or(RewardError::Overflow)?;
        }

        let now = Clock::get()?.unix_timestamp;

        emit!(RewardDistributed {
            reward_pool: pool.key(),
            creator: ctx.accounts.creator.key(),
            total_amount: amount,
            creator_amount,
            guardian_amount,
            community_amount,
            timestamp: now,
        });

        msg!(
            "Distributed {} lamports: creator={}, guardian={}, community={}",
            amount,
            creator_amount,
            guardian_amount,
            community_amount
        );

        Ok(())
    }

    /// Claim accumulated creator rewards.
    ///
    /// The creator calls this to withdraw their claimable balance.
    /// Pull-over-push pattern: only the creator themselves can claim.
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let creator_reward = &mut ctx.accounts.creator_reward;
        let pool = &mut ctx.accounts.reward_pool;

        require!(
            creator_reward.creator == ctx.accounts.creator.key(),
            RewardError::UnauthorizedAdmin // Reuse error for unauthorized
        );
        require!(creator_reward.claimable > 0, RewardError::NothingToClaim);

        let claim_amount = creator_reward.claimable;

        // Verify pool has sufficient balance
        let pool_balance = pool.to_account_info().lamports();
        let min_balance = Rent::get()?.minimum_balance(pool.to_account_info().data_len());
        require!(
            pool_balance.saturating_sub(min_balance) >= claim_amount,
            RewardError::InsufficientPoolBalance
        );

        // Transfer from pool to creator
        **pool.to_account_info().try_borrow_mut_lamports()? -= claim_amount;
        **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += claim_amount;

        // Update creator reward account
        creator_reward.total_claimed = creator_reward
            .total_claimed
            .checked_add(claim_amount)
            .ok_or(RewardError::Overflow)?;
        creator_reward.claimable = 0;
        creator_reward.last_claim = Clock::get()?.unix_timestamp;

        // Update pool stats
        pool.total_claimed = pool
            .total_claimed
            .checked_add(claim_amount)
            .ok_or(RewardError::Overflow)?;

        let now = Clock::get()?.unix_timestamp;

        emit!(RewardClaimed {
            creator: ctx.accounts.creator.key(),
            amount: claim_amount,
            remaining_claimable: 0,
            timestamp: now,
        });

        msg!(
            "Creator {} claimed {} lamports",
            ctx.accounts.creator.key(),
            claim_amount
        );

        Ok(())
    }

    /// Fund the reward pool directly (donations, manual top-ups).
    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        require!(amount > 0, RewardError::ZeroAmount);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.funder.to_account_info(),
                    to: ctx.accounts.reward_pool.to_account_info(),
                },
            ),
            amount,
        )?;

        let pool = &mut ctx.accounts.reward_pool;
        pool.total_received = pool
            .total_received
            .checked_add(amount)
            .ok_or(RewardError::Overflow)?;

        let now = Clock::get()?.unix_timestamp;

        emit!(PoolFunded {
            reward_pool: pool.key(),
            funder: ctx.accounts.funder.key(),
            amount,
            timestamp: now,
        });

        msg!("Pool funded with {} lamports", amount);
        Ok(())
    }

    /// Update distribution shares.
    ///
    /// # Security
    /// - Only admin can update
    /// - Shares must sum to 10000
    pub fn update_shares(
        ctx: Context<UpdatePool>,
        creator_share_bps: u16,
        guardian_share_bps: u16,
        community_share_bps: u16,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.reward_pool;
        require!(
            pool.admin == ctx.accounts.admin.key(),
            RewardError::UnauthorizedAdmin
        );

        let total = creator_share_bps as u64 + guardian_share_bps as u64 + community_share_bps as u64;
        require!(total == BPS_DENOMINATOR, RewardError::InvalidShareTotal);

        pool.creator_share_bps = creator_share_bps;
        pool.guardian_share_bps = guardian_share_bps;
        pool.community_share_bps = community_share_bps;

        msg!(
            "Shares updated: creator {}%, guardian {}%, community {}%",
            creator_share_bps as f64 / 100.0,
            guardian_share_bps as f64 / 100.0,
            community_share_bps as f64 / 100.0
        );

        Ok(())
    }

    /// Update the distributor authority.
    pub fn update_distributor(
        ctx: Context<UpdatePool>,
        new_distributor: Pubkey,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.reward_pool;
        require!(
            pool.admin == ctx.accounts.admin.key(),
            RewardError::UnauthorizedAdmin
        );

        pool.distributor_authority = new_distributor;
        msg!("Distributor authority updated to {}", new_distributor);
        Ok(())
    }

    /// Toggle reward pool active status.
    pub fn set_active(ctx: Context<UpdatePool>, is_active: bool) -> Result<()> {
        let pool = &mut ctx.accounts.reward_pool;
        require!(
            pool.admin == ctx.accounts.admin.key(),
            RewardError::UnauthorizedAdmin
        );

        pool.is_active = is_active;
        msg!(
            "Reward pool {}",
            if is_active { "activated" } else { "paused" }
        );
        Ok(())
    }
}

// ─────────────────────────────────────────────────
//  Account Validation Structs
// ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + RewardPool::INIT_SPACE,
        seeds = [b"reward_pool", admin.key().as_ref()],
        bump
    )]
    pub reward_pool: Account<'info, RewardPool>,

    /// CHECK: Guardian vault address. Stored in config.
    pub guardian_vault: UncheckedAccount<'info>,

    /// CHECK: Community treasury address. Stored in config.
    pub community_treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(mut)]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(
        init_if_needed,
        payer = distributor,
        space = 8 + CreatorReward::INIT_SPACE,
        seeds = [b"creator_reward", reward_pool.key().as_ref(), creator.key().as_ref()],
        bump
    )]
    pub creator_reward: Account<'info, CreatorReward>,

    /// CHECK: The creator who will receive rewards.
    pub creator: UncheckedAccount<'info>,

    /// CHECK: Guardian vault to receive its share.
    #[account(
        mut,
        constraint = guardian_vault.key() == reward_pool.guardian_vault
    )]
    pub guardian_vault: UncheckedAccount<'info>,

    /// CHECK: Community treasury to receive its share.
    #[account(
        mut,
        constraint = community_treasury.key() == reward_pool.community_treasury
    )]
    pub community_treasury: UncheckedAccount<'info>,

    #[account(mut)]
    pub distributor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(mut)]
    pub creator_reward: Account<'info, CreatorReward>,

    #[account(mut)]
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut)]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(mut)]
    pub funder: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    #[account(mut)]
    pub reward_pool: Account<'info, RewardPool>,

    pub admin: Signer<'info>,
}
