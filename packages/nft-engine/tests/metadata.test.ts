/**
 * @arcanea/nft-engine — Metadata Test Suite
 *
 * Comprehensive tests for metadata building, validation, and
 * canon compliance checking across all Arcanea NFT types.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMetadata,
  createGuardianMetadata,
  getRankFromGateLevel,
  buildAttributes,
} from '../src/metadata/builder';
import { validateMetadata, validateBatch } from '../src/metadata/validator';
import { checkCanonCompliance } from '../src/quality/canon-checker';
import type { ArcaneanAttributes, NFTMetadata, Guardian } from '../src/types';
import { GATE_FREQUENCIES, GUARDIAN_ELEMENTS, GUARDIAN_GODBEASTS } from '../src/types';

// ---------------------------------------------------------------------------
// Metadata Builder
// ---------------------------------------------------------------------------

describe('Metadata Builder', () => {
  it('should create valid Guardian metadata for all 10 Guardians', () => {
    const guardians: Guardian[] = [
      'lyssandria',
      'leyla',
      'draconia',
      'maylinn',
      'alera',
      'lyria',
      'aiyami',
      'elara',
      'ino',
      'shinkami',
    ];

    for (const g of guardians) {
      const metadata = createGuardianMetadata(g, 'ipfs://test');
      expect(metadata.name).toContain(g.charAt(0).toUpperCase());
      expect(metadata.arcanean.rank).toBe('luminor');
      expect(metadata.arcanean.gateLevel).toBe(10);
    }
  });

  it('should correctly map gate levels to ranks', () => {
    expect(getRankFromGateLevel(0)).toBe('apprentice');
    expect(getRankFromGateLevel(1)).toBe('apprentice');
    expect(getRankFromGateLevel(2)).toBe('apprentice');
    expect(getRankFromGateLevel(3)).toBe('mage');
    expect(getRankFromGateLevel(4)).toBe('mage');
    expect(getRankFromGateLevel(5)).toBe('master');
    expect(getRankFromGateLevel(6)).toBe('master');
    expect(getRankFromGateLevel(7)).toBe('archmage');
    expect(getRankFromGateLevel(8)).toBe('archmage');
    expect(getRankFromGateLevel(9)).toBe('luminor');
    expect(getRankFromGateLevel(10)).toBe('luminor');
  });

  it('should build correct attributes array', () => {
    const attrs = buildAttributes({
      element: 'fire',
      guardian: 'draconia',
      rank: 'luminor',
      house: 'pyros',
      gateLevel: 10,
      frequency: 528,
      tier: 'legendary',
      godbeast: 'draconis',
    });

    expect(attrs.find((a) => a.trait_type === 'Element')?.value).toBe('Fire');
    expect(attrs.find((a) => a.trait_type === 'Guardian')?.value).toBe(
      'Draconia',
    );
    expect(attrs.find((a) => a.trait_type === 'Godbeast')?.value).toBe(
      'Draconis',
    );
    expect(attrs.find((a) => a.trait_type === 'Rank')?.value).toBe('Luminor');
    expect(attrs.find((a) => a.trait_type === 'House')?.value).toBe('Pyros');
    expect(attrs.find((a) => a.trait_type === 'Gate Level')?.value).toBe(10);
    expect(attrs.find((a) => a.trait_type === 'Frequency')?.value).toBe(528);
    expect(attrs.find((a) => a.trait_type === 'Tier')?.value).toBe(
      'Legendary',
    );
  });

  it('should include soulbound attribute when set', () => {
    const attrs = buildAttributes({
      element: 'earth',
      guardian: 'lyssandria',
      rank: 'apprentice',
      house: 'terra',
      gateLevel: 1,
      frequency: 396,
      tier: 'common',
      soulbound: true,
    });

    expect(attrs.find((a) => a.trait_type === 'Soulbound')?.value).toBe('Yes');
  });

  it('should include evolves attribute when set', () => {
    const attrs = buildAttributes({
      element: 'fire',
      guardian: 'draconia',
      rank: 'mage',
      house: 'pyros',
      gateLevel: 3,
      frequency: 528,
      tier: 'rare',
      evolves: true,
    });

    expect(attrs.find((a) => a.trait_type === 'Evolves')?.value).toBe('Yes');
  });

  it('should not include godbeast attribute when not set', () => {
    const attrs = buildAttributes({
      element: 'fire',
      guardian: 'draconia',
      rank: 'luminor',
      house: 'pyros',
      gateLevel: 10,
      frequency: 528,
      tier: 'epic',
    });

    expect(attrs.find((a) => a.trait_type === 'Godbeast')).toBeUndefined();
  });

  it('should set correct canonical values for each Guardian', () => {
    const guardians: Guardian[] = [
      'lyssandria',
      'leyla',
      'draconia',
      'maylinn',
      'alera',
      'lyria',
      'aiyami',
      'elara',
      'ino',
      'shinkami',
    ];

    for (const g of guardians) {
      const metadata = createGuardianMetadata(g, 'ipfs://test');
      expect(metadata.arcanean.element).toBe(GUARDIAN_ELEMENTS[g]);
      expect(metadata.arcanean.godbeast).toBe(GUARDIAN_GODBEASTS[g]);
      expect(metadata.arcanean.frequency).toBe(GATE_FREQUENCIES[g]);
    }
  });

  it('should default to epic tier for Guardian metadata', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    expect(metadata.arcanean.tier).toBe('epic');
  });

  it('should allow overriding Guardian tier', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test', 'legendary');
    expect(metadata.arcanean.tier).toBe('legendary');
    // Legendary should not evolve
    expect(metadata.arcanean.evolves).toBe(false);
  });

  it('should set evolves to true for non-legendary tiers', () => {
    const epicMeta = createGuardianMetadata('draconia', 'ipfs://test', 'epic');
    expect(epicMeta.arcanean.evolves).toBe(true);

    const rareMeta = createGuardianMetadata('draconia', 'ipfs://test', 'rare');
    expect(rareMeta.arcanean.evolves).toBe(true);
  });

  it('should set external_url to arcanea.ai by default', () => {
    const metadata = buildMetadata({
      name: 'Test',
      description: 'Test description',
      imageUri: 'ipfs://test',
      arcanean: {
        element: 'fire',
        guardian: 'draconia',
        rank: 'luminor',
        house: 'pyros',
        gateLevel: 10,
        frequency: 528,
        tier: 'epic',
      },
    });

    expect(metadata.external_url).toBe('https://arcanea.ai');
  });

  it('should include properties with creator data', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    expect(metadata.properties).toBeDefined();
    expect(metadata.properties?.category).toBe('image');
  });

  it('should generate unique names for each Guardian', () => {
    const names = new Set<string>();
    const guardians: Guardian[] = [
      'lyssandria',
      'leyla',
      'draconia',
      'maylinn',
      'alera',
      'lyria',
      'aiyami',
      'elara',
      'ino',
      'shinkami',
    ];

    for (const g of guardians) {
      const metadata = createGuardianMetadata(g, 'ipfs://test');
      names.add(metadata.name);
    }

    expect(names.size).toBe(10);
  });

  it('should include Gate name in Guardian metadata name', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    expect(metadata.name).toContain('Fire');
    expect(metadata.name).toContain('Gate');
  });
});

// ---------------------------------------------------------------------------
// Metadata Validator
// ---------------------------------------------------------------------------

describe('Metadata Validator', () => {
  it('should validate correct metadata', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://Qm...');
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate all 10 Guardian metadata objects', () => {
    const guardians: Guardian[] = [
      'lyssandria',
      'leyla',
      'draconia',
      'maylinn',
      'alera',
      'lyria',
      'aiyami',
      'elara',
      'ino',
      'shinkami',
    ];

    for (const g of guardians) {
      const metadata = createGuardianMetadata(g, 'ipfs://Qm...');
      const result = validateMetadata(metadata);
      expect(result.valid).toBe(true);
    }
  });

  it('should catch gate level out of range', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.gateLevel = 15;
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Gate level'))).toBe(true);
  });

  it('should catch negative gate level', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.gateLevel = -1;
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
  });

  it('should catch rank-gate inconsistency', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.gateLevel = 3;
    metadata.arcanean.rank = 'luminor'; // should be 'mage'
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
  });

  it('should catch frequency mismatch', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.frequency = 999;
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
  });

  it('should catch godbeast mismatch', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.godbeast = 'kaelith'; // wrong — should be draconis
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
  });

  it('should catch missing name', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.name = '';
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Name'))).toBe(true);
  });

  it('should catch missing description', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.description = '';
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
  });

  it('should catch missing image URI', () => {
    const metadata = createGuardianMetadata('draconia', '');
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
  });

  it('should catch invalid image URI format', () => {
    const metadata = createGuardianMetadata('draconia', 'not-a-valid-uri');
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid image URI'))).toBe(
      true,
    );
  });

  it('should accept ipfs:// URIs', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://QmTest123');
    const result = validateMetadata(metadata);
    expect(result.errors.some((e) => e.includes('URI'))).toBe(false);
  });

  it('should accept ar:// URIs', () => {
    const metadata = createGuardianMetadata('draconia', 'ar://test123');
    const result = validateMetadata(metadata);
    expect(result.errors.some((e) => e.includes('URI'))).toBe(false);
  });

  it('should accept https:// URIs', () => {
    const metadata = createGuardianMetadata(
      'draconia',
      'https://arweave.net/test',
    );
    const result = validateMetadata(metadata);
    expect(result.errors.some((e) => e.includes('URI'))).toBe(false);
  });

  it('should warn about element mismatch', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.element = 'water'; // wrong — should be fire
    const result = validateMetadata(metadata);
    // Element mismatch is a warning, not an error
    expect(result.warnings.some((w) => w.includes('element'))).toBe(true);
  });

  it('should warn about soulbound on non-common tier', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.soulbound = true;
    const result = validateMetadata(metadata);
    expect(result.warnings.some((w) => w.includes('Soulbound'))).toBe(true);
  });

  it('should error on legendary tier with evolves', () => {
    const metadata = createGuardianMetadata(
      'draconia',
      'ipfs://test',
      'legendary',
    );
    metadata.arcanean.evolves = true;
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Legendary'))).toBe(true);
  });

  it('should validate batch of metadata', () => {
    const batch = [
      createGuardianMetadata('draconia', 'ipfs://1'),
      createGuardianMetadata('lyria', 'ipfs://2'),
      createGuardianMetadata('maylinn', 'ipfs://3'),
    ];
    const result = validateBatch(batch);
    expect(result.total).toBe(3);
    expect(result.valid).toBe(3);
    expect(result.invalid).toBe(0);
  });

  it('should report invalid items in batch', () => {
    const valid = createGuardianMetadata('draconia', 'ipfs://1');
    const invalid = createGuardianMetadata('lyria', 'ipfs://2');
    invalid.arcanean.gateLevel = 99; // invalid

    const result = validateBatch([valid, invalid]);
    expect(result.total).toBe(2);
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);
  });

  it('should handle empty batch', () => {
    const result = validateBatch([]);
    expect(result.total).toBe(0);
    expect(result.valid).toBe(0);
    expect(result.invalid).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Canon Compliance Checker
// ---------------------------------------------------------------------------

describe('Canon Compliance Checker', () => {
  it('should give S grade for fully canonical metadata', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://Qm...');
    const result = checkCanonCompliance(metadata);
    expect(result.grade).toBe('S');
    expect(result.canonCompliant).toBe(true);
  });

  it('should give S grade for all 10 canonical Guardians', () => {
    const guardians: Guardian[] = [
      'lyssandria',
      'leyla',
      'draconia',
      'maylinn',
      'alera',
      'lyria',
      'aiyami',
      'elara',
      'ino',
      'shinkami',
    ];

    for (const g of guardians) {
      const metadata = createGuardianMetadata(g, 'ipfs://Qm...');
      const result = checkCanonCompliance(metadata);
      expect(result.grade).toBe('S');
      expect(result.canonCompliant).toBe(true);
    }
  });

  it('should fail on wrong godbeast pairing', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.godbeast = 'kaelith'; // wrong — should be draconis
    const result = checkCanonCompliance(metadata);
    expect(
      result.checks.find((c) => c.name === 'Guardian-Godbeast Pairing')
        ?.passed,
    ).toBe(false);
  });

  it('should fail on wrong frequency', () => {
    const metadata = createGuardianMetadata('lyria', 'ipfs://test');
    metadata.arcanean.frequency = 396; // wrong — should be 852
    const result = checkCanonCompliance(metadata);
    expect(
      result.checks.find((c) => c.name === 'Frequency Alignment')?.passed,
    ).toBe(false);
  });

  it('should catch Nero-is-evil anti-canon', () => {
    const metadata = createGuardianMetadata('shinkami', 'ipfs://test');
    metadata.description = 'Nero is evil and must be destroyed';
    const result = checkCanonCompliance(metadata);
    expect(
      result.checks.find((c) => c.name === 'Cosmic Duality Respect')?.passed,
    ).toBe(false);
  });

  it('should catch darkness-is-evil anti-canon', () => {
    const metadata = createGuardianMetadata('shinkami', 'ipfs://test');
    metadata.description = 'Darkness is evil and must be purged';
    const result = checkCanonCompliance(metadata);
    expect(
      result.checks.find((c) => c.name === 'Cosmic Duality Respect')?.passed,
    ).toBe(false);
  });

  it('should pass Cosmic Duality check for proper descriptions', () => {
    const metadata = createGuardianMetadata('shinkami', 'ipfs://test');
    metadata.description =
      'Nero is the Primordial Darkness, the Fertile Unknown that births all potential.';
    const result = checkCanonCompliance(metadata);
    expect(
      result.checks.find((c) => c.name === 'Cosmic Duality Respect')?.passed,
    ).toBe(true);
  });

  it('should validate element correctness', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.element = 'water'; // wrong — should be fire
    const result = checkCanonCompliance(metadata);
    expect(
      result.checks.find((c) => c.name === 'Guardian-Element Alignment')
        ?.passed,
    ).toBe(false);
  });

  it('should validate gate level range', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    metadata.arcanean.gateLevel = 15;
    const result = checkCanonCompliance(metadata);
    expect(
      result.checks.find((c) => c.name === 'Gate Level Range')?.passed,
    ).toBe(false);
  });

  it('should produce a score between 0 and 100', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    const result = checkCanonCompliance(metadata);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should have checks array with meaningful names', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    const result = checkCanonCompliance(metadata);
    expect(result.checks.length).toBeGreaterThan(0);
    for (const check of result.checks) {
      expect(check.name).toBeTruthy();
      expect(typeof check.passed).toBe('boolean');
    }
  });

  it('should detect multiple violations and lower grade', () => {
    const metadata = createGuardianMetadata('draconia', 'ipfs://test');
    // Wrong godbeast, wrong frequency, wrong element
    metadata.arcanean.godbeast = 'kaelith';
    metadata.arcanean.frequency = 111;
    metadata.arcanean.element = 'water';

    const result = checkCanonCompliance(metadata);
    expect(result.canonCompliant).toBe(false);
    // Multiple failures should result in a lower grade
    expect(['B', 'C', 'F']).toContain(result.grade);
  });
});
