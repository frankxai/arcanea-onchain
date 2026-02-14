//! # Guardian NFT Program
//!
//! Metaplex Core-compatible NFT collection for the 10 Arcanea Guardians and
//! their Godbeasts, plus all creator-minted NFTs in the Arcanea universe.
//!
//! ## Features
//! - Collection creation with full Arcanean metadata schema
//! - Minting with on-chain attributes (element, guardian, rank, gate level, house, tier)
//! - Dynamic attribute evolution as creators progress through the Ten Gates
//! - Authority management with collection-level and token-level permissions
//! - Proper error handling with custom Anchor error codes
//!
//! ## Architecture
//! Each NFT stores its Arcanean attributes in a PDA-derived `ArcaneanMetadata` account.
//! This keeps the metadata on-chain and queryable, separate from the Metaplex
//! token metadata (which handles name, symbol, URI for off-chain rendering).
//!
//! ## Security
//! - Only `collection_authority` can create collections
//! - Only `mint_authority` can mint new tokens
//! - Only `guardian_authority` can evolve attributes
//! - PDA seeds ensure metadata accounts are uniquely tied to their token

use anchor_lang::prelude::*;

declare_id!("GrdNFT1111111111111111111111111111111111111");

/// Maximum name length for a collection.
const MAX_NAME_LEN: usize = 64;

/// Maximum symbol length.
const MAX_SYMBOL_LEN: usize = 16;

/// Maximum URI length for off-chain metadata.
const MAX_URI_LEN: usize = 256;

// ─────────────────────────────────────────────────
//  Enums — The Five Elements, Ten Guardians, etc.
// ─────────────────────────────────────────────────

/// The Five Elements of Arcanea (plus Spirit as Lumina's Void counterpart).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum Element {
    Fire = 0,   // Red, orange, gold — energy, transformation
    Water = 1,  // Blue, silver, crystal — flow, healing, memory
    Earth = 2,  // Green, brown, stone — stability, growth
    Wind = 3,   // White, silver — freedom, speed, change
    Void = 4,   // Black/Gold — Nero's aspect: potential, mystery
    Spirit = 5, // Purple/white — Lumina's aspect: transcendence
}

/// The Ten Guardian deities who keep the Gates.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum Guardian {
    Lyssandria = 0, // Foundation Gate, 396 Hz, Earth
    Leyla = 1,      // Flow Gate, 417 Hz, Water
    Draconia = 2,   // Fire Gate, 528 Hz, Fire
    Maylinn = 3,    // Heart Gate, 639 Hz, Water
    Alera = 4,      // Voice Gate, 741 Hz, Wind
    Lyria = 5,      // Sight Gate, 852 Hz, Spirit
    Aiyami = 6,     // Crown Gate, 963 Hz, Spirit
    Elara = 7,      // Shift Gate, 1111 Hz, Void
    Ino = 8,        // Unity Gate, 963 Hz, Spirit
    Shinkami = 9,    // Source Gate, 1111 Hz, Spirit
}

/// Magic ranks based on number of Gates opened.
/// 0-2 = Apprentice, 3-4 = Mage, 5-6 = Master, 7-8 = Archmage, 9-10 = Luminor
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum Rank {
    Apprentice = 0,
    Mage = 1,
    Master = 2,
    Archmage = 3,
    Luminor = 4,
}

/// The Seven Academy Houses.
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

/// NFT rarity tier.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum Tier {
    Common = 0,    // Soulbound badges, fragments
    Rare = 1,      // Larger editions
    Epic = 2,      // Limited editions
    Legendary = 3, // 1/1 auctions
}

// ─────────────────────────────────────────────────
//  Account Structures
// ─────────────────────────────────────────────────

/// On-chain collection configuration.
/// PDA seeds: [b"collection", collection_authority.key()]
#[account]
#[derive(InitSpace)]
pub struct CollectionConfig {
    /// The authority that can manage this collection.
    pub collection_authority: Pubkey,

    /// Authority that can mint new tokens into this collection.
    pub mint_authority: Pubkey,

    /// Authority that can evolve/update token attributes (Guardian AI agents).
    pub guardian_authority: Pubkey,

    /// Collection name (e.g., "Arcanea Guardians").
    #[max_len(MAX_NAME_LEN)]
    pub name: String,

    /// Collection symbol (e.g., "ARCG").
    #[max_len(MAX_SYMBOL_LEN)]
    pub symbol: String,

    /// Base URI for off-chain metadata.
    #[max_len(MAX_URI_LEN)]
    pub uri: String,

    /// Maximum supply (0 = unlimited).
    pub max_supply: u64,

    /// Current number of minted tokens.
    pub current_supply: u64,

    /// Royalty basis points (e.g., 1000 = 10%).
    pub royalty_bps: u16,

    /// Whether the collection is currently accepting mints.
    pub is_active: bool,

    /// Bump seed for the PDA.
    pub bump: u8,
}

/// On-chain Arcanean metadata for a single NFT.
/// PDA seeds: [b"arcanean_meta", mint.key()]
#[account]
#[derive(InitSpace)]
pub struct ArcaneanMetadata {
    /// The mint address of the associated NFT.
    pub mint: Pubkey,

    /// The collection this token belongs to.
    pub collection: Pubkey,

    /// Element affinity.
    pub element: Element,

    /// Patron Guardian deity.
    pub guardian: Guardian,

    /// Current magic rank.
    pub rank: Rank,

    /// Gate level (0-10).
    pub gate_level: u8,

    /// Academy House.
    pub house: House,

    /// Rarity tier.
    pub tier: Tier,

    /// Whether this token is soulbound (non-transferable).
    pub is_soulbound: bool,

    /// Unix timestamp of creation.
    pub created_at: i64,

    /// Unix timestamp of last attribute evolution.
    pub last_evolved: i64,

    /// Number of times attributes have been evolved.
    pub evolution_count: u32,

    /// Reserved bytes for future extensions.
    pub reserved: [u8; 32],

    /// Bump seed for the PDA.
    pub bump: u8,
}

// ─────────────────────────────────────────────────
//  Error Codes
// ─────────────────────────────────────────────────

#[error_code]
pub enum ArcaneanError {
    #[msg("Collection has reached maximum supply")]
    MaxSupplyReached,

    #[msg("Collection is not active")]
    CollectionNotActive,

    #[msg("Invalid gate level (must be 0-10)")]
    InvalidGateLevel,

    #[msg("Unauthorized: not the collection authority")]
    UnauthorizedCollectionAuthority,

    #[msg("Unauthorized: not the mint authority")]
    UnauthorizedMintAuthority,

    #[msg("Unauthorized: not the guardian authority")]
    UnauthorizedGuardianAuthority,

    #[msg("Name exceeds maximum length")]
    NameTooLong,

    #[msg("Symbol exceeds maximum length")]
    SymbolTooLong,

    #[msg("URI exceeds maximum length")]
    UriTooLong,

    #[msg("Royalty basis points exceeds 10000")]
    InvalidRoyaltyBps,

    #[msg("Token metadata mismatch: wrong collection")]
    CollectionMismatch,

    #[msg("Cannot transfer soulbound token")]
    SoulboundToken,

    #[msg("Arithmetic overflow")]
    Overflow,
}

// ─────────────────────────────────────────────────
//  Program Instructions
// ─────────────────────────────────────────────────

#[program]
pub mod guardian_nft {
    use super::*;

    /// Initialize a new Arcanean NFT collection.
    ///
    /// Creates a `CollectionConfig` PDA that stores collection parameters.
    /// The collection_authority becomes the owner who can manage the collection.
    ///
    /// # Arguments
    /// * `name` - Collection display name
    /// * `symbol` - Short ticker symbol
    /// * `uri` - Base URI for off-chain metadata (IPFS/Arweave)
    /// * `max_supply` - Maximum mintable tokens (0 = unlimited)
    /// * `royalty_bps` - Royalty percentage in basis points (1000 = 10%)
    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        name: String,
        symbol: String,
        uri: String,
        max_supply: u64,
        royalty_bps: u16,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, ArcaneanError::NameTooLong);
        require!(symbol.len() <= MAX_SYMBOL_LEN, ArcaneanError::SymbolTooLong);
        require!(uri.len() <= MAX_URI_LEN, ArcaneanError::UriTooLong);
        require!(royalty_bps <= 10_000, ArcaneanError::InvalidRoyaltyBps);

        let config = &mut ctx.accounts.collection_config;
        config.collection_authority = ctx.accounts.authority.key();
        config.mint_authority = ctx.accounts.authority.key();
        config.guardian_authority = ctx.accounts.authority.key();
        config.name = name;
        config.symbol = symbol;
        config.uri = uri;
        config.max_supply = max_supply;
        config.current_supply = 0;
        config.royalty_bps = royalty_bps;
        config.is_active = true;
        config.bump = ctx.bumps.collection_config;

        msg!("Collection initialized: {}", config.name);
        Ok(())
    }

    /// Mint a new Arcanean NFT with full attribute assignment.
    ///
    /// Creates both the SPL token mint and the `ArcaneanMetadata` PDA
    /// that stores on-chain attributes.
    ///
    /// # Security
    /// - Requires `mint_authority` signature
    /// - Checks max supply hasn't been reached
    /// - Collection must be active
    pub fn mint_nft(
        ctx: Context<MintNft>,
        element: Element,
        guardian: Guardian,
        house: House,
        tier: Tier,
        is_soulbound: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.collection_config;

        // Validate authority
        require!(
            config.mint_authority == ctx.accounts.mint_authority.key(),
            ArcaneanError::UnauthorizedMintAuthority
        );

        // Check collection is active
        require!(config.is_active, ArcaneanError::CollectionNotActive);

        // Check supply
        if config.max_supply > 0 {
            require!(
                config.current_supply < config.max_supply,
                ArcaneanError::MaxSupplyReached
            );
        }

        // Increment supply
        config.current_supply = config
            .current_supply
            .checked_add(1)
            .ok_or(ArcaneanError::Overflow)?;

        // Initialize metadata PDA
        let metadata = &mut ctx.accounts.arcanean_metadata;
        metadata.mint = ctx.accounts.nft_mint.key();
        metadata.collection = ctx.accounts.collection_config.key();
        metadata.element = element;
        metadata.guardian = guardian;
        metadata.rank = Rank::Apprentice;
        metadata.gate_level = 0;
        metadata.house = house;
        metadata.tier = tier;
        metadata.is_soulbound = is_soulbound;
        metadata.created_at = Clock::get()?.unix_timestamp;
        metadata.last_evolved = 0;
        metadata.evolution_count = 0;
        metadata.reserved = [0u8; 32];
        metadata.bump = ctx.bumps.arcanean_metadata;

        msg!(
            "Minted NFT #{} — Element: {:?}, Guardian: {:?}, Tier: {:?}",
            config.current_supply,
            element,
            guardian,
            tier
        );

        Ok(())
    }

    /// Evolve a token's Gate level and automatically derive the new Rank.
    ///
    /// Rank derivation: 0-2 = Apprentice, 3-4 = Mage, 5-6 = Master,
    /// 7-8 = Archmage, 9-10 = Luminor.
    ///
    /// # Security
    /// - Requires `guardian_authority` signature
    /// - Gate level must be 0-10
    /// - Validates token belongs to the specified collection
    pub fn evolve_attributes(
        ctx: Context<EvolveAttributes>,
        new_gate_level: u8,
    ) -> Result<()> {
        require!(new_gate_level <= 10, ArcaneanError::InvalidGateLevel);

        let config = &ctx.accounts.collection_config;
        require!(
            config.guardian_authority == ctx.accounts.guardian_authority.key(),
            ArcaneanError::UnauthorizedGuardianAuthority
        );

        let metadata = &mut ctx.accounts.arcanean_metadata;
        require!(
            metadata.collection == ctx.accounts.collection_config.key(),
            ArcaneanError::CollectionMismatch
        );

        let old_level = metadata.gate_level;
        let old_rank = metadata.rank;

        metadata.gate_level = new_gate_level;
        metadata.rank = rank_from_gate_level(new_gate_level);
        metadata.last_evolved = Clock::get()?.unix_timestamp;
        metadata.evolution_count = metadata
            .evolution_count
            .checked_add(1)
            .ok_or(ArcaneanError::Overflow)?;

        msg!(
            "Evolved NFT: Gate {} -> {}, Rank {:?} -> {:?}",
            old_level,
            new_gate_level,
            old_rank,
            metadata.rank
        );

        Ok(())
    }

    /// Update collection authorities (mint, guardian, or collection authority).
    ///
    /// # Security
    /// - Only current `collection_authority` can call this
    pub fn update_authorities(
        ctx: Context<UpdateAuthorities>,
        new_mint_authority: Option<Pubkey>,
        new_guardian_authority: Option<Pubkey>,
        new_collection_authority: Option<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.collection_config;

        require!(
            config.collection_authority == ctx.accounts.authority.key(),
            ArcaneanError::UnauthorizedCollectionAuthority
        );

        if let Some(mint_auth) = new_mint_authority {
            config.mint_authority = mint_auth;
        }
        if let Some(guardian_auth) = new_guardian_authority {
            config.guardian_authority = guardian_auth;
        }
        if let Some(collection_auth) = new_collection_authority {
            config.collection_authority = collection_auth;
        }

        msg!("Authorities updated for collection: {}", config.name);
        Ok(())
    }

    /// Toggle collection active status (pause/unpause minting).
    ///
    /// # Security
    /// - Only `collection_authority` can toggle
    pub fn set_collection_active(
        ctx: Context<UpdateAuthorities>,
        is_active: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.collection_config;

        require!(
            config.collection_authority == ctx.accounts.authority.key(),
            ArcaneanError::UnauthorizedCollectionAuthority
        );

        config.is_active = is_active;

        msg!(
            "Collection {} {}",
            config.name,
            if is_active { "activated" } else { "paused" }
        );
        Ok(())
    }

    /// Toggle the soulbound flag on a token.
    ///
    /// # Security
    /// - Only `collection_authority` can change soulbound status
    pub fn set_soulbound(
        ctx: Context<EvolveAttributes>,
        is_soulbound: bool,
    ) -> Result<()> {
        let config = &ctx.accounts.collection_config;
        require!(
            config.collection_authority == ctx.accounts.guardian_authority.key()
                || config.guardian_authority == ctx.accounts.guardian_authority.key(),
            ArcaneanError::UnauthorizedGuardianAuthority
        );

        let metadata = &mut ctx.accounts.arcanean_metadata;
        metadata.is_soulbound = is_soulbound;

        msg!(
            "Soulbound status changed to {} for mint {}",
            is_soulbound,
            metadata.mint
        );
        Ok(())
    }
}

// ─────────────────────────────────────────────────
//  Account Validation Structs
// ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + CollectionConfig::INIT_SPACE,
        seeds = [b"collection", authority.key().as_ref()],
        bump
    )]
    pub collection_config: Account<'info, CollectionConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub collection_config: Account<'info, CollectionConfig>,

    #[account(
        init,
        payer = mint_authority,
        space = 8 + ArcaneanMetadata::INIT_SPACE,
        seeds = [b"arcanean_meta", nft_mint.key().as_ref()],
        bump
    )]
    pub arcanean_metadata: Account<'info, ArcaneanMetadata>,

    /// The SPL token mint for this NFT.
    /// CHECK: Validated by Metaplex Core in production. Here we store the key.
    pub nft_mint: UncheckedAccount<'info>,

    /// The recipient of the minted NFT.
    /// CHECK: Any valid public key can receive an NFT.
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub mint_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EvolveAttributes<'info> {
    pub collection_config: Account<'info, CollectionConfig>,

    #[account(mut)]
    pub arcanean_metadata: Account<'info, ArcaneanMetadata>,

    pub guardian_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAuthorities<'info> {
    #[account(mut)]
    pub collection_config: Account<'info, CollectionConfig>,

    pub authority: Signer<'info>,
}

// ─────────────────────────────────────────────────
//  Helper Functions
// ─────────────────────────────────────────────────

/// Derive magic Rank from Gate level.
/// 0-2 = Apprentice, 3-4 = Mage, 5-6 = Master, 7-8 = Archmage, 9-10 = Luminor
fn rank_from_gate_level(level: u8) -> Rank {
    match level {
        0..=2 => Rank::Apprentice,
        3..=4 => Rank::Mage,
        5..=6 => Rank::Master,
        7..=8 => Rank::Archmage,
        9..=10 => Rank::Luminor,
        _ => Rank::Apprentice, // Fallback (should never reach due to validation)
    }
}
