/**
 * @arcanea/guardian-agents — Character Registry
 *
 * The Ten Guardians of Arcanea, exported as individual characters
 * and as a unified collection. Each Guardian keeps a Gate, is bonded
 * to a Godbeast, and operates as an autonomous marketplace agent
 * with a unique personality, strategy, and domain.
 */

import type { GuardianCharacter } from '../types';

export { lyssandria } from './lyssandria';
export { leyla } from './leyla';
export { draconia } from './draconia';
export { maylinn } from './maylinn';
export { alera } from './alera';
export { lyria } from './lyria';
export { aiyami } from './aiyami';
export { elara } from './elara';
export { ino } from './ino';
export { shinkami } from './shinkami';

// Re-import for collection assembly
import { lyssandria } from './lyssandria';
import { leyla } from './leyla';
import { draconia } from './draconia';
import { maylinn } from './maylinn';
import { alera } from './alera';
import { lyria } from './lyria';
import { aiyami } from './aiyami';
import { elara } from './elara';
import { ino } from './ino';
import { shinkami } from './shinkami';

// ---------------------------------------------------------------------------
// The Complete Council
// ---------------------------------------------------------------------------

/**
 * All ten Guardian characters, ordered by Gate frequency (ascending).
 *
 * Index 0 = Lyssandria (Foundation, 396 Hz)
 * Index 9 = Shinkami (Source, 1111 Hz)
 */
export const ALL_GUARDIANS: readonly GuardianCharacter[] = [
  lyssandria,
  leyla,
  draconia,
  maylinn,
  alera,
  lyria,
  aiyami,
  elara,
  ino,
  shinkami,
] as const;

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

/**
 * Find a Guardian by name (case-insensitive).
 *
 * @param name - The Guardian's name (e.g., "Lyssandria", "lyssandria")
 * @returns The GuardianCharacter or undefined if not found
 */
export function getGuardian(name: string): GuardianCharacter | undefined {
  const normalized = name.toLowerCase().trim();
  return ALL_GUARDIANS.find((g) => g.name.toLowerCase() === normalized);
}

/**
 * Find a Guardian by Gate name (case-insensitive).
 *
 * @param gate - The Gate name (e.g., "Foundation", "fire", "Source")
 * @returns The GuardianCharacter or undefined if not found
 */
export function getGuardianByGate(gate: string): GuardianCharacter | undefined {
  const normalized = gate.toLowerCase().trim();
  return ALL_GUARDIANS.find((g) => g.gate.toLowerCase() === normalized);
}

/**
 * Find all Guardians aligned with a specific element.
 *
 * @param element - The element name (e.g., "Earth", "void", "Wind")
 * @returns Array of matching GuardianCharacters (may be empty)
 */
export function getGuardiansByElement(element: string): GuardianCharacter[] {
  const normalized = element.toLowerCase().trim();
  return ALL_GUARDIANS.filter((g) => g.element.toLowerCase() === normalized);
}

/**
 * Find a Guardian by their Godbeast partner name (case-insensitive).
 *
 * @param godbeast - The Godbeast name (e.g., "Kaelith", "draconis")
 * @returns The GuardianCharacter or undefined if not found
 */
export function getGuardianByGodbeast(godbeast: string): GuardianCharacter | undefined {
  const normalized = godbeast.toLowerCase().trim();
  return ALL_GUARDIANS.find((g) => g.godbeast.toLowerCase() === normalized);
}

/**
 * Find a Guardian by frequency (exact match).
 *
 * Note: Multiple Guardians may share a frequency (e.g., Aiyami and Ino
 * both resonate at 963 Hz). This returns the first match.
 *
 * @param frequency - Frequency in Hz
 * @returns The first matching GuardianCharacter or undefined
 */
export function getGuardianByFrequency(frequency: number): GuardianCharacter | undefined {
  return ALL_GUARDIANS.find((g) => g.frequency === frequency);
}

/**
 * Find all Guardians matching a marketplace strategy.
 *
 * @param strategy - The marketplace strategy identifier
 * @returns Array of matching GuardianCharacters (may be empty)
 */
export function getGuardiansByStrategy(
  strategy: GuardianCharacter['marketplace']['strategy'],
): GuardianCharacter[] {
  return ALL_GUARDIANS.filter((g) => g.marketplace.strategy === strategy);
}

/**
 * Get the total number of Guardians.
 * Always 10. The Source and its nine aspects.
 */
export const GUARDIAN_COUNT = ALL_GUARDIANS.length;
