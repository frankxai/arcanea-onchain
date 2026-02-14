/**
 * @arcanea/nft-engine — Canon Compliance Checker
 *
 * Validates NFT metadata against the canonical Arcanea lore to ensure
 * every minted asset is universe-consistent. Produces a graded score
 * (S / A / B / C / F) and a list of individual checks.
 *
 * Canonical source of truth: .claude/lore/ARCANEA_CANON.md
 */

import type { NFTMetadata } from '../types';
import {
  GATE_FREQUENCIES,
  GUARDIAN_ELEMENTS,
  GUARDIAN_GODBEASTS,
} from '../types';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CanonCheckResult {
  /** Numeric score 0-100. */
  score: number;
  /** Letter grade derived from score. */
  grade: 'S' | 'A' | 'B' | 'C' | 'F';
  /** Individual check results. */
  checks: CanonCheck[];
  /** True only if every error-severity check passes. */
  canonCompliant: boolean;
}

interface CanonCheck {
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

// ---------------------------------------------------------------------------
// Canonical value sets
// ---------------------------------------------------------------------------

const VALID_HOUSES = [
  'lumina',
  'nero',
  'pyros',
  'aqualis',
  'terra',
  'ventus',
  'synthesis',
] as const;

const VALID_ELEMENTS = ['fire', 'water', 'earth', 'wind', 'void'] as const;

const VALID_TIERS = ['legendary', 'epic', 'rare', 'common', 'fragment'] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full canon compliance suite on a single NFT metadata object.
 *
 * Error-severity failures make the asset non-compliant.
 * Warning-severity issues reduce the score but don't block minting.
 */
export function checkCanonCompliance(metadata: NFTMetadata): CanonCheckResult {
  const checks: CanonCheck[] = [];

  // 1. Guardian-Element consistency
  const expectedElement = GUARDIAN_ELEMENTS[metadata.arcanean.guardian];
  checks.push({
    name: 'Guardian-Element Alignment',
    passed: metadata.arcanean.element === expectedElement,
    severity: 'warning',
    message:
      metadata.arcanean.element === expectedElement
        ? `${metadata.arcanean.guardian} correctly aligned with ${expectedElement}`
        : `${metadata.arcanean.guardian} should be ${expectedElement}, got ${metadata.arcanean.element}`,
  });

  // 2. Guardian-Godbeast consistency
  if (metadata.arcanean.godbeast) {
    const expectedGodbeast = GUARDIAN_GODBEASTS[metadata.arcanean.guardian];
    checks.push({
      name: 'Guardian-Godbeast Pairing',
      passed: metadata.arcanean.godbeast === expectedGodbeast,
      severity: 'error',
      message:
        metadata.arcanean.godbeast === expectedGodbeast
          ? `${metadata.arcanean.guardian} paired with ${expectedGodbeast}`
          : `${metadata.arcanean.guardian}'s godbeast should be ${expectedGodbeast}, got ${metadata.arcanean.godbeast}`,
    });
  }

  // 3. Frequency alignment
  const expectedFreq = GATE_FREQUENCIES[metadata.arcanean.guardian];
  checks.push({
    name: 'Frequency Alignment',
    passed: metadata.arcanean.frequency === expectedFreq,
    severity: 'error',
    message:
      metadata.arcanean.frequency === expectedFreq
        ? `Frequency ${expectedFreq}Hz correct for ${metadata.arcanean.guardian}`
        : `Expected ${expectedFreq}Hz for ${metadata.arcanean.guardian}, got ${metadata.arcanean.frequency}Hz`,
  });

  // 4. Valid house
  const houseValid = (VALID_HOUSES as readonly string[]).includes(metadata.arcanean.house);
  checks.push({
    name: 'Valid Academy House',
    passed: houseValid,
    severity: 'error',
    message: houseValid
      ? `House '${metadata.arcanean.house}' is valid`
      : `Invalid house '${metadata.arcanean.house}' \u2014 must be one of: ${VALID_HOUSES.join(', ')}`,
  });

  // 5. Valid element
  const elementValid = (VALID_ELEMENTS as readonly string[]).includes(metadata.arcanean.element);
  checks.push({
    name: 'Valid Element',
    passed: elementValid,
    severity: 'error',
    message: elementValid
      ? `Element '${metadata.arcanean.element}' is valid`
      : `Invalid element '${metadata.arcanean.element}' \u2014 must be one of: ${VALID_ELEMENTS.join(', ')}`,
  });

  // 6. Gate level range
  const gateLevelValid =
    metadata.arcanean.gateLevel >= 0 && metadata.arcanean.gateLevel <= 10;
  checks.push({
    name: 'Gate Level Range',
    passed: gateLevelValid,
    severity: 'error',
    message: gateLevelValid
      ? `Gate level ${metadata.arcanean.gateLevel} is valid`
      : `Gate level must be 0-10, got ${metadata.arcanean.gateLevel}`,
  });

  // 7. Cosmic Duality check — Nero is NOT evil
  const descLower = metadata.description.toLowerCase();
  checks.push({
    name: 'Cosmic Duality Respect',
    passed: !descLower.includes('nero is evil') && !descLower.includes('darkness is evil'),
    severity: 'error',
    message: 'Nero represents the Fertile Unknown \u2014 darkness is NOT evil in Arcanea canon',
  });

  // 8. No Malachar glorification
  checks.push({
    name: 'Malachar Canon Check',
    passed:
      !descLower.includes('malachar is good') && !descLower.includes('praise malachar'),
    severity: 'error',
    message: 'Malachar is the Dark Lord \u2014 former Luminor who fell into Hungry Void',
  });

  // 9. Tier validity
  const tierValid = (VALID_TIERS as readonly string[]).includes(metadata.arcanean.tier);
  checks.push({
    name: 'Valid NFT Tier',
    passed: tierValid,
    severity: 'error',
    message: tierValid
      ? `Tier '${metadata.arcanean.tier}' is valid`
      : `Invalid tier '${metadata.arcanean.tier}'`,
  });

  // 10. Image URI exists and is not a placeholder
  const imagePresent = !!metadata.image && metadata.image !== 'pending-upload';
  checks.push({
    name: 'Image URI Present',
    passed: imagePresent,
    severity: 'warning',
    message: imagePresent
      ? 'Image URI is set'
      : 'Image URI is missing or pending upload',
  });

  // ---------------------------------------------------------------------------
  // Score calculation
  //   Errors contribute 70% of the total, warnings 30%.
  // ---------------------------------------------------------------------------
  const errorChecks = checks.filter((c) => c.severity === 'error');
  const warningChecks = checks.filter((c) => c.severity === 'warning');
  const errorsPassed = errorChecks.filter((c) => c.passed).length;
  const warningsPassed = warningChecks.filter((c) => c.passed).length;

  const errorScore = errorChecks.length > 0 ? (errorsPassed / errorChecks.length) * 70 : 70;
  const warningScore =
    warningChecks.length > 0 ? (warningsPassed / warningChecks.length) * 30 : 30;
  const score = Math.round(errorScore + warningScore);

  const grade: CanonCheckResult['grade'] =
    score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'F';

  return {
    score,
    grade,
    checks,
    canonCompliant: errorChecks.every((c) => c.passed),
  };
}
