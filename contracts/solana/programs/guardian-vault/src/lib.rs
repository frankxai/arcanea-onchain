//! # Guardian Vault Program
//!
//! On-chain treasuries managed by autonomous Guardian AI agents with multi-sig
//! oversight. Each vault is bound to a Guardian and has configurable spending
//! limits, deposit/withdrawal tracking, and emergency controls.
//!
//! ## Features
//! - **Agent-initiated transactions** within predefined spending limits
//! - **Multi-sig approval** for large withdrawals (configurable threshold)
//! - **Deposit tracking** with per-source accounting
//! - **Spending limits** — daily and per-transaction caps
//! - **Emergency withdrawal** by admin with full logging
//! - **Transaction history** via events (no on-chain log to save rent)
//!
//! ## Security Model
//! The vault uses a 3-tier authority system:
//! 1. **Agent** — Can spend up to `per_tx_limit` without approval, up to `daily_limit` per day
//! 2. **Signers** — For amounts above `per_tx_limit`, M-of-N signers must approve
//! 3. **Admin** — Can update config, change limits, emergency withdraw
//!
//! All SOL movements are tracked via Anchor events for off-chain indexing.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("GrdVlt1111111111111111111111111111111111111");

/// Maximum number of multi-sig signers.
const MAX_SIGNERS: usize = 5;

// ─────────────────────────────────────────────────
//  Account Structures
// ─────────────────────────────────────────────────

/// Vault configuration account.
/// PDA seeds: [b"vault", guardian_id, admin.key()]
#[account]
#[derive(InitSpace)]
pub struct VaultConfig {
    /// Admin authority (can update config, emergency withdraw).
    pub admin: Pubkey,

    /// Agent authority (Guardian AI — can spend within limits).
    pub agent: Pubkey,

    /// Guardian identifier (0-9, maps to the Ten Guardians).
    pub guardian_id: u8,

    /// Per-transaction spending limit for the agent (in lamports).
    pub per_tx_limit: u64,

    /// Daily spending limit for the agent (in lamports).
    pub daily_limit: u64,

    /// Amount spent by agent today (resets when `last_spend_day` changes).
    pub daily_spent: u64,

    /// Day number (unix_timestamp / 86400) of last agent spend.
    pub last_spend_day: u64,

    /// Total deposited into this vault (lifetime).
    pub total_deposited: u64,

    /// Total withdrawn from this vault (lifetime).
    pub total_withdrawn: u64,

    /// Whether the vault is active (false = frozen, only admin can withdraw).
    pub is_active: bool,

    /// Multi-sig threshold for large withdrawals (M of N).
    pub multisig_threshold: u8,

    /// Number of registered signers.
    pub signer_count: u8,

    /// Multi-sig signer addresses.
    #[max_len(MAX_SIGNERS)]
    pub signers: Vec<Pubkey>,

    /// PDA bump.
    pub bump: u8,
}

/// Pending multi-sig withdrawal request.
/// PDA seeds: [b"withdrawal", vault.key(), &nonce.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct WithdrawalRequest {
    /// The vault this withdrawal is from.
    pub vault: Pubkey,

    /// Destination wallet.
    pub destination: Pubkey,

    /// Amount to withdraw (in lamports).
    pub amount: u64,

    /// Who initiated the request.
    pub initiator: Pubkey,

    /// Unique nonce for this request.
    pub nonce: u64,

    /// Number of approvals received.
    pub approval_count: u8,

    /// Bitmap of which signers have approved (bit index = signer index).
    pub approval_bitmap: u8,

    /// Whether this request has been executed.
    pub is_executed: bool,

    /// Whether this request has been cancelled.
    pub is_cancelled: bool,

    /// Unix timestamp of creation.
    pub created_at: i64,

    /// PDA bump.
    pub bump: u8,
}

// ─────────────────────────────────────────────────
//  Error Codes
// ─────────────────────────────────────────────────

#[error_code]
pub enum VaultError {
    #[msg("Vault is not active")]
    VaultNotActive,

    #[msg("Unauthorized: not the admin")]
    UnauthorizedAdmin,

    #[msg("Unauthorized: not the agent")]
    UnauthorizedAgent,

    #[msg("Unauthorized: not an approved signer")]
    UnauthorizedSigner,

    #[msg("Per-transaction spending limit exceeded")]
    PerTxLimitExceeded,

    #[msg("Daily spending limit exceeded")]
    DailyLimitExceeded,

    #[msg("Insufficient vault balance")]
    InsufficientBalance,

    #[msg("Too many signers (maximum 5)")]
    TooManySigners,

    #[msg("Invalid multisig threshold")]
    InvalidThreshold,

    #[msg("Withdrawal request already executed")]
    AlreadyExecuted,

    #[msg("Withdrawal request already cancelled")]
    AlreadyCancelled,

    #[msg("Multisig threshold not met")]
    ThresholdNotMet,

    #[msg("Signer has already approved this request")]
    AlreadyApproved,

    #[msg("Invalid guardian ID (must be 0-9)")]
    InvalidGuardianId,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}

// ─────────────────────────────────────────────────
//  Events
// ─────────────────────────────────────────────────

#[event]
pub struct VaultDeposit {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct AgentSpend {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub daily_spent: u64,
    pub timestamp: i64,
}

#[event]
pub struct MultisigWithdrawalCreated {
    pub vault: Pubkey,
    pub nonce: u64,
    pub destination: Pubkey,
    pub amount: u64,
    pub initiator: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MultisigApproval {
    pub vault: Pubkey,
    pub nonce: u64,
    pub signer: Pubkey,
    pub approval_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct MultisigWithdrawalExecuted {
    pub vault: Pubkey,
    pub nonce: u64,
    pub destination: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyWithdrawal {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

// ─────────────────────────────────────────────────
//  Program Instructions
// ─────────────────────────────────────────────────

#[program]
pub mod guardian_vault {
    use super::*;

    /// Initialize a new Guardian Vault.
    ///
    /// # Arguments
    /// * `guardian_id` - Which Guardian this vault belongs to (0-9)
    /// * `per_tx_limit` - Max lamports the agent can spend per transaction
    /// * `daily_limit` - Max lamports the agent can spend per day
    /// * `multisig_threshold` - Number of approvals needed for large withdrawals
    /// * `signers` - Multi-sig signer public keys
    pub fn initialize(
        ctx: Context<InitializeVault>,
        guardian_id: u8,
        per_tx_limit: u64,
        daily_limit: u64,
        multisig_threshold: u8,
        signers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(guardian_id <= 9, VaultError::InvalidGuardianId);
        require!(signers.len() <= MAX_SIGNERS, VaultError::TooManySigners);
        require!(
            multisig_threshold > 0 && multisig_threshold as usize <= signers.len(),
            VaultError::InvalidThreshold
        );

        let vault = &mut ctx.accounts.vault_config;
        vault.admin = ctx.accounts.admin.key();
        vault.agent = ctx.accounts.agent.key();
        vault.guardian_id = guardian_id;
        vault.per_tx_limit = per_tx_limit;
        vault.daily_limit = daily_limit;
        vault.daily_spent = 0;
        vault.last_spend_day = 0;
        vault.total_deposited = 0;
        vault.total_withdrawn = 0;
        vault.is_active = true;
        vault.multisig_threshold = multisig_threshold;
        vault.signer_count = signers.len() as u8;
        vault.signers = signers;
        vault.bump = ctx.bumps.vault_config;

        msg!("Guardian Vault #{} initialized", guardian_id);
        Ok(())
    }

    /// Deposit SOL into the vault.
    ///
    /// Anyone can deposit. Funds are held in the vault PDA.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        // Transfer SOL from depositor to vault PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault_config.to_account_info(),
                },
            ),
            amount,
        )?;

        let vault = &mut ctx.accounts.vault_config;
        vault.total_deposited = vault
            .total_deposited
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;

        let balance = vault.to_account_info().lamports();

        emit!(VaultDeposit {
            vault: vault.key(),
            depositor: ctx.accounts.depositor.key(),
            amount,
            new_balance: balance,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Deposited {} lamports into vault #{}", amount, vault.guardian_id);
        Ok(())
    }

    /// Agent-initiated spend within configured limits.
    ///
    /// The agent can spend up to `per_tx_limit` per transaction and
    /// `daily_limit` per rolling day (UTC day boundaries).
    ///
    /// # Security
    /// - Requires agent signature
    /// - Enforces per-transaction and daily limits
    /// - Vault must be active
    pub fn agent_spend(
        ctx: Context<AgentSpendCtx>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        let vault = &mut ctx.accounts.vault_config;
        require!(vault.is_active, VaultError::VaultNotActive);
        require!(
            vault.agent == ctx.accounts.agent.key(),
            VaultError::UnauthorizedAgent
        );

        // Check per-tx limit
        require!(amount <= vault.per_tx_limit, VaultError::PerTxLimitExceeded);

        // Check daily limit (reset if new day)
        let now = Clock::get()?.unix_timestamp;
        let current_day = (now as u64) / 86400;

        if current_day != vault.last_spend_day {
            vault.daily_spent = 0;
            vault.last_spend_day = current_day;
        }

        let new_daily_spent = vault
            .daily_spent
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        require!(new_daily_spent <= vault.daily_limit, VaultError::DailyLimitExceeded);

        // Check vault has enough balance
        let vault_balance = vault.to_account_info().lamports();
        let min_balance = Rent::get()?.minimum_balance(vault.to_account_info().data_len());
        require!(
            vault_balance.saturating_sub(min_balance) >= amount,
            VaultError::InsufficientBalance
        );

        // Transfer SOL from vault PDA to destination
        **vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += amount;

        vault.daily_spent = new_daily_spent;
        vault.total_withdrawn = vault
            .total_withdrawn
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;

        emit!(AgentSpend {
            vault: vault.key(),
            agent: ctx.accounts.agent.key(),
            destination: ctx.accounts.destination.key(),
            amount,
            daily_spent: new_daily_spent,
            timestamp: now,
        });

        msg!(
            "Agent spent {} lamports from vault #{} (daily: {}/{})",
            amount,
            vault.guardian_id,
            new_daily_spent,
            vault.daily_limit
        );

        Ok(())
    }

    /// Create a multi-sig withdrawal request for amounts exceeding agent limits.
    ///
    /// The initiator can be the agent or any signer. The request must
    /// collect `multisig_threshold` approvals before execution.
    pub fn create_withdrawal_request(
        ctx: Context<CreateWithdrawalRequest>,
        amount: u64,
        nonce: u64,
    ) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        let vault = &ctx.accounts.vault_config;
        require!(vault.is_active, VaultError::VaultNotActive);

        let request = &mut ctx.accounts.withdrawal_request;
        request.vault = ctx.accounts.vault_config.key();
        request.destination = ctx.accounts.destination.key();
        request.amount = amount;
        request.initiator = ctx.accounts.initiator.key();
        request.nonce = nonce;
        request.approval_count = 0;
        request.approval_bitmap = 0;
        request.is_executed = false;
        request.is_cancelled = false;
        request.created_at = Clock::get()?.unix_timestamp;
        request.bump = ctx.bumps.withdrawal_request;

        emit!(MultisigWithdrawalCreated {
            vault: vault.key(),
            nonce,
            destination: request.destination,
            amount,
            initiator: ctx.accounts.initiator.key(),
            timestamp: request.created_at,
        });

        msg!("Withdrawal request #{} created for {} lamports", nonce, amount);
        Ok(())
    }

    /// Approve a multi-sig withdrawal request.
    ///
    /// # Security
    /// - Caller must be a registered signer
    /// - Cannot approve twice
    /// - Request must not be executed or cancelled
    pub fn approve_withdrawal(ctx: Context<ApproveWithdrawal>) -> Result<()> {
        let vault = &ctx.accounts.vault_config;
        let request = &mut ctx.accounts.withdrawal_request;

        require!(!request.is_executed, VaultError::AlreadyExecuted);
        require!(!request.is_cancelled, VaultError::AlreadyCancelled);

        // Find signer index
        let signer_key = ctx.accounts.signer.key();
        let signer_index = vault
            .signers
            .iter()
            .position(|s| *s == signer_key)
            .ok_or(VaultError::UnauthorizedSigner)?;

        // Check not already approved
        let bit = 1u8 << signer_index;
        require!(request.approval_bitmap & bit == 0, VaultError::AlreadyApproved);

        // Record approval
        request.approval_bitmap |= bit;
        request.approval_count += 1;

        let now = Clock::get()?.unix_timestamp;

        emit!(MultisigApproval {
            vault: vault.key(),
            nonce: request.nonce,
            signer: signer_key,
            approval_count: request.approval_count,
            timestamp: now,
        });

        msg!(
            "Withdrawal #{} approved by signer {} ({}/{})",
            request.nonce,
            signer_index,
            request.approval_count,
            vault.multisig_threshold
        );

        Ok(())
    }

    /// Execute a fully-approved multi-sig withdrawal.
    ///
    /// # Security
    /// - Threshold must be met
    /// - Vault must have sufficient balance
    /// - Request must not already be executed
    pub fn execute_withdrawal(ctx: Context<ExecuteWithdrawal>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        let request = &mut ctx.accounts.withdrawal_request;

        require!(!request.is_executed, VaultError::AlreadyExecuted);
        require!(!request.is_cancelled, VaultError::AlreadyCancelled);
        require!(
            request.approval_count >= vault.multisig_threshold,
            VaultError::ThresholdNotMet
        );

        // Check balance
        let vault_balance = vault.to_account_info().lamports();
        let min_balance = Rent::get()?.minimum_balance(vault.to_account_info().data_len());
        require!(
            vault_balance.saturating_sub(min_balance) >= request.amount,
            VaultError::InsufficientBalance
        );

        // Execute transfer
        **vault.to_account_info().try_borrow_mut_lamports()? -= request.amount;
        **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += request.amount;

        request.is_executed = true;
        vault.total_withdrawn = vault
            .total_withdrawn
            .checked_add(request.amount)
            .ok_or(VaultError::Overflow)?;

        let now = Clock::get()?.unix_timestamp;

        emit!(MultisigWithdrawalExecuted {
            vault: vault.key(),
            nonce: request.nonce,
            destination: request.destination,
            amount: request.amount,
            timestamp: now,
        });

        msg!(
            "Withdrawal #{} executed: {} lamports to {}",
            request.nonce,
            request.amount,
            request.destination
        );

        Ok(())
    }

    /// Emergency withdrawal of all vault funds by admin.
    ///
    /// # Security
    /// - Only admin can call
    /// - Bypasses multi-sig (emergency use only)
    /// - Fully logged via event
    pub fn emergency_withdraw(ctx: Context<EmergencyWithdrawCtx>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;

        require!(
            vault.admin == ctx.accounts.admin.key(),
            VaultError::UnauthorizedAdmin
        );

        let vault_balance = vault.to_account_info().lamports();
        let min_balance = Rent::get()?.minimum_balance(vault.to_account_info().data_len());
        let withdrawable = vault_balance.saturating_sub(min_balance);

        require!(withdrawable > 0, VaultError::InsufficientBalance);

        // Transfer all withdrawable funds
        **vault.to_account_info().try_borrow_mut_lamports()? -= withdrawable;
        **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += withdrawable;

        vault.total_withdrawn = vault
            .total_withdrawn
            .checked_add(withdrawable)
            .ok_or(VaultError::Overflow)?;

        let now = Clock::get()?.unix_timestamp;

        emit!(EmergencyWithdrawal {
            vault: vault.key(),
            admin: ctx.accounts.admin.key(),
            destination: ctx.accounts.destination.key(),
            amount: withdrawable,
            timestamp: now,
        });

        msg!(
            "EMERGENCY: {} lamports withdrawn from vault #{} to {}",
            withdrawable,
            vault.guardian_id,
            ctx.accounts.destination.key()
        );

        Ok(())
    }

    /// Update vault configuration (limits, signers, agent).
    ///
    /// # Security
    /// - Only admin can update config
    pub fn update_config(
        ctx: Context<UpdateVaultConfig>,
        new_agent: Option<Pubkey>,
        new_per_tx_limit: Option<u64>,
        new_daily_limit: Option<u64>,
        new_multisig_threshold: Option<u8>,
        new_signers: Option<Vec<Pubkey>>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;

        require!(
            vault.admin == ctx.accounts.admin.key(),
            VaultError::UnauthorizedAdmin
        );

        if let Some(agent) = new_agent {
            vault.agent = agent;
        }
        if let Some(limit) = new_per_tx_limit {
            vault.per_tx_limit = limit;
        }
        if let Some(limit) = new_daily_limit {
            vault.daily_limit = limit;
        }
        if let Some(signers) = new_signers {
            require!(signers.len() <= MAX_SIGNERS, VaultError::TooManySigners);
            vault.signer_count = signers.len() as u8;
            vault.signers = signers;
        }
        if let Some(threshold) = new_multisig_threshold {
            require!(
                threshold > 0 && threshold <= vault.signer_count,
                VaultError::InvalidThreshold
            );
            vault.multisig_threshold = threshold;
        }

        msg!("Vault #{} config updated", vault.guardian_id);
        Ok(())
    }

    /// Toggle vault active status (freeze/unfreeze).
    pub fn set_active(ctx: Context<UpdateVaultConfig>, is_active: bool) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;

        require!(
            vault.admin == ctx.accounts.admin.key(),
            VaultError::UnauthorizedAdmin
        );

        vault.is_active = is_active;

        msg!(
            "Vault #{} {}",
            vault.guardian_id,
            if is_active { "activated" } else { "frozen" }
        );
        Ok(())
    }
}

// ─────────────────────────────────────────────────
//  Account Validation Structs
// ─────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(guardian_id: u8)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + VaultConfig::INIT_SPACE,
        seeds = [b"vault", &[guardian_id], admin.key().as_ref()],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: The agent (Guardian AI) public key. Stored in config, not validated here.
    pub agent: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AgentSpendCtx<'info> {
    #[account(mut)]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: Destination wallet to receive funds.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,

    pub agent: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct CreateWithdrawalRequest<'info> {
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        init,
        payer = initiator,
        space = 8 + WithdrawalRequest::INIT_SPACE,
        seeds = [b"withdrawal", vault_config.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    /// CHECK: Destination wallet for the withdrawal.
    pub destination: UncheckedAccount<'info>,

    #[account(mut)]
    pub initiator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveWithdrawal<'info> {
    pub vault_config: Account<'info, VaultConfig>,

    #[account(mut)]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteWithdrawal<'info> {
    #[account(mut)]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(mut)]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    /// CHECK: Must match withdrawal_request.destination.
    #[account(
        mut,
        constraint = destination.key() == withdrawal_request.destination
    )]
    pub destination: UncheckedAccount<'info>,

    pub executor: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyWithdrawCtx<'info> {
    #[account(mut)]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: Admin-chosen destination.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateVaultConfig<'info> {
    #[account(mut)]
    pub vault_config: Account<'info, VaultConfig>,

    pub admin: Signer<'info>,
}
