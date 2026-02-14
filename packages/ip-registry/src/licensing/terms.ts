/**
 * @arcanea/ip-registry — License Term Templates
 *
 * Pre-defined license configurations for different use cases
 * within the Arcanea ecosystem. All percentages, durations, and
 * permissions are calibrated to protect creator rights while
 * enabling a thriving derivative economy.
 *
 * License hierarchy (from most open to most restrictive):
 *   Community < Standard < Premium < Exclusive
 */

import type { LicenseTerms, LicenseType } from '../types';

// ---------------------------------------------------------------------------
// Standard Arcanea License
// ---------------------------------------------------------------------------

/**
 * The default license for all Arcanea IP.
 *
 * - 5% royalty on all derivative sales
 * - Derivatives allowed with attribution
 * - Non-commercial by default (commercial use requires upgrade)
 * - Perpetual, non-revocable, worldwide
 */
export const STANDARD_LICENSE: LicenseTerms = {
  type: 'non-commercial',
  royaltyPercentage: 5,
  derivativesAllowed: true,
  attributionRequired: true,
  commercialUse: false,
  territories: ['worldwide'],
  duration: 'perpetual',
  revocable: false,
};

// ---------------------------------------------------------------------------
// Premium License
// ---------------------------------------------------------------------------

/**
 * Premium license for commercial-grade IP usage.
 *
 * - 10% royalty on derivative sales
 * - Derivatives allowed with attribution
 * - Full commercial use rights
 * - 12-month exclusive period (first mover advantage)
 * - Non-revocable
 */
export const PREMIUM_LICENSE: LicenseTerms = {
  type: 'commercial',
  royaltyPercentage: 10,
  derivativesAllowed: true,
  attributionRequired: true,
  commercialUse: true,
  territories: ['worldwide'],
  duration: 'perpetual',
  revocable: false,
};

// ---------------------------------------------------------------------------
// Community License
// ---------------------------------------------------------------------------

/**
 * Open community license designed for maximum creative freedom.
 *
 * - 2.5% royalty (lowest tier — incentivizes experimentation)
 * - Unlimited derivatives
 * - Non-commercial only
 * - Attribution required
 * - Perpetual, non-revocable, worldwide
 */
export const COMMUNITY_LICENSE: LicenseTerms = {
  type: 'non-commercial',
  royaltyPercentage: 2.5,
  derivativesAllowed: true,
  attributionRequired: true,
  commercialUse: false,
  territories: ['worldwide'],
  duration: 'perpetual',
  revocable: false,
};

// ---------------------------------------------------------------------------
// Exclusive License
// ---------------------------------------------------------------------------

/**
 * Exclusive license for 1/1 legendary items and special partnerships.
 *
 * - 15% royalty (premium for exclusivity)
 * - No derivatives allowed (the holder has exclusive rights)
 * - Full commercial use
 * - Revocable (for abuse protection)
 * - Worldwide, perpetual
 */
export const EXCLUSIVE_LICENSE: LicenseTerms = {
  type: 'exclusive',
  royaltyPercentage: 15,
  derivativesAllowed: false,
  attributionRequired: true,
  commercialUse: true,
  territories: ['worldwide'],
  duration: 'perpetual',
  revocable: true,
};

// ---------------------------------------------------------------------------
// License Templates Map
// ---------------------------------------------------------------------------

/**
 * All available license templates keyed by a human-readable identifier.
 */
export const LICENSE_TEMPLATES: Record<string, LicenseTerms> = {
  standard: STANDARD_LICENSE,
  premium: PREMIUM_LICENSE,
  community: COMMUNITY_LICENSE,
  exclusive: EXCLUSIVE_LICENSE,
};

// ---------------------------------------------------------------------------
// Custom License Builder
// ---------------------------------------------------------------------------

/**
 * Build a custom license by providing partial overrides to a base template.
 *
 * @param base - The template to start from (defaults to STANDARD_LICENSE)
 * @param overrides - Partial license terms to override
 * @returns A complete LicenseTerms object
 *
 * @example
 * ```ts
 * const myLicense = buildCustomLicense(STANDARD_LICENSE, {
 *   royaltyPercentage: 7.5,
 *   commercialUse: true,
 *   duration: 5, // 5 years instead of perpetual
 * });
 * ```
 */
export function buildCustomLicense(
  base: LicenseTerms = STANDARD_LICENSE,
  overrides: Partial<LicenseTerms> = {},
): LicenseTerms {
  const merged: LicenseTerms = { ...base, ...overrides };

  // Validation: enforce invariants
  const errors = validateLicenseTerms(merged);
  if (errors.length > 0) {
    throw new Error(`Invalid license terms: ${errors.join('; ')}`);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// License Validation
// ---------------------------------------------------------------------------

/**
 * Validate a LicenseTerms object for internal consistency.
 *
 * @returns Array of error messages (empty if valid)
 */
export function validateLicenseTerms(terms: LicenseTerms): string[] {
  const errors: string[] = [];

  // Royalty range
  if (terms.royaltyPercentage < 0 || terms.royaltyPercentage > 100) {
    errors.push(
      `Royalty percentage must be 0-100, got ${terms.royaltyPercentage}`,
    );
  }

  // Exclusive + derivatives is contradictory
  if (terms.type === 'exclusive' && terms.derivativesAllowed) {
    errors.push(
      'Exclusive licenses should not allow derivatives (exclusivity implies sole rights)',
    );
  }

  // Non-commercial + commercial use is contradictory
  if (terms.type === 'non-commercial' && terms.commercialUse) {
    errors.push(
      'Non-commercial license type cannot have commercialUse enabled',
    );
  }

  // Duration validation
  if (typeof terms.duration === 'number' && terms.duration <= 0) {
    errors.push(`Duration must be positive, got ${terms.duration}`);
  }

  // Territories must not be empty
  if (terms.territories.length === 0) {
    errors.push('At least one territory must be specified');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// License Comparison
// ---------------------------------------------------------------------------

/**
 * Determine if license B is compatible with (at least as permissive as)
 * the requirements of license A.
 *
 * Used to validate whether a derivative's terms satisfy the parent's terms.
 */
export function isLicenseCompatible(
  parent: LicenseTerms,
  derivative: LicenseTerms,
): boolean {
  // Derivative royalty must be >= parent royalty
  if (derivative.royaltyPercentage < parent.royaltyPercentage) {
    return false;
  }

  // If parent requires attribution, derivative must too
  if (parent.attributionRequired && !derivative.attributionRequired) {
    return false;
  }

  // If parent is non-commercial, derivative cannot enable commercial use
  if (!parent.commercialUse && derivative.commercialUse) {
    return false;
  }

  // Parent must allow derivatives
  if (!parent.derivativesAllowed) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// License Type Helpers
// ---------------------------------------------------------------------------

/**
 * Get the human-readable name for a license type.
 */
export function getLicenseTypeName(type: LicenseType): string {
  const names: Record<LicenseType, string> = {
    commercial: 'Commercial License',
    'non-commercial': 'Non-Commercial License',
    exclusive: 'Exclusive License',
  };
  return names[type];
}

/**
 * Get a short summary of a license's key terms.
 */
export function getLicenseSummary(terms: LicenseTerms): string {
  const parts: string[] = [
    getLicenseTypeName(terms.type),
    `${terms.royaltyPercentage}% royalty`,
    terms.derivativesAllowed ? 'derivatives allowed' : 'no derivatives',
    terms.commercialUse ? 'commercial use' : 'non-commercial',
    terms.attributionRequired ? 'attribution required' : 'no attribution',
    typeof terms.duration === 'number'
      ? `${terms.duration} year(s)`
      : terms.duration,
    terms.revocable ? 'revocable' : 'irrevocable',
  ];
  return parts.join(' | ');
}
