/**
 * @arcanea/nft-engine — Metadata Builder
 *
 * Constructs ERC-721 and Metaplex-compatible metadata objects
 * with embedded Arcanean attributes for lore consistency.
 */

import type {
  ArcaneanAttributes,
  Guardian,
  House,
  MetadataAttribute,
  NFTMetadata,
  NFTTier,
  Rank,
} from '../types';
import {
  GATE_FREQUENCIES,
  GUARDIAN_ELEMENTS,
  GUARDIAN_GODBEASTS,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Rank derivation
// ---------------------------------------------------------------------------

/** Derive the canonical Rank from a gate level (0-10). */
export function getRankFromGateLevel(gateLevel: number): Rank {
  if (gateLevel <= 2) return 'apprentice';
  if (gateLevel <= 4) return 'mage';
  if (gateLevel <= 6) return 'master';
  if (gateLevel <= 8) return 'archmage';
  return 'luminor';
}

// ---------------------------------------------------------------------------
// Attribute serialisation
// ---------------------------------------------------------------------------

/** Convert ArcaneanAttributes into the flat trait array used by marketplaces. */
export function buildAttributes(arcanean: ArcaneanAttributes): MetadataAttribute[] {
  const attrs: MetadataAttribute[] = [
    { trait_type: 'Element', value: capitalize(arcanean.element) },
    { trait_type: 'Guardian', value: capitalize(arcanean.guardian) },
    { trait_type: 'Rank', value: capitalize(arcanean.rank) },
    { trait_type: 'House', value: capitalize(arcanean.house) },
    { trait_type: 'Gate Level', value: arcanean.gateLevel, display_type: 'number' },
    { trait_type: 'Frequency', value: arcanean.frequency, display_type: 'number' },
    { trait_type: 'Tier', value: capitalize(arcanean.tier) },
  ];

  if (arcanean.godbeast) {
    attrs.push({ trait_type: 'Godbeast', value: capitalize(arcanean.godbeast) });
  }
  if (arcanean.soulbound) {
    attrs.push({ trait_type: 'Soulbound', value: 'Yes' });
  }
  if (arcanean.evolves) {
    attrs.push({ trait_type: 'Evolves', value: 'Yes' });
  }

  return attrs;
}

// ---------------------------------------------------------------------------
// Metadata construction
// ---------------------------------------------------------------------------

/** Build a complete NFTMetadata object from constituent parts. */
export function buildMetadata(params: {
  name: string;
  description: string;
  imageUri: string;
  arcanean: ArcaneanAttributes;
  externalUrl?: string;
  animationUrl?: string;
}): NFTMetadata {
  return {
    name: params.name,
    description: params.description,
    image: params.imageUri,
    external_url: params.externalUrl ?? 'https://arcanea.ai',
    animation_url: params.animationUrl,
    attributes: buildAttributes(params.arcanean),
    properties: {
      category: 'image',
      creators: [{ address: '', share: 100 }],
    },
    arcanean: params.arcanean,
  };
}

// ---------------------------------------------------------------------------
// Guardian-specific metadata presets
// ---------------------------------------------------------------------------

const GATE_NAMES: Record<Guardian, string> = {
  lyssandria: 'Foundation',
  leyla: 'Flow',
  draconia: 'Fire',
  maylinn: 'Heart',
  alera: 'Voice',
  lyria: 'Sight',
  aiyami: 'Crown',
  elara: 'Shift',
  ino: 'Unity',
  shinkami: 'Source',
};

const GUARDIAN_HOUSES: Record<Guardian, House> = {
  lyssandria: 'terra',
  leyla: 'aqualis',
  draconia: 'pyros',
  maylinn: 'ventus',
  alera: 'ventus',
  lyria: 'synthesis',
  aiyami: 'lumina',
  elara: 'synthesis',
  ino: 'synthesis',
  shinkami: 'lumina',
};

const GUARDIAN_DESCRIPTIONS: Record<Guardian, string> = {
  lyssandria:
    'Guardian of the Foundation Gate. Keeper of stability and survival. Her presence grounds all who seek her wisdom.',
  leyla:
    'Guardian of the Flow Gate. Mistress of creativity and emotion. Her waters carry the dreams of all creators.',
  draconia:
    'Guardian of the Fire Gate. Commander of power and will. Her flames forge the strongest creations.',
  maylinn:
    'Guardian of the Heart Gate. Healer and nurturer. Her gentle wind connects all hearts in the Arcanea.',
  alera:
    'Guardian of the Voice Gate. Speaker of truth and expression. Her words cut through deception like crystal.',
  lyria:
    'Guardian of the Sight Gate. Seer of intuition and vision. She perceives what others cannot.',
  aiyami:
    'Guardian of the Crown Gate. Bringer of enlightenment. Her cosmic wisdom illuminates the path forward.',
  elara:
    'Guardian of the Shift Gate. Master of perspective and change. She reveals new dimensions of understanding.',
  ino:
    'Guardian of the Unity Gate. Weaver of partnerships. She brings creators together in perfect collaboration.',
  shinkami:
    'Guardian of the Source Gate. The Origin and the End. Meta-consciousness made manifest.',
};

/**
 * Create a complete Guardian NFT metadata object pre-filled with
 * canonical lore values.
 */
export function createGuardianMetadata(
  guardian: Guardian,
  imageUri: string,
  tier: NFTTier = 'epic',
): NFTMetadata {
  const element = GUARDIAN_ELEMENTS[guardian];
  const godbeast = GUARDIAN_GODBEASTS[guardian];
  const frequency = GATE_FREQUENCIES[guardian];
  const gateName = GATE_NAMES[guardian];
  const house = GUARDIAN_HOUSES[guardian];

  return buildMetadata({
    name: `${capitalize(guardian)} \u2014 Guardian of the ${gateName} Gate`,
    description: GUARDIAN_DESCRIPTIONS[guardian],
    imageUri,
    arcanean: {
      element,
      guardian,
      godbeast,
      rank: 'luminor',
      house,
      gateLevel: 10,
      frequency,
      tier,
      soulbound: false,
      evolves: tier !== 'legendary',
    },
  });
}
