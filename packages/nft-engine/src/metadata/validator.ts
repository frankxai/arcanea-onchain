/**
 * @arcanea/nft-engine — Metadata Validator
 *
 * Validates NFTMetadata for structural correctness and canon consistency
 * before minting. Every error must be fixed; warnings are advisories.
 */

import type { NFTMetadata } from '../types';
import { GATE_FREQUENCIES, GUARDIAN_ELEMENTS, GUARDIAN_GODBEASTS } from '../types';
import { getRankFromGateLevel } from './builder';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Single-item validation
// ---------------------------------------------------------------------------

export function validateMetadata(metadata: NFTMetadata): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { arcanean } = metadata;

  // --- Required fields ---
  if (!metadata.name?.trim()) errors.push('Name is required');
  if (!metadata.description?.trim()) errors.push('Description is required');
  if (!metadata.image?.trim()) errors.push('Image URI is required');

  // --- Gate level range ---
  if (arcanean.gateLevel < 0 || arcanean.gateLevel > 10) {
    errors.push(`Gate level must be 0-10, got ${arcanean.gateLevel}`);
  }

  // --- Rank-gate consistency ---
  const expectedRank = getRankFromGateLevel(arcanean.gateLevel);
  if (arcanean.rank !== expectedRank) {
    errors.push(
      `Rank '${arcanean.rank}' inconsistent with gate level ${arcanean.gateLevel} (expected '${expectedRank}')`,
    );
  }

  // --- Guardian-element consistency ---
  const expectedElement = GUARDIAN_ELEMENTS[arcanean.guardian];
  if (expectedElement && arcanean.element !== expectedElement) {
    warnings.push(
      `Element '${arcanean.element}' differs from guardian's canonical element '${expectedElement}'`,
    );
  }

  // --- Guardian-frequency consistency ---
  const expectedFreq = GATE_FREQUENCIES[arcanean.guardian];
  if (expectedFreq && arcanean.frequency !== expectedFreq) {
    errors.push(
      `Frequency ${arcanean.frequency}Hz doesn't match guardian ${arcanean.guardian}'s frequency ${expectedFreq}Hz`,
    );
  }

  // --- Godbeast consistency ---
  if (arcanean.godbeast) {
    const expectedGodbeast = GUARDIAN_GODBEASTS[arcanean.guardian];
    if (expectedGodbeast && arcanean.godbeast !== expectedGodbeast) {
      errors.push(
        `Godbeast '${arcanean.godbeast}' doesn't match guardian ${arcanean.guardian}'s godbeast '${expectedGodbeast}'`,
      );
    }
  }

  // --- Soulbound convention ---
  if (arcanean.soulbound && arcanean.tier !== 'common') {
    warnings.push('Soulbound is typically only used for Common tier (academy badges)');
  }

  // --- Tier-specific constraints ---
  if (arcanean.tier === 'legendary' && arcanean.evolves) {
    errors.push('Legendary tier NFTs should not evolve (they are final form)');
  }

  // --- Image URI format ---
  if (metadata.image && !isValidUri(metadata.image)) {
    errors.push(`Invalid image URI format: ${metadata.image}`);
  }

  // --- Attribute presence ---
  if (metadata.attributes.length === 0) {
    warnings.push('No attributes defined \u2014 metadata may appear empty on marketplaces');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

export function validateBatch(
  metadatas: NFTMetadata[],
): { total: number; valid: number; invalid: number; results: ValidationResult[] } {
  const results = metadatas.map(validateMetadata);
  return {
    total: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    results,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isValidUri(uri: string): boolean {
  return /^(https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/.test(uri);
}
