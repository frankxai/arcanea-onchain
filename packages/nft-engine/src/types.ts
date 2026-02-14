/**
 * @arcanea/nft-engine — Core Types
 *
 * All type definitions for the Arcanea NFT engine, aligned with
 * canonical lore from ARCANEA_CANON.md.
 */

// ---------------------------------------------------------------------------
// Primitive union types
// ---------------------------------------------------------------------------

export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'void';

export type Guardian =
  | 'lyssandria'
  | 'leyla'
  | 'draconia'
  | 'maylinn'
  | 'alera'
  | 'lyria'
  | 'aiyami'
  | 'elara'
  | 'ino'
  | 'shinkami';

export type Godbeast =
  | 'kaelith'
  | 'veloura'
  | 'draconis'
  | 'laeylinn'
  | 'otome'
  | 'yumiko'
  | 'sol'
  | 'thessara'
  | 'kyuro'
  | 'amaterasu';

export type Rank = 'apprentice' | 'mage' | 'master' | 'archmage' | 'luminor';

export type House =
  | 'lumina'
  | 'nero'
  | 'pyros'
  | 'aqualis'
  | 'terra'
  | 'ventus'
  | 'synthesis';

export type NFTTier = 'legendary' | 'epic' | 'rare' | 'common' | 'fragment';

export type Chain = 'solana' | 'base';

// ---------------------------------------------------------------------------
// Canonical mappings
// ---------------------------------------------------------------------------

/** Gate frequencies (Hz) per Guardian — canonical Ten Gates system. */
export const GATE_FREQUENCIES: Record<Guardian, number> = {
  lyssandria: 396,
  leyla: 417,
  draconia: 528,
  maylinn: 639,
  alera: 741,
  lyria: 852,
  aiyami: 963,
  elara: 1111,
  ino: 963,
  shinkami: 1111,
};

/** Primary element per Guardian. */
export const GUARDIAN_ELEMENTS: Record<Guardian, Element> = {
  lyssandria: 'earth',
  leyla: 'water',
  draconia: 'fire',
  maylinn: 'wind',
  alera: 'wind',
  lyria: 'void',
  aiyami: 'void',
  elara: 'void',
  ino: 'void',
  shinkami: 'void',
};

/** Godbeast partner per Guardian. */
export const GUARDIAN_GODBEASTS: Record<Guardian, Godbeast> = {
  lyssandria: 'kaelith',
  leyla: 'veloura',
  draconia: 'draconis',
  maylinn: 'laeylinn',
  alera: 'otome',
  lyria: 'yumiko',
  aiyami: 'sol',
  elara: 'thessara',
  ino: 'kyuro',
  shinkami: 'amaterasu',
};

// ---------------------------------------------------------------------------
// Composite interfaces
// ---------------------------------------------------------------------------

/** Arcanea-specific attributes embedded in every NFT. */
export interface ArcaneanAttributes {
  element: Element;
  guardian: Guardian;
  godbeast?: Godbeast;
  rank: Rank;
  house: House;
  /** Number of Gates opened (0-10). */
  gateLevel: number;
  /** Resonance frequency in Hz. */
  frequency: number;
  tier: NFTTier;
  /** If true, the token is non-transferable. */
  soulbound?: boolean;
  /** If true, the token can evolve to a higher tier. */
  evolves?: boolean;
}

/**
 * Full NFT metadata — compatible with both ERC-721 metadata standard
 * and Metaplex Token Metadata.
 */
export interface NFTMetadata {
  name: string;
  description: string;
  /** IPFS / Arweave URI pointing to the image asset. */
  image: string;
  external_url?: string;
  animation_url?: string;
  attributes: MetadataAttribute[];
  properties?: Record<string, unknown>;
  /** Custom Arcanea-specific data (not part of ERC-721 standard). */
  arcanean: ArcaneanAttributes;
}

/** OpenSea / Metaplex-compatible trait attribute. */
export interface MetadataAttribute {
  trait_type: string;
  value: string | number;
  display_type?: 'number' | 'boost_number' | 'boost_percentage' | 'date';
}

// ---------------------------------------------------------------------------
// Generation pipeline types
// ---------------------------------------------------------------------------

export interface GenerationRequest {
  guardian: Guardian;
  element: Element;
  tier: NFTTier;
  style?: string;
  seed?: number;
  additionalPrompt?: string;
}

export interface GenerationResult {
  imageBuffer: Buffer;
  prompt: string;
  model: string;
  metadata: NFTMetadata;
}

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

export interface StorageResult {
  uri: string;
  gateway: string;
  hash: string;
  size: number;
}

// ---------------------------------------------------------------------------
// Mint configuration
// ---------------------------------------------------------------------------

export interface MintConfig {
  chain: Chain;
  tier: NFTTier;
  /** Use Bubblegum compressed NFTs on Solana. */
  compressed: boolean;
  soulbound: boolean;
  /** Royalty in basis points (500 = 5%). */
  royaltyBps: number;
  collection?: string;
}
