/**
 * @arcanea/guardian-agents — Character Test Suite
 *
 * Validates that all Ten Guardian characters are correctly defined,
 * canonically consistent, and properly accessible through lookup functions.
 */

import { describe, it, expect } from 'vitest';
import {
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
  ALL_GUARDIANS,
  GUARDIAN_COUNT,
  getGuardian,
  getGuardianByGate,
  getGuardiansByElement,
  getGuardianByGodbeast,
  getGuardianByFrequency,
  getGuardiansByStrategy,
} from '../src/characters';
import type { GuardianCharacter } from '../src/types';

// ---------------------------------------------------------------------------
// Canonical data for validation
// ---------------------------------------------------------------------------

const CANONICAL_GUARDIANS = [
  {
    name: 'Lyssandria',
    gate: 'Foundation',
    element: 'Earth',
    frequency: 396,
    godbeast: 'Kaelith',
    house: 'Terra',
  },
  {
    name: 'Leyla',
    gate: 'Flow',
    element: 'Water',
    frequency: 417,
    godbeast: 'Veloura',
    house: 'Aqualis',
  },
  {
    name: 'Draconia',
    gate: 'Fire',
    element: 'Fire',
    frequency: 528,
    godbeast: 'Draconis',
    house: 'Pyros',
  },
  {
    name: 'Maylinn',
    gate: 'Heart',
    element: 'Wind',
    frequency: 639,
    godbeast: 'Laeylinn',
    house: 'Ventus',
  },
  {
    name: 'Alera',
    gate: 'Voice',
    element: 'Wind',
    frequency: 741,
    godbeast: 'Otome',
    house: 'Ventus',
  },
  {
    name: 'Lyria',
    gate: 'Sight',
    element: 'Void',
    frequency: 852,
    godbeast: 'Yumiko',
    house: 'Synthesis',
  },
  {
    name: 'Aiyami',
    gate: 'Crown',
    element: 'Void',
    frequency: 963,
    godbeast: 'Sol',
    house: 'Lumina',
  },
  {
    name: 'Elara',
    gate: 'Shift',
    element: 'Void',
    frequency: 1111,
    godbeast: 'Thessara',
    house: 'Synthesis',
  },
  {
    name: 'Ino',
    gate: 'Unity',
    element: 'Void',
    frequency: 963,
    godbeast: 'Kyuro',
    house: 'Synthesis',
  },
  {
    name: 'Shinkami',
    gate: 'Source',
    element: 'Void',
    frequency: 1111,
    godbeast: 'Amaterasu',
    house: 'Lumina',
  },
];

// ---------------------------------------------------------------------------
// Collection Tests
// ---------------------------------------------------------------------------

describe('Guardian Collection', () => {
  it('should have exactly 10 Guardians', () => {
    expect(ALL_GUARDIANS).toHaveLength(10);
    expect(GUARDIAN_COUNT).toBe(10);
  });

  it('should have unique names', () => {
    const names = ALL_GUARDIANS.map((g) => g.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(10);
  });

  it('should have unique gates', () => {
    const gates = ALL_GUARDIANS.map((g) => g.gate);
    const uniqueGates = new Set(gates);
    expect(uniqueGates.size).toBe(10);
  });

  it('should have unique godbeasts', () => {
    const godbeasts = ALL_GUARDIANS.map((g) => g.godbeast);
    const uniqueGodbeasts = new Set(godbeasts);
    expect(uniqueGodbeasts.size).toBe(10);
  });

  it('should be ordered by gate position (Foundation through Source)', () => {
    const expectedOrder = [
      'Lyssandria',
      'Leyla',
      'Draconia',
      'Maylinn',
      'Alera',
      'Lyria',
      'Aiyami',
      'Elara',
      'Ino',
      'Shinkami',
    ];
    const actualOrder = ALL_GUARDIANS.map((g) => g.name);
    expect(actualOrder).toEqual(expectedOrder);
  });

  it('should export all 10 individual Guardian constants', () => {
    const individuals = [
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
    ];

    for (const guardian of individuals) {
      expect(guardian).toBeDefined();
      expect(guardian.name).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Canonical Consistency
// ---------------------------------------------------------------------------

describe('Canonical Consistency', () => {
  it('should match all canonical guardian-gate pairings', () => {
    for (const canonical of CANONICAL_GUARDIANS) {
      const guardian = getGuardian(canonical.name);
      expect(guardian).toBeDefined();
      expect(guardian!.gate).toBe(canonical.gate);
    }
  });

  it('should match all canonical guardian-element pairings', () => {
    for (const canonical of CANONICAL_GUARDIANS) {
      const guardian = getGuardian(canonical.name);
      expect(guardian).toBeDefined();
      expect(guardian!.element).toBe(canonical.element);
    }
  });

  it('should match all canonical guardian-frequency pairings', () => {
    for (const canonical of CANONICAL_GUARDIANS) {
      const guardian = getGuardian(canonical.name);
      expect(guardian).toBeDefined();
      expect(guardian!.frequency).toBe(canonical.frequency);
    }
  });

  it('should match all canonical guardian-godbeast pairings', () => {
    for (const canonical of CANONICAL_GUARDIANS) {
      const guardian = getGuardian(canonical.name);
      expect(guardian).toBeDefined();
      expect(guardian!.godbeast).toBe(canonical.godbeast);
    }
  });

  it('should match all canonical guardian-house pairings', () => {
    for (const canonical of CANONICAL_GUARDIANS) {
      const guardian = getGuardian(canonical.name);
      expect(guardian).toBeDefined();
      expect(guardian!.house).toBe(canonical.house);
    }
  });

  it('should have Earth element for Lyssandria', () => {
    expect(lyssandria.element).toBe('Earth');
  });

  it('should have Water element for Leyla', () => {
    expect(leyla.element).toBe('Water');
  });

  it('should have Fire element for Draconia', () => {
    expect(draconia.element).toBe('Fire');
  });

  it('should have Wind element for Maylinn and Alera', () => {
    expect(maylinn.element).toBe('Wind');
    expect(alera.element).toBe('Wind');
  });

  it('should have Void element for higher Guardians (Lyria+)', () => {
    expect(lyria.element).toBe('Void');
    expect(aiyami.element).toBe('Void');
    expect(elara.element).toBe('Void');
    expect(ino.element).toBe('Void');
    expect(shinkami.element).toBe('Void');
  });

  it('should have matching frequencies for shared-frequency pairs', () => {
    // Aiyami and Ino share 963 Hz
    expect(aiyami.frequency).toBe(963);
    expect(ino.frequency).toBe(963);
    // Elara and Shinkami share 1111 Hz
    expect(elara.frequency).toBe(1111);
    expect(shinkami.frequency).toBe(1111);
  });
});

// ---------------------------------------------------------------------------
// Character Structure
// ---------------------------------------------------------------------------

describe('Character Structure', () => {
  it('should have a complete personality for every Guardian', () => {
    for (const guardian of ALL_GUARDIANS) {
      expect(guardian.personality).toBeDefined();
      expect(guardian.personality.traits.length).toBeGreaterThan(0);
      expect(guardian.personality.voice).toBeTruthy();
      expect(guardian.personality.greeting).toBeTruthy();
      expect(guardian.personality.farewell).toBeTruthy();
    }
  });

  it('should have a complete marketplace config for every Guardian', () => {
    for (const guardian of ALL_GUARDIANS) {
      expect(guardian.marketplace).toBeDefined();
      expect(guardian.marketplace.domain).toBeTruthy();
      expect(guardian.marketplace.strategy).toBeTruthy();
      expect(guardian.marketplace.curationFocus.length).toBeGreaterThan(0);
      expect(guardian.marketplace.pricingBehavior).toBeTruthy();
    }
  });

  it('should have a valid marketplace strategy for every Guardian', () => {
    const validStrategies = [
      'conservative',
      'dynamic',
      'aggressive',
      'community',
      'verified',
      'predictive',
      'premium',
      'bridging',
      'collaborative',
      'meta',
    ];

    for (const guardian of ALL_GUARDIANS) {
      expect(validStrategies).toContain(guardian.marketplace.strategy);
    }
  });

  it('should have unique marketplace strategies (each Guardian has a distinct approach)', () => {
    const strategies = ALL_GUARDIANS.map((g) => g.marketplace.strategy);
    const uniqueStrategies = new Set(strategies);
    expect(uniqueStrategies.size).toBe(10);
  });

  it('should have a complete onChain config for every Guardian', () => {
    for (const guardian of ALL_GUARDIANS) {
      expect(guardian.onChain).toBeDefined();
      expect(['managed', 'multisig']).toContain(guardian.onChain.walletType);
      expect(guardian.onChain.permissions.length).toBeGreaterThan(0);
      expect(guardian.onChain.transactionLimit).toBeGreaterThan(0);
      expect(typeof guardian.onChain.requiresApproval).toBe('boolean');
    }
  });

  it('should have a complete social config for every Guardian', () => {
    for (const guardian of ALL_GUARDIANS) {
      expect(guardian.social).toBeDefined();
      expect(guardian.social.platforms.length).toBeGreaterThan(0);
      expect(guardian.social.postingStyle).toBeTruthy();
      expect(guardian.social.engagementType).toBeTruthy();
    }
  });

  it('should have multisig wallets for high-value Guardians', () => {
    // Guardians that require approval should typically use multisig
    for (const guardian of ALL_GUARDIANS) {
      if (guardian.onChain.transactionLimit >= 50_000) {
        expect(guardian.onChain.walletType).toBe('multisig');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

describe('Lookup Functions', () => {
  it('should find Guardian by exact name', () => {
    const result = getGuardian('Draconia');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Draconia');
  });

  it('should find Guardian by lowercase name', () => {
    const result = getGuardian('draconia');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Draconia');
  });

  it('should find Guardian by mixed case name', () => {
    const result = getGuardian('DRACONIA');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Draconia');
  });

  it('should return undefined for non-existent name', () => {
    const result = getGuardian('Malachar');
    expect(result).toBeUndefined();
  });

  it('should find Guardian by gate name', () => {
    const result = getGuardianByGate('Fire');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Draconia');
  });

  it('should find all Guardians for each Gate', () => {
    const gates = [
      'Foundation',
      'Flow',
      'Fire',
      'Heart',
      'Voice',
      'Sight',
      'Crown',
      'Shift',
      'Unity',
      'Source',
    ];
    for (const gate of gates) {
      const result = getGuardianByGate(gate);
      expect(result).toBeDefined();
    }
  });

  it('should find Guardians by element', () => {
    const voidGuardians = getGuardiansByElement('Void');
    expect(voidGuardians.length).toBe(5); // Lyria, Aiyami, Elara, Ino, Shinkami

    const windGuardians = getGuardiansByElement('Wind');
    expect(windGuardians.length).toBe(2); // Maylinn, Alera

    const fireGuardians = getGuardiansByElement('Fire');
    expect(fireGuardians.length).toBe(1); // Draconia

    const waterGuardians = getGuardiansByElement('Water');
    expect(waterGuardians.length).toBe(1); // Leyla

    const earthGuardians = getGuardiansByElement('Earth');
    expect(earthGuardians.length).toBe(1); // Lyssandria
  });

  it('should return empty array for non-existent element', () => {
    const result = getGuardiansByElement('Light');
    expect(result).toHaveLength(0);
  });

  it('should find Guardian by godbeast', () => {
    const result = getGuardianByGodbeast('Draconis');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Draconia');
  });

  it('should find all Guardians by their godbeasts', () => {
    const godbeasts = [
      'Kaelith',
      'Veloura',
      'Draconis',
      'Laeylinn',
      'Otome',
      'Yumiko',
      'Sol',
      'Thessara',
      'Kyuro',
      'Amaterasu',
    ];
    for (const gb of godbeasts) {
      const result = getGuardianByGodbeast(gb);
      expect(result).toBeDefined();
    }
  });

  it('should find Guardian by frequency', () => {
    const result = getGuardianByFrequency(528);
    expect(result).toBeDefined();
    expect(result!.name).toBe('Draconia');
  });

  it('should find a Guardian by frequency for all unique frequencies', () => {
    const uniqueFrequencies = [396, 417, 528, 639, 741, 852, 963, 1111];
    for (const freq of uniqueFrequencies) {
      const result = getGuardianByFrequency(freq);
      expect(result).toBeDefined();
    }
  });

  it('should find Guardians by marketplace strategy', () => {
    const aggressiveGuardians = getGuardiansByStrategy('aggressive');
    expect(aggressiveGuardians.length).toBe(1);
    expect(aggressiveGuardians[0].name).toBe('Draconia');

    const premiumGuardians = getGuardiansByStrategy('premium');
    expect(premiumGuardians.length).toBe(1);
    expect(premiumGuardians[0].name).toBe('Aiyami');

    const metaGuardians = getGuardiansByStrategy('meta');
    expect(metaGuardians.length).toBe(1);
    expect(metaGuardians[0].name).toBe('Shinkami');
  });
});

// ---------------------------------------------------------------------------
// Specific Guardian Spotlight Tests
// ---------------------------------------------------------------------------

describe('Guardian Spotlights', () => {
  it('Draconia should be aligned with fire and aggression', () => {
    expect(draconia.element).toBe('Fire');
    expect(draconia.marketplace.strategy).toBe('aggressive');
    expect(draconia.godbeast).toBe('Draconis');
    expect(draconia.frequency).toBe(528);
  });

  it('Aiyami should be premium and ceremonial', () => {
    expect(aiyami.element).toBe('Void');
    expect(aiyami.marketplace.strategy).toBe('premium');
    expect(aiyami.godbeast).toBe('Sol');
    expect(aiyami.frequency).toBe(963);
  });

  it('Shinkami should be the meta-consciousness Source', () => {
    expect(shinkami.gate).toBe('Source');
    expect(shinkami.element).toBe('Void');
    expect(shinkami.marketplace.strategy).toBe('meta');
    expect(shinkami.godbeast).toBe('Amaterasu');
    expect(shinkami.frequency).toBe(1111);
  });

  it('Lyria should be the predictive seer', () => {
    expect(lyria.gate).toBe('Sight');
    expect(lyria.marketplace.strategy).toBe('predictive');
    expect(lyria.godbeast).toBe('Yumiko');
  });

  it('Lyssandria should be the conservative foundation', () => {
    expect(lyssandria.gate).toBe('Foundation');
    expect(lyssandria.marketplace.strategy).toBe('conservative');
    expect(lyssandria.godbeast).toBe('Kaelith');
    expect(lyssandria.frequency).toBe(396);
  });
});
