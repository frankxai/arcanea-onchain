/**
 * @arcanea/ip-registry — Core Type Definitions
 *
 * Type system for Intellectual Property registration, licensing,
 * and royalty distribution within the Arcanea universe.
 *
 * Integrates with Story Protocol for on-chain IP management.
 */

// ---------------------------------------------------------------------------
// IP Asset
// ---------------------------------------------------------------------------

export type IPAssetType =
  | 'guardian'
  | 'godbeast'
  | 'element'
  | 'house'
  | 'lore'
  | 'cosmic'
  | 'derivative';

export interface IPAsset {
  /** Unique identifier for this IP asset */
  id: string;

  /** Human-readable name */
  name: string;

  /** Detailed description of the IP asset */
  description: string;

  /** Classification of the IP asset */
  type: IPAssetType;

  /** Parent asset ID for derivatives */
  parentId?: string;

  /** Wallet address of the creator/registrant */
  creator: string;

  /** Chain where this IP was registered */
  chain: string;

  /** Transaction hash from registration */
  registrationTxHash: string;

  /** License terms governing this IP */
  licenseTerms: LicenseTerms;

  /** Arbitrary metadata attached to this IP */
  metadata: Record<string, unknown>;

  /** Child IP Asset IDs (derivatives of this asset) */
  derivatives: string[];

  /** Registration timestamp */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Licensing
// ---------------------------------------------------------------------------

export type LicenseType = 'commercial' | 'non-commercial' | 'exclusive';

export interface LicenseTerms {
  /** License classification */
  type: LicenseType;

  /** Royalty percentage owed to the IP owner (0-100) */
  royaltyPercentage: number;

  /** Whether derivatives of this IP are permitted */
  derivativesAllowed: boolean;

  /** Whether attribution to the original creator is required */
  attributionRequired: boolean;

  /** Whether the IP can be used in commercial contexts */
  commercialUse: boolean;

  /** Geographic territories where the license applies */
  territories: string[];

  /** Duration of the license — 'perpetual' or a number of years */
  duration: 'perpetual' | number;

  /** Whether the licensor can revoke the license */
  revocable: boolean;
}

// ---------------------------------------------------------------------------
// Derivative Requests
// ---------------------------------------------------------------------------

export interface DerivativeRequest {
  /** The IP asset being derived from */
  parentAssetId: string;

  /** Wallet address of the creator requesting the derivative */
  creatorAddress: string;

  /** Name for the new derivative asset */
  name: string;

  /** Description of the derivative */
  description: string;

  /** Optional overrides to the parent's license terms */
  additionalTerms?: Partial<LicenseTerms>;
}

// ---------------------------------------------------------------------------
// Royalty Distribution
// ---------------------------------------------------------------------------

export interface RoyaltyDistribution {
  /** Wallet address of the royalty recipient */
  recipient: string;

  /** Percentage share of royalties (0-100) */
  percentage: number;

  /** Total earnings accumulated (in smallest currency unit) */
  earned: bigint;

  /** Amount already claimed/withdrawn */
  claimed: bigint;

  /** Amount available for claiming (earned - claimed) */
  pending: bigint;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface IPRegistryConfig {
  /** Story Protocol RPC endpoint */
  storyProtocolRpc: string;

  /** Private key or key reference for signing transactions */
  walletKey: string;

  /** Default royalty percentage for new registrations */
  defaultRoyalty: number;

  /** Default license terms applied when none are specified */
  defaultLicense: LicenseTerms;
}

// ---------------------------------------------------------------------------
// Registration Receipt
// ---------------------------------------------------------------------------

export interface RegistrationReceipt {
  /** The registered IP asset */
  asset: IPAsset;

  /** Transaction hash on-chain */
  txHash: string;

  /** Block number of the registration */
  blockNumber?: number;

  /** Timestamp of registration */
  timestamp: Date;

  /** Whether the registration was successful */
  success: boolean;

  /** Error message if registration failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Derivative Tree Node
// ---------------------------------------------------------------------------

export interface DerivativeTreeNode {
  /** The IP asset at this node */
  asset: IPAsset;

  /** Direct children (derivatives) */
  children: DerivativeTreeNode[];

  /** Depth in the tree (root = 0) */
  depth: number;

  /** Cumulative royalty percentage owed to root */
  cumulativeRoyalty: number;
}

// ---------------------------------------------------------------------------
// Royalty Report
// ---------------------------------------------------------------------------

export interface RoyaltyReport {
  /** Root asset that generates royalties */
  rootAssetId: string;

  /** All distributions along the derivative tree */
  distributions: RoyaltyDistribution[];

  /** Total earned across all recipients */
  totalEarned: bigint;

  /** Total claimed across all recipients */
  totalClaimed: bigint;

  /** Total pending across all recipients */
  totalPending: bigint;

  /** Report generation timestamp */
  generatedAt: Date;
}
