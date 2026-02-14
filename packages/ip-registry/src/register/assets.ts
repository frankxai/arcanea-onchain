/**
 * @arcanea/ip-registry — IP Asset Registration
 *
 * Registers Arcanea intellectual property on-chain via Story Protocol.
 * Handles both canonical (root) assets and user-created derivatives.
 *
 * Canonical assets include the cosmic duality (Lumina/Nero),
 * the Ten Guardians and their Godbeasts, the Five Elements,
 * and the Seven Academy Houses.
 */

import type {
  IPAsset,
  IPAssetType,
  LicenseTerms,
  RegistrationReceipt,
  DerivativeRequest,
  IPRegistryConfig,
} from '../types';
import { STANDARD_LICENSE } from '../licensing/terms';

// ---------------------------------------------------------------------------
// Canonical Arcanea IP Assets
// ---------------------------------------------------------------------------

export interface CanonicalGuardian {
  name: string;
  gate: string;
  element: string;
  frequency: number;
  godbeast: string;
  domain: string;
}

export interface CanonicalCosmic {
  name: string;
  type: 'cosmic';
  description: string;
}

export const CANONICAL_ASSETS = {
  cosmic: [
    {
      name: 'Lumina',
      type: 'cosmic' as const,
      description: 'The First Light, Form-Giver, Creator',
    },
    {
      name: 'Nero',
      type: 'cosmic' as const,
      description:
        'The Primordial Darkness, Fertile Unknown, Father of Potential',
    },
  ],

  guardians: [
    {
      name: 'Lyssandria',
      gate: 'Foundation',
      element: 'Earth',
      frequency: 396,
      godbeast: 'Kaelith',
      domain: 'Earth, survival',
    },
    {
      name: 'Leyla',
      gate: 'Flow',
      element: 'Water',
      frequency: 417,
      godbeast: 'Veloura',
      domain: 'Creativity, emotion',
    },
    {
      name: 'Draconia',
      gate: 'Fire',
      element: 'Fire',
      frequency: 528,
      godbeast: 'Draconis',
      domain: 'Power, will',
    },
    {
      name: 'Maylinn',
      gate: 'Heart',
      element: 'Wind',
      frequency: 639,
      godbeast: 'Laeylinn',
      domain: 'Love, healing',
    },
    {
      name: 'Alera',
      gate: 'Voice',
      element: 'Wind',
      frequency: 741,
      godbeast: 'Otome',
      domain: 'Truth, expression',
    },
    {
      name: 'Lyria',
      gate: 'Sight',
      element: 'Void',
      frequency: 852,
      godbeast: 'Yumiko',
      domain: 'Intuition, vision',
    },
    {
      name: 'Aiyami',
      gate: 'Crown',
      element: 'Void',
      frequency: 963,
      godbeast: 'Sol',
      domain: 'Enlightenment',
    },
    {
      name: 'Elara',
      gate: 'Shift',
      element: 'Void',
      frequency: 1111,
      godbeast: 'Thessara',
      domain: 'Perspective',
    },
    {
      name: 'Ino',
      gate: 'Unity',
      element: 'Void',
      frequency: 963,
      godbeast: 'Kyuro',
      domain: 'Partnership',
    },
    {
      name: 'Shinkami',
      gate: 'Source',
      element: 'Void',
      frequency: 1111,
      godbeast: 'Amaterasu',
      domain: 'Meta-consciousness',
    },
  ],

  godbeasts: [
    { name: 'Kaelith', guardian: 'Lyssandria', element: 'Earth' },
    { name: 'Veloura', guardian: 'Leyla', element: 'Water' },
    { name: 'Draconis', guardian: 'Draconia', element: 'Fire' },
    { name: 'Laeylinn', guardian: 'Maylinn', element: 'Wind' },
    { name: 'Otome', guardian: 'Alera', element: 'Wind' },
    { name: 'Yumiko', guardian: 'Lyria', element: 'Void' },
    { name: 'Sol', guardian: 'Aiyami', element: 'Void' },
    { name: 'Thessara', guardian: 'Elara', element: 'Void' },
    { name: 'Kyuro', guardian: 'Ino', element: 'Void' },
    { name: 'Amaterasu', guardian: 'Shinkami', element: 'Void' },
  ],

  elements: ['Fire', 'Water', 'Earth', 'Wind', 'Void'] as const,

  houses: [
    'Lumina',
    'Nero',
    'Pyros',
    'Aqualis',
    'Terra',
    'Ventus',
    'Synthesis',
  ] as const,
} as const;

// ---------------------------------------------------------------------------
// In-memory registry (production would use Story Protocol SDK)
// ---------------------------------------------------------------------------

/** In-memory store for registered assets — keyed by asset ID */
const registeredAssets = new Map<string, IPAsset>();

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateAssetId(type: IPAssetType, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `arcanea-${type}-${slug}`;
}

// ---------------------------------------------------------------------------
// Uniqueness validation
// ---------------------------------------------------------------------------

/**
 * Check whether an asset with the given ID already exists.
 * Returns true if the asset is already registered.
 */
export function isRegistered(assetId: string): boolean {
  return registeredAssets.has(assetId);
}

/**
 * Check whether a name is already taken within a given asset type.
 */
export function isNameTaken(type: IPAssetType, name: string): boolean {
  const id = generateAssetId(type, name);
  return registeredAssets.has(id);
}

// ---------------------------------------------------------------------------
// Root asset registration
// ---------------------------------------------------------------------------

/**
 * Register a root (canonical) IP asset on-chain.
 *
 * Root assets are the foundational Arcanea IP: cosmic entities,
 * guardians, godbeasts, elements, and houses. They have no parent.
 */
export function registerRootAsset(params: {
  name: string;
  description: string;
  type: IPAssetType;
  creator: string;
  chain?: string;
  licenseTerms?: LicenseTerms;
  metadata?: Record<string, unknown>;
}): RegistrationReceipt {
  const {
    name,
    description,
    type,
    creator,
    chain = 'story',
    licenseTerms = STANDARD_LICENSE,
    metadata = {},
  } = params;

  const id = generateAssetId(type, name);

  // Uniqueness check
  if (registeredAssets.has(id)) {
    return {
      asset: registeredAssets.get(id)!,
      txHash: '',
      timestamp: new Date(),
      success: false,
      error: `Asset '${name}' of type '${type}' is already registered with ID '${id}'`,
    };
  }

  // Simulate on-chain transaction hash
  const txHash = `0x${Buffer.from(`${id}-${Date.now()}`).toString('hex').slice(0, 64)}`;

  const asset: IPAsset = {
    id,
    name,
    description,
    type,
    creator,
    chain,
    registrationTxHash: txHash,
    licenseTerms,
    metadata,
    derivatives: [],
    createdAt: new Date(),
  };

  registeredAssets.set(id, asset);

  return {
    asset,
    txHash,
    timestamp: asset.createdAt,
    success: true,
  };
}

// ---------------------------------------------------------------------------
// Derivative registration
// ---------------------------------------------------------------------------

/**
 * Register a derivative IP asset that extends an existing parent.
 *
 * Validates:
 * - Parent asset exists
 * - Parent allows derivatives
 * - Derivative name is unique
 * - Derivative depth does not exceed MAX_DEPTH (5)
 */
export function registerDerivative(
  request: DerivativeRequest,
): RegistrationReceipt {
  const { parentAssetId, creatorAddress, name, description, additionalTerms } =
    request;

  // Validate parent exists
  const parent = registeredAssets.get(parentAssetId);
  if (!parent) {
    return {
      asset: null as unknown as IPAsset,
      txHash: '',
      timestamp: new Date(),
      success: false,
      error: `Parent asset '${parentAssetId}' not found`,
    };
  }

  // Validate parent allows derivatives
  if (!parent.licenseTerms.derivativesAllowed) {
    return {
      asset: null as unknown as IPAsset,
      txHash: '',
      timestamp: new Date(),
      success: false,
      error: `Parent asset '${parentAssetId}' does not allow derivatives`,
    };
  }

  // Validate depth limit
  const depth = getDerivativeDepth(parentAssetId);
  if (depth >= MAX_DERIVATIVE_DEPTH) {
    return {
      asset: null as unknown as IPAsset,
      txHash: '',
      timestamp: new Date(),
      success: false,
      error: `Maximum derivative depth of ${MAX_DERIVATIVE_DEPTH} exceeded (parent is at depth ${depth})`,
    };
  }

  const id = generateAssetId('derivative', name);

  // Uniqueness check
  if (registeredAssets.has(id)) {
    return {
      asset: registeredAssets.get(id)!,
      txHash: '',
      timestamp: new Date(),
      success: false,
      error: `Derivative '${name}' is already registered with ID '${id}'`,
    };
  }

  // Merge parent license terms with any additional terms
  const licenseTerms: LicenseTerms = {
    ...parent.licenseTerms,
    ...additionalTerms,
    // Royalty can only go up for derivatives, never down
    royaltyPercentage: Math.max(
      parent.licenseTerms.royaltyPercentage,
      additionalTerms?.royaltyPercentage ?? 0,
    ),
  };

  const txHash = `0x${Buffer.from(`${id}-${Date.now()}`).toString('hex').slice(0, 64)}`;

  const asset: IPAsset = {
    id,
    name,
    description,
    type: 'derivative',
    parentId: parentAssetId,
    creator: creatorAddress,
    chain: parent.chain,
    registrationTxHash: txHash,
    licenseTerms,
    metadata: {
      parentName: parent.name,
      parentType: parent.type,
      derivativeDepth: depth + 1,
    },
    derivatives: [],
    createdAt: new Date(),
  };

  registeredAssets.set(id, asset);

  // Link child to parent
  parent.derivatives.push(id);

  return {
    asset,
    txHash,
    timestamp: asset.createdAt,
    success: true,
  };
}

// ---------------------------------------------------------------------------
// Bulk canonical registration
// ---------------------------------------------------------------------------

/**
 * Register all canonical Arcanea IP assets in a single batch.
 *
 * This registers:
 * - 2 Cosmic entities (Lumina, Nero)
 * - 10 Guardians
 * - 10 Godbeasts (linked to their Guardian parents)
 * - 5 Elements
 * - 7 Academy Houses
 *
 * Total: 34 root IP assets
 */
export function registerAllCanonicalAssets(
  creator: string,
  licenseTerms?: LicenseTerms,
): RegistrationReceipt[] {
  const receipts: RegistrationReceipt[] = [];
  const terms = licenseTerms ?? STANDARD_LICENSE;

  // Register cosmic entities
  for (const cosmic of CANONICAL_ASSETS.cosmic) {
    receipts.push(
      registerRootAsset({
        name: cosmic.name,
        description: cosmic.description,
        type: 'cosmic',
        creator,
        licenseTerms: terms,
        metadata: { category: 'cosmic-duality' },
      }),
    );
  }

  // Register guardians
  for (const guardian of CANONICAL_ASSETS.guardians) {
    receipts.push(
      registerRootAsset({
        name: guardian.name,
        description: `Guardian of the ${guardian.gate} Gate. Domain: ${guardian.domain}. Frequency: ${guardian.frequency}Hz. Bonded Godbeast: ${guardian.godbeast}.`,
        type: 'guardian',
        creator,
        licenseTerms: terms,
        metadata: {
          gate: guardian.gate,
          element: guardian.element,
          frequency: guardian.frequency,
          godbeast: guardian.godbeast,
          domain: guardian.domain,
        },
      }),
    );
  }

  // Register godbeasts
  for (const godbeast of CANONICAL_ASSETS.godbeasts) {
    receipts.push(
      registerRootAsset({
        name: godbeast.name,
        description: `Godbeast bonded to ${godbeast.guardian}. Elemental affinity: ${godbeast.element}.`,
        type: 'godbeast',
        creator,
        licenseTerms: terms,
        metadata: {
          guardian: godbeast.guardian,
          element: godbeast.element,
        },
      }),
    );
  }

  // Register elements
  for (const element of CANONICAL_ASSETS.elements) {
    receipts.push(
      registerRootAsset({
        name: element,
        description: `The ${element} element of Arcanea — one of the Five Elements that compose all creation.`,
        type: 'element',
        creator,
        licenseTerms: terms,
        metadata: { category: 'five-elements' },
      }),
    );
  }

  // Register houses
  for (const house of CANONICAL_ASSETS.houses) {
    receipts.push(
      registerRootAsset({
        name: `House ${house}`,
        description: `Academy House ${house} — one of the Seven Academy Houses of Arcanea.`,
        type: 'house',
        creator,
        licenseTerms: terms,
        metadata: { category: 'seven-houses' },
      }),
    );
  }

  return receipts;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Retrieve a registered asset by ID.
 */
export function getAsset(assetId: string): IPAsset | undefined {
  return registeredAssets.get(assetId);
}

/**
 * Retrieve all registered assets of a given type.
 */
export function getAssetsByType(type: IPAssetType): IPAsset[] {
  return Array.from(registeredAssets.values()).filter((a) => a.type === type);
}

/**
 * Retrieve all registered assets by a given creator.
 */
export function getAssetsByCreator(creator: string): IPAsset[] {
  return Array.from(registeredAssets.values()).filter(
    (a) => a.creator === creator,
  );
}

/**
 * Retrieve all derivatives of a given asset (direct children only).
 */
export function getDirectDerivatives(assetId: string): IPAsset[] {
  const asset = registeredAssets.get(assetId);
  if (!asset) return [];
  return asset.derivatives
    .map((id) => registeredAssets.get(id))
    .filter((a): a is IPAsset => a !== undefined);
}

/**
 * Get the total count of registered assets.
 */
export function getRegistrySize(): number {
  return registeredAssets.size;
}

// ---------------------------------------------------------------------------
// Depth calculation
// ---------------------------------------------------------------------------

/** Maximum depth for derivative chains */
export const MAX_DERIVATIVE_DEPTH = 5;

/**
 * Calculate the derivative depth of an asset.
 * Root assets have depth 0.
 */
export function getDerivativeDepth(assetId: string): number {
  let depth = 0;
  let current = registeredAssets.get(assetId);

  while (current?.parentId) {
    depth++;
    current = registeredAssets.get(current.parentId);
    // Safety: break if we detect a cycle (should never happen)
    if (depth > MAX_DERIVATIVE_DEPTH + 1) break;
  }

  return depth;
}

// ---------------------------------------------------------------------------
// Registry management (testing / admin)
// ---------------------------------------------------------------------------

/**
 * Clear all registered assets. Used for testing.
 */
export function clearRegistry(): void {
  registeredAssets.clear();
}
