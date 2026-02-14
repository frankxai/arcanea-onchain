/**
 * @arcanea/ip-registry
 *
 * Story Protocol integration for IP registration and licensing.
 *
 * Features:
 * - Register Arcanea assets as on-chain Intellectual Property
 * - Create programmable license terms (commercial, derivative, remix)
 * - Automatic royalty distribution to original creators
 * - IP lineage tracking — trace every derivative back to its source
 * - Canonical Arcanea IP: Guardians, Godbeasts, Elements, Lore
 */

// Types
export type {
  IPAsset,
  IPAssetType,
  LicenseTerms,
  LicenseType,
  DerivativeRequest,
  RoyaltyDistribution,
  IPRegistryConfig,
  RegistrationReceipt,
  DerivativeTreeNode,
  RoyaltyReport,
} from './types';

// Registration
export {
  CANONICAL_ASSETS,
  registerRootAsset,
  registerDerivative,
  registerAllCanonicalAssets,
  getAsset,
  getAssetsByType,
  getAssetsByCreator,
  getDirectDerivatives,
  getRegistrySize,
  getDerivativeDepth,
  isRegistered,
  isNameTaken,
  clearRegistry,
  MAX_DERIVATIVE_DEPTH,
} from './register/assets';

// Licensing
export {
  STANDARD_LICENSE,
  PREMIUM_LICENSE,
  COMMUNITY_LICENSE,
  EXCLUSIVE_LICENSE,
  LICENSE_TEMPLATES,
  buildCustomLicense,
  validateLicenseTerms,
  isLicenseCompatible,
  getLicenseTypeName,
  getLicenseSummary,
} from './licensing/terms';

// Derivative Tree
export {
  buildDerivativeTree,
  getLineage,
  getRootAncestor,
  shareCommonAncestor,
  canCreateDerivative,
  calculateRoyaltyFlow,
  getTotalRoyaltyBurden,
  getTreeStats,
  flattenTree,
} from './derivatives/tree';
export type {
  RoyaltyFlowEntry,
  TreeStats,
  FlatTreeNode,
} from './derivatives/tree';

// Royalty Distribution
export {
  recordSale,
  claimRoyalties,
  getRoyaltyBalance,
  getAllDistributions,
  getTotalPendingRoyalties,
  generateRoyaltyReport,
  estimateRoyalties,
  calculateNetProceeds,
  clearRoyaltyLedger,
} from './royalties/distribution';
