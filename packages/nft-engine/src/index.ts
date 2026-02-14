/**
 * @arcanea/nft-engine
 *
 * AI art generation, NFT metadata creation, and decentralized storage
 * for the Arcanea on-chain ecosystem.
 *
 * Features:
 * - Lore-consistent prompt generation for AI art (Guardians, Element Stones, Badges)
 * - ERC-721 / Metaplex-compatible metadata builder with Arcanean attributes
 * - Canon compliance checker (S/A/B/C/F grading against ARCANEA_CANON.md)
 * - Pluggable storage providers (Irys/Arweave, Pinata/IPFS)
 * - Pluggable AI provider interface for image generation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  ArcaneanAttributes,
  NFTMetadata,
  MetadataAttribute,
  GenerationRequest,
  GenerationResult,
  StorageResult,
  MintConfig,
} from './types';

export {
  type Element,
  type Guardian,
  type Godbeast,
  type Rank,
  type House,
  type NFTTier,
  type Chain,
  GATE_FREQUENCIES,
  GUARDIAN_ELEMENTS,
  GUARDIAN_GODBEASTS,
} from './types';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export {
  buildMetadata,
  buildAttributes,
  createGuardianMetadata,
  getRankFromGateLevel,
} from './metadata/builder';

export { validateMetadata, validateBatch } from './metadata/validator';
export type { ValidationResult } from './metadata/validator';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

export { NFTGenerationEngine } from './generators/engine';
export type { AIProvider, GenerateOptions, ImageResult } from './generators/engine';

export {
  buildGuardianPrompt,
  buildElementStonePrompt,
  buildAcademyBadgePrompt,
  buildLoreFragmentPrompt,
} from './generators/prompts';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export { IrysStorage, PinataStorage } from './storage/arweave';
export type { StorageProvider } from './storage/arweave';

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

export { checkCanonCompliance } from './quality/canon-checker';
export type { CanonCheckResult } from './quality/canon-checker';
