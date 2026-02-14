/**
 * @arcanea/nft-engine — Prompt Templates
 *
 * Lore-consistent prompt templates for AI art generation.
 * Every prompt enforces the Arcanean visual language:
 *   - Express elements through MATERIALS + AMBIENT, never body transformation.
 *   - NO text, labels, annotations, or watermarks.
 *   - Color restraint: element color + teal (#7fffd4) + void (#0b0e14).
 *   - Glass morphism surfaces, cosmic backgrounds.
 */

import type { Element, Guardian, NFTTier } from '../types';
import { GUARDIAN_ELEMENTS } from '../types';

// ---------------------------------------------------------------------------
// Element material & lighting palettes
// ---------------------------------------------------------------------------

const ELEMENT_MATERIALS: Record<Element, string> = {
  fire: 'molten gold filigree, ember-lit obsidian, volcanic glass, smoldering amber crystals, heat-distorted air',
  water:
    'flowing crystal streams, moonlit silver, deep sapphire glass, frosted pearl surfaces, liquid mercury reflections',
  earth:
    'ancient moss-covered stone, jade crystal formations, petrified wood grain, emerald geode interiors, living root networks',
  wind: 'translucent gossamer threads, cloud-white marble, silver wind chimes, aurora-lit ice crystals, feather-light titanium',
  void: 'deep cosmic void, starfield nebula patterns, black opal surfaces, ultraviolet crystal, dimensional rifts with gold edges',
};

const ELEMENT_LIGHTING: Record<Element, string> = {
  fire: 'warm volumetric amber light from below, flickering ember particles, orange-gold rim lighting',
  water: 'cool moonlit blue luminescence, caustic water reflections, silver key light from above',
  earth: 'dappled forest light through canopy, warm golden hour tones, deep green ambient bounce',
  wind: 'bright ethereal white light, aurora borealis colors overhead, soft diffused silver glow',
  void: 'deep ultraviolet edge lighting, cosmic teal (#7fffd4) accents, gold (#ffd700) highlights against absolute black (#0b0e14)',
};

// ---------------------------------------------------------------------------
// Guardian visual descriptions (art direction, not body transformation)
// ---------------------------------------------------------------------------

const GUARDIAN_VISUALS: Record<Guardian, string> = {
  lyssandria:
    'regal woman with earth-toned armor of living stone and jade crystal, grounded and powerful, roots intertwining with her greaves',
  leyla:
    'flowing woman whose robes are liquid water and moonlight, graceful and fluid, with coral and pearl ornaments',
  draconia:
    'fierce warrior woman in volcanic obsidian armor with molten gold veins, commanding and powerful, dragon-scale pauldrons',
  maylinn:
    'gentle healer in gossamer wind-woven robes, kind eyes, surrounded by healing light and flower petals on the breeze',
  alera:
    'authoritative woman in crystalline armor that resonates with sound waves, truth-speaker, with a crown of singing crystals',
  lyria:
    'mystical seer with third-eye motif, robes of starfield fabric, cosmic jewelry, seeing beyond the visible spectrum',
  aiyami:
    'transcendent being in pure light-woven garments, crown of cosmic energy, serene and all-knowing expression',
  elara:
    'dimensional shifter whose appearance seems to exist across multiple planes simultaneously, geometric pattern clothing',
  ino: 'harmonious figure representing unity, dual-toned appearance blending multiple elements, collaborative energy',
  shinkami:
    'cosmic presence at the source of all creation, both ancient and timeless, radiating meta-consciousness',
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Build a full prompt for generating a Guardian portrait.
 *
 * The prompt encodes quality tier, visual description, elemental materials,
 * lighting direction, and explicit anti-patterns (no text/labels).
 */
export function buildGuardianPrompt(guardian: Guardian, tier: NFTTier): string {
  const element = GUARDIAN_ELEMENTS[guardian];
  const materials = ELEMENT_MATERIALS[element];
  const lighting = ELEMENT_LIGHTING[element];
  const description = GUARDIAN_VISUALS[guardian];

  const qualityPrefix =
    tier === 'legendary'
      ? 'Masterpiece quality, museum-worthy digital painting, 8K ultra-detail'
      : tier === 'epic'
        ? 'Professional illustration, high detail, cinematic quality'
        : 'Clean digital art, consistent style, detailed';

  return [
    qualityPrefix,
    `Portrait of ${description}.`,
    `Materials and textures: ${materials}.`,
    `Lighting: ${lighting}.`,
    'Dark cosmic void background (#0b0e14) with subtle cosmic mesh pattern.',
    'Glass morphism effects on armor/clothing surfaces.',
    'NO text, NO labels, NO annotations, NO watermarks.',
    'Express element through MATERIALS and AMBIENT effects, NOT body transformation.',
    'Composition: centered portrait, slight low angle for authority, 50%+ negative space.',
    'Color restraint: primary element color + teal (#7fffd4) accent + void background only.',
  ].join(' ');
}

/** Build a prompt for an Element Stone collectible. */
export function buildElementStonePrompt(element: Element): string {
  const materials = ELEMENT_MATERIALS[element];
  const lighting = ELEMENT_LIGHTING[element];

  return [
    'Professional product photography style, single object on dark void background.',
    `A mystical ${element} stone \u2014 a crystalline artifact radiating elemental power.`,
    `Materials: ${materials}.`,
    `Lighting: ${lighting}.`,
    'The stone hovers slightly above a dark reflective surface.',
    'Subtle particle effects emanating from the stone.',
    'Clean, centered composition with generous negative space.',
    'NO text, NO labels, NO annotations.',
    'Color: teal (#7fffd4) primary glow, element color secondary, void (#0b0e14) background.',
  ].join(' ');
}

/** Build a prompt for an Academy House badge. */
export function buildAcademyBadgePrompt(house: string, gateLevel: number): string {
  return [
    'Clean vector-style emblem design on dark cosmic background.',
    `Academy badge for House ${house}, Gate Level ${gateLevel}.`,
    'Circular medallion with intricate geometric patterns.',
    'Glass morphism surface with subtle inner glow.',
    'Teal (#7fffd4) and gold (#ffd700) color scheme.',
    'Engraved symbols representing the house element.',
    gateLevel > 5
      ? 'Luminous energy radiating from the badge center.'
      : 'Subtle shimmer on the badge surface.',
    'Professional heraldic design, balanced symmetry.',
    'NO text, NO labels, NO annotations.',
  ].join(' ');
}

/** Build a prompt for a Lore Fragment collectible NFT. */
export function buildLoreFragmentPrompt(collection: string): string {
  return [
    'Ancient scroll fragment floating in cosmic void.',
    `A piece of the ${collection} \u2014 glowing with preserved arcane knowledge.`,
    'Aged parchment with crystal-blue luminous writing visible at the edges.',
    'Glass morphism overlay effect on the parchment surface.',
    'Subtle particle effects \u2014 knowledge motes drifting from the fragment.',
    'Dark void (#0b0e14) background with cosmic star field.',
    'Teal (#7fffd4) glow emanating from the text.',
    'Centered composition, the fragment appears to hover weightlessly.',
    'NO readable text, just luminous glyph patterns.',
  ].join(' ');
}
