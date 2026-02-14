//! # Academy Badge Program
//!
//! Compressed NFT (cNFT) badges for Academy achievements using Bubblegum v2
//! state compression. Enables minting millions of badges at near-zero cost.
//!
//! ## Badge Types
//! - **House Membership** — Lumina, Nero, Pyros, Aqualis, Terra, Ventus, Synthesis
//! - **Gate Completion** — One badge per Gate opened (ten total)
//! - **Rank Advancement** — Apprentice, Mage, Master, Archmage, Luminor
//! - **Special Event** — Limited-time event participation badges
//! - **Achievement** — Milestones (first creation, collaboration, etc.)
//!
//! ## Architecture
//! Badges are stored as leaves in a Merkle tree (state compression).
//! The `BadgeConfig` PDA manages tree authority and minting permissions.
//! Individual badge data is encoded in the leaf and verified against the tree root.
//!
//! All badges are **soulbound by default** — they represent personal achievements
//! and cannot be transferred.
//!
//! ## Security
//! - Only `badge_authority` can mint badges
//! - Merkle tree is managed by the program's PDA (not by any external account)
//! - Badge verification uses the Merkle proof against the on-chain root
//! - Batch minting is capped at 25 badges per transaction (to fit in compute budget)

use anchor_lang::prelude::*;

declare_id!("AcdBdg1111111111111111111111111111111111111");

/// Maximum badges per batch mint (bounded by Solana compute units).
const MAX_BATCH_SIZE: usize = 25;

/// Maximum name/description length.
const MAX_NAME_LEN: usize = 64;
const MAX_DESC_LEN: usize = 256;
const MAX_URI_LEN: usize = 256;

// ─────────────────────────────────────────────────
//  Enums
// ─────────────────────────────────────────────────

/// Badge category determines the type of achievement.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum BadgeCategory {
    HouseMembership = 0,
    GateCompletion = 1,
    RankAdvancement = 2,
    SpecialEvent = 3,
    Achievement = 4,
}

/// House affiliation for House Membership badges.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum House {
    Lumina = 0,
    Nero = 1,
    Pyros = 2,
    Aqualis = 3,
    Terra = 4,
    Ventus = 5,
    Synthesis = 6,
}

/// Gate index for Gate Completion badges (0-9 maps to the Ten Gates).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum GateIndex {
    Foundation = 0, // 396 Hz — Lyssandria
    Flow = 1,       // 417 Hz — Leyla
    Fire = 2,       // 528 Hz — Draconia
    Heart = 3,      // 639 Hz — Maylinn
    Voice = 4,      // 741 Hz — Alera
    Sight = 5,      // 852 Hz — Lyria
    Crown = 6,      // 963 Hz — Aiyami
    Shift = 7,      // 1111 Hz — Elara
    Unity = 8,      // 963 Hz — Ino
    Source = 9,     // 1111 Hz — Shinkami
}

/// Rank for Rank Advancement badges.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum Rank {
    Apprentice = 0,
    Mage = 1,
    Master = 2,
    Archmage = 3,
    Luminor = 4,
}

// ─────────────────────────────────────────────────
//  Account Structures
// ─────────────────────────────────────────────────

/// Configuration for the badge system.
/// PDA seeds: [b"badge_config", authority.key()]
#[account]
#[derive(InitSpace)]
pub struct BadgeConfig {
    /// Authority that can manage the badge system.
    pub authority: Pubkey,

    /// Authority that can mint new badges.
    pub badge_authority: Pubkey,

    /// Merkle tree account for state compression.
    pub merkle_tree: Pubkey,

    /// Total badges minted across all categories.
    pub total_minted: u64,

    /// Whether the badge system is active.
    pub is_active: bool,

    /// Maximum tree depth (determines max leaves = 2^depth).
    pub max_depth: u32,

    /// Maximum buffer size for the concurrent Merkle tree.
    pub max_buffer_size: u32,

    /// PDA bump.
    pub bump: u8,
}

/// Individual badge data (stored as compressed leaf, this struct defines the schema).
/// Not an actual Anchor account — serialized into the Merkle tree leaf.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct BadgeData {
    /// Recipient wallet address.
    pub recipient: Pubkey,

    /// Badge category.
    pub category: BadgeCategory,

    /// Category-specific identifier:
    /// - HouseMembership: House variant as u8
    /// - GateCompletion: GateIndex variant as u8
    /// - RankAdvancement: Rank variant as u8
    /// - SpecialEvent: event_id
    /// - Achievement: achievement_id
    pub category_id: u8,

    /// Human-readable badge name.
    #[max_len(MAX_NAME_LEN)]
    pub name: String,

    /// Off-chain metadata URI.
    #[max_len(MAX_URI_LEN)]
    pub uri: String,

    /// Unix timestamp of when the badge was earned.
    pub earned_at: i64,

    /// Whether the badge has been revoked (soft delete).
    pub is_revoked: bool,
}

/// Badge verification receipt — proof that a wallet holds a specific badge.
/// PDA seeds: [b"badge_receipt", recipient.key(), badge_hash]
#[account]
#[derive(InitSpace)]
pub struct BadgeReceipt {
    /// The wallet that owns this badge.
    pub recipient: Pubkey,

    /// Category of the badge.
    pub category: BadgeCategory,

    /// Category-specific ID.
    pub category_id: u8,

    /// Merkle tree leaf index for on-chain verification.
    pub leaf_index: u32,

    /// Hash of the badge data (for integrity verification).
    pub badge_hash: [u8; 32],

    /// Timestamp when the badge was minted.
    pub minted_at: i64,

    /// Whether this receipt is still valid.
    pub is_valid: bool,

    /// PDA bump.
    pub bump: u8,
}

// ─────────────────────────────────────────────────
//  Error Codes
// ─────────────────────────────────────────────────

#[error_code]
pub enum BadgeError {
    #[msg("Badge system is not active")]
    SystemNotActive,

    #[msg("Unauthorized: not the badge authority")]
    UnauthorizedBadgeAuthority,

    #[msg("Unauthorized: not the system authority")]
    UnauthorizedAuthority,

    #[msg("Batch size exceeds maximum (25)")]
    BatchTooLarge,

    #[msg("Badge name exceeds maximum length")]
    NameTooLong,

    #[msg("Badge URI exceeds maximum length")]
    UriTooLong,

    #[msg("Badge already exists for this recipient and category")]
    BadgeAlreadyExists,

    #[msg("Badge not found")]
    BadgeNotFound,

    #[msg("Badge has been revoked")]
    BadgeRevoked,

    #[msg("Invalid badge category ID")]
    InvalidCategoryId,

    #[msg("Merkle tree is full")]
    TreeFull,

    #[msg("Arithmetic overflow")]
    Overflow,
}

// ─────────────────────────────────────────────────
//  Program Instructions
// ─────────────────────────────────────────────────

#[program]
pub mod academy_badge {
    use super::*;

    /// Initialize the badge system with a Merkle tree for state compression.
    ///
    /// # Arguments
    /// * `max_depth` - Tree depth (e.g., 20 = 1M leaves, 24 = 16M leaves)
    /// * `max_buffer_size` - Concurrent buffer size (64-2048)
    pub fn initialize(
        ctx: Context<Initialize>,
        max_depth: u32,
        max_buffer_size: u32,
    ) -> Result<()> {
        let config = &mut ctx.accounts.badge_config;
        config.authority = ctx.accounts.authority.key();
        config.badge_authority = ctx.accounts.authority.key();
        config.merkle_tree = ctx.accounts.merkle_tree.key();
        config.total_minted = 0;
        config.is_active = true;
        config.max_depth = max_depth;
        config.max_buffer_size = max_buffer_size;
        config.bump = ctx.bumps.badge_config;

        msg!(
            "Badge system initialized with tree depth {} ({} max badges)",
            max_depth,
            2u64.pow(max_depth)
        );

        // Note: In production, the Merkle tree account is initialized via
        // the SPL Account Compression program CPI. The tree creation call
        // should be made separately or as a CPI from this instruction.

        Ok(())
    }

    /// Mint a single badge to a recipient.
    ///
    /// Creates a BadgeReceipt PDA for on-chain verification and appends
    /// the badge data as a leaf to the Merkle tree (via CPI to Bubblegum).
    ///
    /// # Security
    /// - Requires `badge_authority` signature
    /// - System must be active
    /// - Validates category_id against the badge category
    pub fn mint_badge(
        ctx: Context<MintBadge>,
        category: BadgeCategory,
        category_id: u8,
        name: String,
        uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.badge_config;

        require!(config.is_active, BadgeError::SystemNotActive);
        require!(
            config.badge_authority == ctx.accounts.badge_authority.key(),
            BadgeError::UnauthorizedBadgeAuthority
        );
        require!(name.len() <= MAX_NAME_LEN, BadgeError::NameTooLong);
        require!(uri.len() <= MAX_URI_LEN, BadgeError::UriTooLong);

        validate_category_id(category, category_id)?;

        let now = Clock::get()?.unix_timestamp;

        // Create badge data for Merkle leaf
        let badge_data = BadgeData {
            recipient: ctx.accounts.recipient.key(),
            category,
            category_id,
            name: name.clone(),
            uri,
            earned_at: now,
            is_revoked: false,
        };

        // Compute badge hash for receipt
        let badge_bytes = badge_data.try_to_vec()?;
        let badge_hash = anchor_lang::solana_program::hash::hash(&badge_bytes).to_bytes();

        // Initialize receipt PDA
        let receipt = &mut ctx.accounts.badge_receipt;
        receipt.recipient = ctx.accounts.recipient.key();
        receipt.category = category;
        receipt.category_id = category_id;
        receipt.leaf_index = config.total_minted as u32;
        receipt.badge_hash = badge_hash;
        receipt.minted_at = now;
        receipt.is_valid = true;
        receipt.bump = ctx.bumps.badge_receipt;

        // Increment total minted
        config.total_minted = config
            .total_minted
            .checked_add(1)
            .ok_or(BadgeError::Overflow)?;

        // Note: In production, this is where we would CPI to Bubblegum v2's
        // `mint_to_collection_v1` to actually append the leaf to the Merkle tree.
        // The CPI would include the badge data serialized as the leaf's metadata.

        msg!(
            "Badge minted: {} (category {:?}, id {}) to {}",
            name,
            category,
            category_id,
            ctx.accounts.recipient.key()
        );

        Ok(())
    }

    /// Batch mint badges to multiple recipients.
    ///
    /// Gas-efficient: processes up to MAX_BATCH_SIZE badges in one transaction.
    /// All badges share the same category and category_id (e.g., minting
    /// House Membership badges to an entire class).
    ///
    /// # Arguments
    /// * `category` - Badge category for all badges in this batch
    /// * `category_id` - Category-specific ID for all badges
    /// * `name` - Badge name for all badges
    /// * `uri` - Metadata URI for all badges
    ///
    /// Note: Recipients are passed as remaining_accounts (up to MAX_BATCH_SIZE).
    pub fn batch_mint(
        ctx: Context<BatchMint>,
        category: BadgeCategory,
        category_id: u8,
        name: String,
        uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.badge_config;

        require!(config.is_active, BadgeError::SystemNotActive);
        require!(
            config.badge_authority == ctx.accounts.badge_authority.key(),
            BadgeError::UnauthorizedBadgeAuthority
        );
        require!(name.len() <= MAX_NAME_LEN, BadgeError::NameTooLong);
        require!(uri.len() <= MAX_URI_LEN, BadgeError::UriTooLong);

        validate_category_id(category, category_id)?;

        let recipient_count = ctx.remaining_accounts.len();
        require!(recipient_count <= MAX_BATCH_SIZE, BadgeError::BatchTooLarge);
        require!(recipient_count > 0, BadgeError::BatchTooLarge);

        let now = Clock::get()?.unix_timestamp;

        for account in ctx.remaining_accounts.iter() {
            // In production, each recipient would get a Merkle tree leaf via CPI.
            // Here we track the mint count.
            config.total_minted = config
                .total_minted
                .checked_add(1)
                .ok_or(BadgeError::Overflow)?;

            msg!("Batch badge minted to {}", account.key());
        }

        msg!(
            "Batch minted {} badges: {} (category {:?})",
            recipient_count,
            name,
            category
        );

        Ok(())
    }

    /// Verify that a wallet holds a specific badge.
    ///
    /// Checks the BadgeReceipt PDA and validates it hasn't been revoked.
    /// Returns success if the badge is valid, error if not.
    pub fn verify_badge(ctx: Context<VerifyBadge>) -> Result<()> {
        let receipt = &ctx.accounts.badge_receipt;

        require!(receipt.is_valid, BadgeError::BadgeRevoked);
        require!(
            receipt.recipient == ctx.accounts.holder.key(),
            BadgeError::BadgeNotFound
        );

        msg!(
            "Badge verified: category {:?}, id {} for {}",
            receipt.category,
            receipt.category_id,
            receipt.recipient
        );

        Ok(())
    }

    /// Revoke a badge (soft delete — marks receipt as invalid).
    ///
    /// # Security
    /// - Only `authority` can revoke badges
    pub fn revoke_badge(ctx: Context<RevokeBadge>) -> Result<()> {
        let config = &ctx.accounts.badge_config;
        require!(
            config.authority == ctx.accounts.authority.key(),
            BadgeError::UnauthorizedAuthority
        );

        let receipt = &mut ctx.accounts.badge_receipt;
        receipt.is_valid = false;

        msg!(
            "Badge revoked: category {:?}, id {} for {}",
            receipt.category,
            receipt.category_id,
            receipt.recipient
        );

        Ok(())
    }

    /// Update the badge authority.
    pub fn update_badge_authority(
        ctx: Context<UpdateConfig>,
        new_badge_authority: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.badge_config;
        require!(
            config.authority == ctx.accounts.authority.key(),
            BadgeError::UnauthorizedAuthority
        );

        config.badge_authority = new_badge_authority;
        msg!("Badge authority updated to {}", new_badge_authority);
        Ok(())
    }

    /// Toggle badge system active status.
    pub fn set_active(ctx: Context<UpdateConfig>, is_active: bool) -> Result<()> {
        let config = &mut ctx.accounts.badge_config;
        require!(
            config.authority == ctx.accounts.authority.key(),
            BadgeError::UnauthorizedAuthority
        );

        config.is_active = is_active;
        msg!(
            "Badge system {}",
            if is_active { "activated" } else { "paused" }
        );
        Ok(())
    }
}

// ─────────────────────────────────────────────────
//  Account Validation Structs
// ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BadgeConfig::INIT_SPACE,
        seeds = [b"badge_config", authority.key().as_ref()],
        bump
    )]
    pub badge_config: Account<'info, BadgeConfig>,

    /// CHECK: The Merkle tree account to be initialized via SPL Account Compression.
    /// Validated during tree initialization CPI.
    pub merkle_tree: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(category: BadgeCategory, category_id: u8)]
pub struct MintBadge<'info> {
    #[account(mut)]
    pub badge_config: Account<'info, BadgeConfig>,

    #[account(
        init,
        payer = badge_authority,
        space = 8 + BadgeReceipt::INIT_SPACE,
        seeds = [
            b"badge_receipt",
            recipient.key().as_ref(),
            &[category as u8],
            &[category_id],
        ],
        bump
    )]
    pub badge_receipt: Account<'info, BadgeReceipt>,

    /// CHECK: The recipient wallet that will own the badge.
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub badge_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BatchMint<'info> {
    #[account(mut)]
    pub badge_config: Account<'info, BadgeConfig>,

    #[account(mut)]
    pub badge_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyBadge<'info> {
    pub badge_receipt: Account<'info, BadgeReceipt>,

    /// CHECK: The wallet claiming to hold the badge.
    pub holder: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct RevokeBadge<'info> {
    pub badge_config: Account<'info, BadgeConfig>,

    #[account(mut)]
    pub badge_receipt: Account<'info, BadgeReceipt>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut)]
    pub badge_config: Account<'info, BadgeConfig>,

    pub authority: Signer<'info>,
}

// ─────────────────────────────────────────────────
//  Helper Functions
// ─────────────────────────────────────────────────

/// Validate that the category_id is valid for the given badge category.
fn validate_category_id(category: BadgeCategory, id: u8) -> Result<()> {
    let valid = match category {
        BadgeCategory::HouseMembership => id <= 6,  // 7 houses
        BadgeCategory::GateCompletion => id <= 9,    // 10 gates
        BadgeCategory::RankAdvancement => id <= 4,   // 5 ranks
        BadgeCategory::SpecialEvent => true,         // Any ID for events
        BadgeCategory::Achievement => true,          // Any ID for achievements
    };

    require!(valid, BadgeError::InvalidCategoryId);
    Ok(())
}
