/**
 * @arcanea/ip-registry — Registration & Derivative Tree Test Suite
 *
 * Comprehensive tests for IP asset registration, licensing, derivative
 * tree management, and royalty distribution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
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
  CANONICAL_ASSETS,
  MAX_DERIVATIVE_DEPTH,
} from '../src/register/assets';
import {
  STANDARD_LICENSE,
  PREMIUM_LICENSE,
  COMMUNITY_LICENSE,
  EXCLUSIVE_LICENSE,
  buildCustomLicense,
  validateLicenseTerms,
  isLicenseCompatible,
  getLicenseTypeName,
  getLicenseSummary,
} from '../src/licensing/terms';
import {
  buildDerivativeTree,
  getLineage,
  getRootAncestor,
  shareCommonAncestor,
  canCreateDerivative,
  calculateRoyaltyFlow,
  getTotalRoyaltyBurden,
  getTreeStats,
  flattenTree,
} from '../src/derivatives/tree';
import {
  recordSale,
  claimRoyalties,
  getRoyaltyBalance,
  getAllDistributions,
  getTotalPendingRoyalties,
  generateRoyaltyReport,
  estimateRoyalties,
  calculateNetProceeds,
  clearRoyaltyLedger,
} from '../src/royalties/distribution';
import type { LicenseTerms, DerivativeRequest } from '../src/types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearRegistry();
  clearRoyaltyLedger();
});

// ---------------------------------------------------------------------------
// Root Asset Registration
// ---------------------------------------------------------------------------

describe('Root Asset Registration', () => {
  it('should register a root asset successfully', () => {
    const receipt = registerRootAsset({
      name: 'Lumina',
      description: 'The First Light',
      type: 'cosmic',
      creator: 'arcanea-treasury',
    });

    expect(receipt.success).toBe(true);
    expect(receipt.asset.name).toBe('Lumina');
    expect(receipt.asset.type).toBe('cosmic');
    expect(receipt.txHash).toBeTruthy();
    expect(receipt.asset.derivatives).toEqual([]);
  });

  it('should reject duplicate registration', () => {
    registerRootAsset({
      name: 'Lumina',
      description: 'The First Light',
      type: 'cosmic',
      creator: 'arcanea-treasury',
    });

    const duplicate = registerRootAsset({
      name: 'Lumina',
      description: 'The First Light again',
      type: 'cosmic',
      creator: 'arcanea-treasury',
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.error).toContain('already registered');
  });

  it('should use standard license by default', () => {
    const receipt = registerRootAsset({
      name: 'Test Asset',
      description: 'Test',
      type: 'element',
      creator: 'creator-1',
    });

    expect(receipt.asset.licenseTerms).toEqual(STANDARD_LICENSE);
  });

  it('should accept custom license terms', () => {
    const receipt = registerRootAsset({
      name: 'Premium Asset',
      description: 'Premium',
      type: 'guardian',
      creator: 'creator-1',
      licenseTerms: PREMIUM_LICENSE,
    });

    expect(receipt.asset.licenseTerms.royaltyPercentage).toBe(10);
    expect(receipt.asset.licenseTerms.commercialUse).toBe(true);
  });

  it('should store metadata correctly', () => {
    const receipt = registerRootAsset({
      name: 'Draconia',
      description: 'Guardian of Fire',
      type: 'guardian',
      creator: 'arcanea-treasury',
      metadata: { gate: 'Fire', element: 'Fire', frequency: 528 },
    });

    expect(receipt.asset.metadata.gate).toBe('Fire');
    expect(receipt.asset.metadata.frequency).toBe(528);
  });

  it('should generate unique transaction hashes', () => {
    const receipt1 = registerRootAsset({
      name: 'Asset 1',
      description: 'First',
      type: 'element',
      creator: 'creator',
    });
    const receipt2 = registerRootAsset({
      name: 'Asset 2',
      description: 'Second',
      type: 'element',
      creator: 'creator',
    });

    expect(receipt1.txHash).not.toBe(receipt2.txHash);
  });

  it('should set default chain to story', () => {
    const receipt = registerRootAsset({
      name: 'Test',
      description: 'Test',
      type: 'element',
      creator: 'creator',
    });

    expect(receipt.asset.chain).toBe('story');
  });
});

// ---------------------------------------------------------------------------
// Canonical Asset Registration
// ---------------------------------------------------------------------------

describe('Canonical Asset Registration', () => {
  it('should register all 34 canonical assets', () => {
    const receipts = registerAllCanonicalAssets('arcanea-treasury');

    // 2 cosmic + 10 guardians + 10 godbeasts + 5 elements + 7 houses = 34
    expect(receipts).toHaveLength(34);
    expect(receipts.every((r) => r.success)).toBe(true);
  });

  it('should register all canonical assets with correct types', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    expect(getAssetsByType('cosmic')).toHaveLength(2);
    expect(getAssetsByType('guardian')).toHaveLength(10);
    expect(getAssetsByType('godbeast')).toHaveLength(10);
    expect(getAssetsByType('element')).toHaveLength(5);
    expect(getAssetsByType('house')).toHaveLength(7);
  });

  it('should register Lumina and Nero as cosmic entities', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    const cosmics = getAssetsByType('cosmic');
    const names = cosmics.map((a) => a.name);
    expect(names).toContain('Lumina');
    expect(names).toContain('Nero');
  });

  it('should register all 10 Guardians', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    const guardians = getAssetsByType('guardian');
    const names = guardians.map((a) => a.name);
    expect(names).toContain('Lyssandria');
    expect(names).toContain('Leyla');
    expect(names).toContain('Draconia');
    expect(names).toContain('Maylinn');
    expect(names).toContain('Alera');
    expect(names).toContain('Lyria');
    expect(names).toContain('Aiyami');
    expect(names).toContain('Elara');
    expect(names).toContain('Ino');
    expect(names).toContain('Shinkami');
  });

  it('should register all 10 Godbeasts', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    const godbeasts = getAssetsByType('godbeast');
    const names = godbeasts.map((a) => a.name);
    expect(names).toContain('Kaelith');
    expect(names).toContain('Draconis');
    expect(names).toContain('Amaterasu');
  });

  it('should register all 5 Elements', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    const elements = getAssetsByType('element');
    const names = elements.map((a) => a.name);
    expect(names).toContain('Fire');
    expect(names).toContain('Water');
    expect(names).toContain('Earth');
    expect(names).toContain('Wind');
    expect(names).toContain('Void');
  });

  it('should register all 7 Houses', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    const houses = getAssetsByType('house');
    expect(houses).toHaveLength(7);
  });

  it('should set the treasury as creator for all canonical assets', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    const all = getAssetsByCreator('arcanea-treasury');
    expect(all).toHaveLength(34);
  });

  it('should include guardian metadata (gate, element, frequency)', () => {
    registerAllCanonicalAssets('arcanea-treasury');

    const guardians = getAssetsByType('guardian');
    const draconia = guardians.find((g) => g.name === 'Draconia');
    expect(draconia).toBeDefined();
    expect(draconia!.metadata.gate).toBe('Fire');
    expect(draconia!.metadata.element).toBe('Fire');
    expect(draconia!.metadata.frequency).toBe(528);
    expect(draconia!.metadata.godbeast).toBe('Draconis');
  });

  it('should not allow re-registration of canonical assets', () => {
    registerAllCanonicalAssets('arcanea-treasury');
    const secondRun = registerAllCanonicalAssets('arcanea-treasury');

    expect(secondRun.every((r) => !r.success)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Derivative Registration
// ---------------------------------------------------------------------------

describe('Derivative Registration', () => {
  it('should register a derivative of an existing asset', () => {
    const parent = registerRootAsset({
      name: 'Draconia',
      description: 'Guardian of Fire',
      type: 'guardian',
      creator: 'arcanea-treasury',
    });

    const derivative = registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-1',
      name: 'Draconia Fan Art',
      description: 'Fan art of Draconia',
    });

    expect(derivative.success).toBe(true);
    expect(derivative.asset.parentId).toBe(parent.asset.id);
    expect(derivative.asset.type).toBe('derivative');
  });

  it('should link derivative to parent', () => {
    const parent = registerRootAsset({
      name: 'Lyria',
      description: 'Guardian of Sight',
      type: 'guardian',
      creator: 'arcanea-treasury',
    });

    const derivative = registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-1',
      name: 'Lyria Remix',
      description: 'Remix',
    });

    const parentAsset = getAsset(parent.asset.id);
    expect(parentAsset!.derivatives).toContain(derivative.asset.id);
  });

  it('should fail when parent does not exist', () => {
    const result = registerDerivative({
      parentAssetId: 'non-existent-id',
      creatorAddress: 'user-1',
      name: 'Orphan',
      description: 'No parent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail when parent does not allow derivatives', () => {
    const parent = registerRootAsset({
      name: 'Exclusive Art',
      description: 'Exclusive',
      type: 'lore',
      creator: 'arcanea-treasury',
      licenseTerms: EXCLUSIVE_LICENSE, // no derivatives allowed
    });

    const result = registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-1',
      name: 'Unauthorized Remix',
      description: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not allow derivatives');
  });

  it('should enforce maximum derivative depth', () => {
    // Create a chain of derivatives up to MAX_DERIVATIVE_DEPTH
    let parentId = registerRootAsset({
      name: 'Root',
      description: 'Root asset',
      type: 'lore',
      creator: 'creator-0',
    }).asset.id;

    for (let i = 1; i <= MAX_DERIVATIVE_DEPTH; i++) {
      const result = registerDerivative({
        parentAssetId: parentId,
        creatorAddress: `creator-${i}`,
        name: `Derivative Level ${i}`,
        description: `Level ${i}`,
      });
      expect(result.success).toBe(true);
      parentId = result.asset.id;
    }

    // One more should fail
    const tooDeep = registerDerivative({
      parentAssetId: parentId,
      creatorAddress: 'creator-too-deep',
      name: 'Too Deep',
      description: 'Should fail',
    });

    expect(tooDeep.success).toBe(false);
    expect(tooDeep.error).toContain('depth');
  });

  it('should inherit parent license terms by default', () => {
    const parent = registerRootAsset({
      name: 'Parent',
      description: 'Parent',
      type: 'lore',
      creator: 'creator-1',
      licenseTerms: PREMIUM_LICENSE,
    });

    const derivative = registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-1',
      name: 'Child',
      description: 'Child',
    });

    expect(derivative.asset.licenseTerms.royaltyPercentage).toBe(
      PREMIUM_LICENSE.royaltyPercentage,
    );
  });

  it('should enforce that derivative royalty can only go up', () => {
    const parent = registerRootAsset({
      name: 'Parent',
      description: 'Parent',
      type: 'lore',
      creator: 'creator-1',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 5 },
    });

    const derivative = registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-1',
      name: 'Child',
      description: 'Child',
      additionalTerms: { royaltyPercentage: 3 }, // Trying to lower
    });

    // Should still be 5% (the parent minimum)
    expect(derivative.asset.licenseTerms.royaltyPercentage).toBe(5);
  });

  it('should store derivative metadata with parent info', () => {
    const parent = registerRootAsset({
      name: 'Draconia',
      description: 'Guardian',
      type: 'guardian',
      creator: 'arcanea-treasury',
    });

    const derivative = registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-1',
      name: 'Draconia Sketch',
      description: 'A sketch',
    });

    expect(derivative.asset.metadata.parentName).toBe('Draconia');
    expect(derivative.asset.metadata.parentType).toBe('guardian');
    expect(derivative.asset.metadata.derivativeDepth).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

describe('Registry Lookups', () => {
  it('should find asset by ID', () => {
    const receipt = registerRootAsset({
      name: 'FindMe',
      description: 'Find me',
      type: 'element',
      creator: 'creator',
    });

    const found = getAsset(receipt.asset.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('FindMe');
  });

  it('should return undefined for non-existent ID', () => {
    expect(getAsset('nope')).toBeUndefined();
  });

  it('should find direct derivatives', () => {
    const parent = registerRootAsset({
      name: 'Parent',
      description: 'Parent',
      type: 'lore',
      creator: 'creator',
    });

    registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-1',
      name: 'Child 1',
      description: 'C1',
    });
    registerDerivative({
      parentAssetId: parent.asset.id,
      creatorAddress: 'user-2',
      name: 'Child 2',
      description: 'C2',
    });

    const derivatives = getDirectDerivatives(parent.asset.id);
    expect(derivatives).toHaveLength(2);
  });

  it('should track registry size', () => {
    expect(getRegistrySize()).toBe(0);

    registerRootAsset({
      name: 'A',
      description: 'A',
      type: 'element',
      creator: 'c',
    });
    expect(getRegistrySize()).toBe(1);

    registerRootAsset({
      name: 'B',
      description: 'B',
      type: 'element',
      creator: 'c',
    });
    expect(getRegistrySize()).toBe(2);
  });

  it('should check registration status', () => {
    const receipt = registerRootAsset({
      name: 'Registered',
      description: 'R',
      type: 'element',
      creator: 'c',
    });

    expect(isRegistered(receipt.asset.id)).toBe(true);
    expect(isRegistered('non-existent')).toBe(false);
  });

  it('should check name taken', () => {
    registerRootAsset({
      name: 'TakenName',
      description: 'T',
      type: 'element',
      creator: 'c',
    });

    expect(isNameTaken('element', 'TakenName')).toBe(true);
    expect(isNameTaken('element', 'AvailableName')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// License Terms
// ---------------------------------------------------------------------------

describe('License Terms', () => {
  it('should have correct standard license defaults', () => {
    expect(STANDARD_LICENSE.royaltyPercentage).toBe(5);
    expect(STANDARD_LICENSE.derivativesAllowed).toBe(true);
    expect(STANDARD_LICENSE.attributionRequired).toBe(true);
    expect(STANDARD_LICENSE.commercialUse).toBe(false);
    expect(STANDARD_LICENSE.duration).toBe('perpetual');
    expect(STANDARD_LICENSE.revocable).toBe(false);
  });

  it('should have correct premium license defaults', () => {
    expect(PREMIUM_LICENSE.royaltyPercentage).toBe(10);
    expect(PREMIUM_LICENSE.commercialUse).toBe(true);
    expect(PREMIUM_LICENSE.derivativesAllowed).toBe(true);
  });

  it('should have correct community license defaults', () => {
    expect(COMMUNITY_LICENSE.royaltyPercentage).toBe(2.5);
    expect(COMMUNITY_LICENSE.derivativesAllowed).toBe(true);
    expect(COMMUNITY_LICENSE.commercialUse).toBe(false);
  });

  it('should have correct exclusive license defaults', () => {
    expect(EXCLUSIVE_LICENSE.royaltyPercentage).toBe(15);
    expect(EXCLUSIVE_LICENSE.derivativesAllowed).toBe(false);
    expect(EXCLUSIVE_LICENSE.commercialUse).toBe(true);
    expect(EXCLUSIVE_LICENSE.revocable).toBe(true);
  });

  it('should build custom license with overrides', () => {
    const custom = buildCustomLicense(STANDARD_LICENSE, {
      royaltyPercentage: 7.5,
    });

    expect(custom.royaltyPercentage).toBe(7.5);
    expect(custom.derivativesAllowed).toBe(true); // inherited
  });

  it('should reject invalid royalty percentage', () => {
    expect(() =>
      buildCustomLicense(STANDARD_LICENSE, { royaltyPercentage: 150 }),
    ).toThrow();
  });

  it('should reject non-commercial license with commercial use', () => {
    expect(() =>
      buildCustomLicense(STANDARD_LICENSE, { commercialUse: true }),
    ).toThrow();
  });

  it('should validate license terms', () => {
    const errors = validateLicenseTerms(STANDARD_LICENSE);
    expect(errors).toHaveLength(0);
  });

  it('should catch exclusive with derivatives allowed', () => {
    const errors = validateLicenseTerms({
      ...EXCLUSIVE_LICENSE,
      derivativesAllowed: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should check license compatibility', () => {
    // Standard allows derivatives, so a derivative with higher royalty is compatible
    expect(
      isLicenseCompatible(STANDARD_LICENSE, {
        ...STANDARD_LICENSE,
        royaltyPercentage: 10,
      }),
    ).toBe(true);

    // Lower royalty is not compatible
    expect(
      isLicenseCompatible(STANDARD_LICENSE, {
        ...STANDARD_LICENSE,
        royaltyPercentage: 2,
      }),
    ).toBe(false);

    // Exclusive does not allow derivatives
    expect(isLicenseCompatible(EXCLUSIVE_LICENSE, STANDARD_LICENSE)).toBe(
      false,
    );
  });

  it('should generate human-readable license names', () => {
    expect(getLicenseTypeName('commercial')).toContain('Commercial');
    expect(getLicenseTypeName('non-commercial')).toContain('Non-Commercial');
    expect(getLicenseTypeName('exclusive')).toContain('Exclusive');
  });

  it('should generate license summary', () => {
    const summary = getLicenseSummary(STANDARD_LICENSE);
    expect(summary).toContain('5%');
    expect(summary).toContain('derivatives allowed');
    expect(summary).toContain('perpetual');
  });
});

// ---------------------------------------------------------------------------
// Derivative Tree
// ---------------------------------------------------------------------------

describe('Derivative Tree', () => {
  it('should build a tree from root asset', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'Root',
      type: 'lore',
      creator: 'creator',
    });

    const tree = buildDerivativeTree(root.asset.id);
    expect(tree).not.toBeNull();
    expect(tree!.asset.name).toBe('Root');
    expect(tree!.depth).toBe(0);
    expect(tree!.children).toHaveLength(0);
  });

  it('should include children in the tree', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'Root',
      type: 'lore',
      creator: 'creator',
    });

    registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'user-1',
      name: 'Child 1',
      description: 'C1',
    });
    registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'user-2',
      name: 'Child 2',
      description: 'C2',
    });

    const tree = buildDerivativeTree(root.asset.id);
    expect(tree!.children).toHaveLength(2);
    expect(tree!.children[0].depth).toBe(1);
    expect(tree!.children[1].depth).toBe(1);
  });

  it('should return null for non-existent asset', () => {
    expect(buildDerivativeTree('non-existent')).toBeNull();
  });

  it('should get lineage from derivative to root', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'c',
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'u1',
      name: 'Child',
      description: 'C',
    });
    const grandchild = registerDerivative({
      parentAssetId: child.asset.id,
      creatorAddress: 'u2',
      name: 'Grandchild',
      description: 'GC',
    });

    const lineage = getLineage(grandchild.asset.id);
    expect(lineage).toHaveLength(3);
    expect(lineage[0].name).toBe('Grandchild');
    expect(lineage[1].name).toBe('Child');
    expect(lineage[2].name).toBe('Root');
  });

  it('should get root ancestor', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'c',
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'u1',
      name: 'Child',
      description: 'C',
    });

    const rootAncestor = getRootAncestor(child.asset.id);
    expect(rootAncestor!.name).toBe('Root');
  });

  it('should detect shared ancestry', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'c',
    });
    const child1 = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'u1',
      name: 'Child 1',
      description: 'C1',
    });
    const child2 = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'u2',
      name: 'Child 2',
      description: 'C2',
    });

    expect(shareCommonAncestor(child1.asset.id, child2.asset.id)).toBe(true);
  });

  it('should validate derivative permission', () => {
    const allowed = registerRootAsset({
      name: 'Allowed',
      description: 'A',
      type: 'lore',
      creator: 'c',
    });
    const blocked = registerRootAsset({
      name: 'Blocked',
      description: 'B',
      type: 'lore',
      creator: 'c',
      licenseTerms: EXCLUSIVE_LICENSE,
    });

    expect(canCreateDerivative(allowed.asset.id).allowed).toBe(true);
    expect(canCreateDerivative(blocked.asset.id).allowed).toBe(false);
    expect(canCreateDerivative('non-existent').allowed).toBe(false);
  });

  it('should calculate royalty flow along the tree', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'root-creator',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 5 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'child-creator',
      name: 'Child',
      description: 'C',
    });

    const flow = calculateRoyaltyFlow(child.asset.id);
    expect(flow.length).toBe(1);
    expect(flow[0].creator).toBe('root-creator');
    expect(flow[0].percentage).toBeGreaterThan(0);
  });

  it('should calculate total royalty burden', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'root',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'child',
      name: 'Child',
      description: 'C',
    });

    const burden = getTotalRoyaltyBurden(child.asset.id);
    expect(burden).toBeGreaterThan(0);
  });

  it('should produce tree stats', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'c',
    });
    registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'u1',
      name: 'C1',
      description: 'C1',
    });
    registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'u2',
      name: 'C2',
      description: 'C2',
    });

    const stats = getTreeStats(root.asset.id);
    expect(stats).not.toBeNull();
    expect(stats!.totalNodes).toBe(3);
    expect(stats!.maxDepth).toBe(1);
    expect(stats!.leafCount).toBe(2);
    expect(stats!.uniqueCreators).toBe(3); // root + 2 children
  });

  it('should flatten tree for visualization', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'c',
    });
    registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'u1',
      name: 'Child',
      description: 'C',
    });

    const flat = flattenTree(root.asset.id);
    expect(flat).toHaveLength(2);
    expect(flat[0].name).toBe('Root');
    expect(flat[0].depth).toBe(0);
    expect(flat[1].depth).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Royalty Distribution
// ---------------------------------------------------------------------------

describe('Royalty Distribution', () => {
  it('should record a sale and distribute royalties', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'root-creator',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'child-creator',
      name: 'Child',
      description: 'C',
    });

    const distributions = recordSale(child.asset.id, 1000000n);
    expect(distributions.length).toBeGreaterThan(0);

    const rootBalance = getRoyaltyBalance('root-creator');
    expect(rootBalance).not.toBeNull();
    expect(rootBalance!.pending).toBeGreaterThan(0n);
  });

  it('should accumulate royalties from multiple sales', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'root-creator',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'child-creator',
      name: 'Child',
      description: 'C',
    });

    recordSale(child.asset.id, 1000000n);
    recordSale(child.asset.id, 2000000n);

    const balance = getRoyaltyBalance('root-creator');
    // Second sale should add more to the balance
    expect(balance!.earned).toBeGreaterThan(0n);
  });

  it('should allow claiming pending royalties', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'root-creator',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'child-creator',
      name: 'Child',
      description: 'C',
    });

    recordSale(child.asset.id, 1000000n);

    const beforeClaim = getRoyaltyBalance('root-creator')!;
    const pendingBefore = beforeClaim.pending;

    const result = claimRoyalties('root-creator');
    expect(result.claimed).toBe(pendingBefore);
    expect(result.remaining).toBe(0n);

    const afterClaim = getRoyaltyBalance('root-creator')!;
    expect(afterClaim.pending).toBe(0n);
    expect(afterClaim.claimed).toBe(pendingBefore);
  });

  it('should allow partial claims', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'root-creator',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'child-creator',
      name: 'Child',
      description: 'C',
    });

    recordSale(child.asset.id, 1000000n);

    const pending = getRoyaltyBalance('root-creator')!.pending;
    const halfClaim = pending / 2n;

    const result = claimRoyalties('root-creator', halfClaim);
    expect(result.claimed).toBe(halfClaim);
    expect(result.remaining).toBe(pending - halfClaim);
  });

  it('should return zero for claim with no balance', () => {
    const result = claimRoyalties('nobody');
    expect(result.claimed).toBe(0n);
    expect(result.remaining).toBe(0n);
  });

  it('should calculate total pending royalties', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'creator-1',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'creator-2',
      name: 'Child',
      description: 'C',
    });

    recordSale(child.asset.id, 1000000n);

    const total = getTotalPendingRoyalties();
    expect(total).toBeGreaterThan(0n);
  });

  it('should estimate royalties without recording', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'creator-1',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'creator-2',
      name: 'Child',
      description: 'C',
    });

    const estimates = estimateRoyalties(child.asset.id, 1000000n);
    expect(estimates.length).toBeGreaterThan(0);
    expect(estimates[0].amount).toBeGreaterThan(0n);

    // Estimating should not create any balance entries
    expect(getRoyaltyBalance('creator-1')).toBeNull();
  });

  it('should calculate net proceeds after royalties', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'creator-1',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'creator-2',
      name: 'Child',
      description: 'C',
    });

    const saleAmount = 1000000n;
    const net = calculateNetProceeds(child.asset.id, saleAmount);
    expect(net).toBeLessThan(saleAmount);
    expect(net).toBeGreaterThan(0n);
  });

  it('should generate royalty report', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'creator-1',
      licenseTerms: { ...STANDARD_LICENSE, royaltyPercentage: 10 },
    });
    const child = registerDerivative({
      parentAssetId: root.asset.id,
      creatorAddress: 'creator-2',
      name: 'Child',
      description: 'C',
    });

    recordSale(child.asset.id, 1000000n);

    const report = generateRoyaltyReport(root.asset.id);
    expect(report.rootAssetId).toBe(root.asset.id);
    expect(report.totalEarned).toBeGreaterThan(0n);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it('should throw on recording sale for non-existent asset', () => {
    expect(() => recordSale('non-existent', 1000000n)).toThrow();
  });

  it('should handle root asset sales (no royalty flow)', () => {
    const root = registerRootAsset({
      name: 'Root',
      description: 'R',
      type: 'lore',
      creator: 'creator',
    });

    // Root assets have no parent, so no royalty distribution
    const distributions = recordSale(root.asset.id, 1000000n);
    expect(distributions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Canonical Data Constants
// ---------------------------------------------------------------------------

describe('Canonical Data Constants', () => {
  it('should have 2 cosmic entities in CANONICAL_ASSETS', () => {
    expect(CANONICAL_ASSETS.cosmic).toHaveLength(2);
  });

  it('should have 10 guardians in CANONICAL_ASSETS', () => {
    expect(CANONICAL_ASSETS.guardians).toHaveLength(10);
  });

  it('should have 10 godbeasts in CANONICAL_ASSETS', () => {
    expect(CANONICAL_ASSETS.godbeasts).toHaveLength(10);
  });

  it('should have 5 elements in CANONICAL_ASSETS', () => {
    expect(CANONICAL_ASSETS.elements).toHaveLength(5);
  });

  it('should have 7 houses in CANONICAL_ASSETS', () => {
    expect(CANONICAL_ASSETS.houses).toHaveLength(7);
  });

  it('should have correct guardian frequencies', () => {
    const freqMap: Record<string, number> = {
      Lyssandria: 396,
      Leyla: 417,
      Draconia: 528,
      Maylinn: 639,
      Alera: 741,
      Lyria: 852,
      Aiyami: 963,
      Elara: 1111,
      Ino: 963,
      Shinkami: 1111,
    };

    for (const guardian of CANONICAL_ASSETS.guardians) {
      expect(guardian.frequency).toBe(freqMap[guardian.name]);
    }
  });

  it('should have correct guardian-godbeast pairings', () => {
    const pairings: Record<string, string> = {
      Lyssandria: 'Kaelith',
      Leyla: 'Veloura',
      Draconia: 'Draconis',
      Maylinn: 'Laeylinn',
      Alera: 'Otome',
      Lyria: 'Yumiko',
      Aiyami: 'Sol',
      Elara: 'Thessara',
      Ino: 'Kyuro',
      Shinkami: 'Amaterasu',
    };

    for (const guardian of CANONICAL_ASSETS.guardians) {
      expect(guardian.godbeast).toBe(pairings[guardian.name]);
    }
  });
});
