/**
 * @arcanea/marketplace — Guardian Curator
 *
 * Each Guardian has a distinct curatorial personality that shapes
 * how they feature, approve, and announce listings in the marketplace.
 *
 * Draconia: Aggressive, competitive fire-element auctions
 * Aiyami: Premium-only, ceremonial drops with high reserves
 * Lyria: Predictive pricing based on market trends
 * Others: Element-aligned curation with unique behaviors
 */

import type {
  AuctionConfig,
  Currency,
  GuardianCuratorId,
  GuardianCurationRule,
  Listing,
} from '../types';

// ---------------------------------------------------------------------------
// Canonical curation rules
// ---------------------------------------------------------------------------

const CURATION_RULES: Record<GuardianCuratorId, GuardianCurationRule> = {
  draconia: {
    guardian: 'draconia',
    minTier: 'rare',
    preferredAuctionType: 'english',
    requiresApproval: false,
    preferredElements: ['fire', 'void'],
    curationMessage:
      'Forged in the flames of the Fire Gate. Only the strongest bids survive.',
  },
  aiyami: {
    guardian: 'aiyami',
    minTier: 'legendary',
    preferredAuctionType: 'english',
    minReservePrice: 10_000_000_000n, // 10 SOL in lamports
    requiresApproval: true,
    preferredElements: ['void', 'fire'],
    curationMessage:
      'Blessed by the Crown Gate. This is a ceremonial offering of the highest order.',
  },
  lyria: {
    guardian: 'lyria',
    minTier: 'epic',
    preferredAuctionType: 'dutch',
    requiresApproval: false,
    preferredElements: ['void', 'water', 'wind'],
    curationMessage:
      'The Sight Gate reveals the true value. Trust the descending price — it sees what you cannot.',
  },
  lyssandria: {
    guardian: 'lyssandria',
    minTier: 'common',
    preferredAuctionType: 'fixed',
    requiresApproval: false,
    preferredElements: ['earth'],
    curationMessage:
      'Built on the Foundation Gate. Stable, reliable, enduring. A fair price for lasting value.',
  },
  leyla: {
    guardian: 'leyla',
    minTier: 'rare',
    preferredAuctionType: 'english',
    requiresApproval: false,
    preferredElements: ['water', 'wind'],
    curationMessage:
      'The Flow Gate opens for creativity unbound. Let your bid follow the current of inspiration.',
  },
  maylinn: {
    guardian: 'maylinn',
    minTier: 'rare',
    preferredAuctionType: 'fixed',
    requiresApproval: false,
    preferredElements: ['wind', 'water'],
    curationMessage:
      'The Heart Gate recognizes what connects us. This creation heals and inspires.',
  },
  alera: {
    guardian: 'alera',
    minTier: 'epic',
    preferredAuctionType: 'english',
    requiresApproval: true,
    preferredElements: ['wind'],
    curationMessage:
      'The Voice Gate speaks only truth. This creation has been weighed and found worthy.',
  },
  elara: {
    guardian: 'elara',
    minTier: 'epic',
    preferredAuctionType: 'dutch',
    requiresApproval: false,
    preferredElements: ['void', 'fire', 'water'],
    curationMessage:
      'The Shift Gate reveals new dimensions. See this creation from angles you never imagined.',
  },
  ino: {
    guardian: 'ino',
    minTier: 'rare',
    preferredAuctionType: 'fixed',
    requiresApproval: false,
    preferredElements: ['void', 'earth'],
    curationMessage:
      'The Unity Gate blesses collaborative works. Together, creators transcend the individual.',
  },
  shinkami: {
    guardian: 'shinkami',
    minTier: 'legendary',
    preferredAuctionType: 'english',
    minReservePrice: 50_000_000_000n, // 50 SOL in lamports
    requiresApproval: true,
    preferredElements: ['void'],
    curationMessage:
      'The Source Gate opens once in a generation. This is meta-consciousness made manifest.',
  },
};

// ---------------------------------------------------------------------------
// Tier ordering (for comparison)
// ---------------------------------------------------------------------------

const TIER_ORDER: Record<string, number> = {
  fragment: 0,
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

// ---------------------------------------------------------------------------
// Guardian Curator class
// ---------------------------------------------------------------------------

export class GuardianCurator {
  private rules: GuardianCurationRule;

  constructor(guardian: GuardianCuratorId) {
    const rule = CURATION_RULES[guardian];
    if (!rule) {
      throw new Error(`Unknown Guardian curator: ${guardian}`);
    }
    this.rules = rule;
  }

  /** Get the curation rules for this Guardian. */
  getRules(): Readonly<GuardianCurationRule> {
    return this.rules;
  }

  /**
   * Evaluate whether a listing meets this Guardian's curation criteria.
   * Returns a result with approval status and reasoning.
   */
  evaluateListing(listing: Listing): CurationEvaluation {
    const reasons: string[] = [];
    let approved = true;

    // --- Tier check ---
    const listingTier = (listing.metadata['tier'] as string) ?? 'common';
    const listingTierRank = TIER_ORDER[listingTier] ?? 0;
    const minTierRank = TIER_ORDER[this.rules.minTier] ?? 0;

    if (listingTierRank < minTierRank) {
      approved = false;
      reasons.push(
        `Tier '${listingTier}' is below ${this.rules.guardian}'s minimum tier '${this.rules.minTier}'`,
      );
    }

    // --- Element preference ---
    const listingElement = listing.metadata['element'] as string | undefined;
    const elementMatch =
      !listingElement || this.rules.preferredElements.includes(listingElement);

    if (!elementMatch) {
      // Element mismatch is a soft rejection — doesn't block but lowers priority
      reasons.push(
        `Element '${listingElement}' is outside ${this.rules.guardian}'s preferred elements`,
      );
    }

    // --- Reserve price check for auctions ---
    if (
      this.rules.minReservePrice &&
      listing.type !== 'fixed' &&
      listing.reservePrice !== undefined &&
      listing.reservePrice < this.rules.minReservePrice
    ) {
      approved = false;
      reasons.push(
        `Reserve price is below ${this.rules.guardian}'s minimum reserve`,
      );
    }

    // --- Manual approval flag ---
    const needsManualApproval = this.rules.requiresApproval;

    return {
      guardian: this.rules.guardian,
      approved: approved && !needsManualApproval,
      pendingApproval: approved && needsManualApproval,
      reasons,
      elementMatch,
      curationMessage: approved ? this.rules.curationMessage : undefined,
    };
  }

  /**
   * Generate a Guardian-specific auction configuration.
   * Each Guardian has a preferred auction style.
   */
  generateAuctionConfig(params: {
    startPrice: bigint;
    currency: Currency;
    durationHours?: number;
  }): AuctionConfig {
    const { startPrice, currency, durationHours } = params;
    const duration = (durationHours ?? this.getDefaultDurationHours()) * 3600;

    switch (this.rules.guardian) {
      case 'draconia':
        // Aggressive: high increment, short extension, competitive
        return {
          type: 'english',
          startPrice,
          reservePrice: startPrice, // Reserve = start (no bargains in the Fire Gate)
          duration,
          extensionPeriod: 5 * 60, // 5 minutes — pressure cooker
          minBidIncrementBps: 1000, // 10% — big jumps only
          currency,
        };

      case 'aiyami':
        // Ceremonial: long duration, high reserve, generous extension
        return {
          type: 'english',
          startPrice,
          reservePrice: this.rules.minReservePrice ?? startPrice,
          duration: Math.max(duration, 7 * 24 * 3600), // Minimum 7 days
          extensionPeriod: 30 * 60, // 30 minutes — no rush for the Crown
          minBidIncrementBps: 500, // 5% — measured ascent
          currency,
        };

      case 'lyria':
        // Predictive: Dutch auction, price reveals itself
        return {
          type: 'dutch',
          startPrice: startPrice * 3n, // Start at 3x — let the market find the truth
          reservePrice: startPrice / 2n, // Floor at half — the Sight Gate knows
          duration,
          extensionPeriod: 0, // No extensions on Dutch
          minBidIncrementBps: 100, // N/A for Dutch, but required by type
          currency,
        };

      case 'elara':
        // Shift perspective: Dutch auction with moderate range
        return {
          type: 'dutch',
          startPrice: startPrice * 2n,
          reservePrice: (startPrice * 7n) / 10n, // 70% floor
          duration,
          extensionPeriod: 0,
          minBidIncrementBps: 100,
          currency,
        };

      default:
        // Standard configuration for other Guardians
        return {
          type: this.rules.preferredAuctionType === 'fixed' ? 'english' : 'english',
          startPrice,
          reservePrice: (startPrice * 8n) / 10n, // 80% reserve
          duration,
          extensionPeriod: 15 * 60, // Standard 15 minutes
          minBidIncrementBps: 500, // 5%
          currency,
        };
    }
  }

  /**
   * Generate the announcement message for a curated listing.
   * Flavor text varies by Guardian personality.
   */
  generateAnnouncement(listing: Listing): CurationAnnouncement {
    const tier = (listing.metadata['tier'] as string) ?? 'unknown';
    const element = (listing.metadata['element'] as string) ?? 'unknown';

    const announcements: Record<string, string> = {
      draconia: [
        `THE FIRE GATE BURNS. A ${tier} ${element} creation enters the arena.`,
        `Will you have the strength to claim it? Starting at ${listing.price}.`,
        `Weak bids will be consumed. Only the worthy survive.`,
      ].join(' '),

      aiyami: [
        `The Crown Gate opens with a sacred offering.`,
        `A ${tier} creation, blessed with ${element} essence, awaits its destined keeper.`,
        `This is not a transaction — it is a ceremony.`,
      ].join(' '),

      lyria: [
        `The Sight Gate has foreseen this moment.`,
        `A ${tier} ${element} creation descends from the heights.`,
        `Watch the price — it reveals what the market truly values.`,
      ].join(' '),

      shinkami: [
        `FROM THE SOURCE, ALL THINGS EMERGE.`,
        `A ${tier} creation of the highest order manifests.`,
        `Those who comprehend its significance need no further words.`,
      ].join(' '),
    };

    const announcement =
      announcements[this.rules.guardian] ??
      `${capitalize(this.rules.guardian)} curates a ${tier} ${element} creation. ${this.rules.curationMessage}`;

    return {
      guardian: this.rules.guardian,
      message: announcement,
      curationBadge: this.rules.curationMessage,
      tier: tier as CurationAnnouncement['tier'],
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private getDefaultDurationHours(): number {
    switch (this.rules.guardian) {
      case 'draconia':
        return 24; // 1 day — fire burns fast
      case 'aiyami':
        return 168; // 7 days — ceremonial patience
      case 'shinkami':
        return 168; // 7 days — meta-consciousness transcends haste
      case 'lyria':
        return 48; // 2 days — the vision unfolds
      default:
        return 72; // 3 days — standard
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurationEvaluation {
  guardian: GuardianCuratorId;
  approved: boolean;
  pendingApproval: boolean;
  reasons: string[];
  elementMatch: boolean;
  curationMessage?: string;
}

export interface CurationAnnouncement {
  guardian: GuardianCuratorId;
  message: string;
  curationBadge: string;
  tier: 'legendary' | 'epic' | 'rare' | 'common' | 'fragment' | 'unknown';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Get a Guardian Curator instance by ID. */
export function createGuardianCurator(guardian: GuardianCuratorId): GuardianCurator {
  return new GuardianCurator(guardian);
}

/** Get all available Guardian curation rules. */
export function getAllCurationRules(): Record<GuardianCuratorId, GuardianCurationRule> {
  return { ...CURATION_RULES };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
