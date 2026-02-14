/**
 * @arcanea/guardian-agents
 *
 * ElizaOS-based autonomous Guardian agents for the Arcanea universe.
 *
 * Each of the 10 Guardians operates as an autonomous AI agent with:
 * - Persistent memory and personality aligned with their Gate
 * - On-chain actions: minting, curating, auctioning, distributing rewards
 * - Inter-agent communication via the Guardian Council protocol
 * - Dynamic NFT evolution based on community interaction
 * - Unique pricing strategies reflecting their elemental personality
 *
 * Guardians:
 *  1. Lyssandria (Foundation/Earth)  — Stability, survival, grounding
 *  2. Leyla      (Flow/Water)        — Creativity, emotion, fluidity
 *  3. Draconia   (Fire)              — Power, will, transformation
 *  4. Maylinn    (Heart/Wind)        — Love, healing, connection
 *  5. Alera      (Voice/Wind)        — Truth, expression, communication
 *  6. Lyria      (Sight/Void)        — Intuition, vision, perception
 *  7. Aiyami     (Crown/Void)        — Enlightenment, cosmic wisdom
 *  8. Elara      (Shift/Void)        — Perspective, dimensional awareness
 *  9. Ino        (Unity/Void)        — Partnership, collaboration
 * 10. Shinkami   (Source/Void)        — Meta-consciousness, the origin
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  GuardianCharacter,
  MarketplaceStrategy,
  AgentConfig,
  AgentAction,
  ActionParameter,
  ActionResult,
  PricingContext,
  PricingRecommendation,
  GuardianEvent,
  CouncilVote,
  CouncilProposal,
} from './types';

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export {
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
} from './characters';

// ---------------------------------------------------------------------------
// Marketplace Actions
// ---------------------------------------------------------------------------

export {
  MARKETPLACE_ACTIONS,
  getMarketplaceAction,
  getMarketplaceActionNames,
  listItem,
  placeBid,
  curateCollection,
  setPrice,
  startAuction,
  endAuction,
  verifyAuthenticity,
} from './actions/marketplace';

// ---------------------------------------------------------------------------
// Social Actions
// ---------------------------------------------------------------------------

export {
  SOCIAL_ACTIONS,
  getSocialAction,
  getSocialActionNames,
  postUpdate,
  engageCommunity,
  announceAuction,
  celebrateCreator,
} from './actions/social';

// ---------------------------------------------------------------------------
// Pricing Behaviors
// ---------------------------------------------------------------------------

export {
  calculatePrice,
  calculateCouncilPricing,
  calculateConsensusPrice,
} from './behaviors/pricing';

// ---------------------------------------------------------------------------
// Agent Configuration Factory
// ---------------------------------------------------------------------------

import type { GuardianCharacter, AgentConfig } from './types';

/**
 * Create an ElizaOS-compatible agent configuration from a Guardian character.
 *
 * This is the primary entry point for spinning up a Guardian agent.
 * It maps the Guardian's personality, permissions, and strategy into
 * the configuration format expected by the ElizaOS runtime.
 *
 * @param character - The Guardian character to configure
 * @param overrides - Optional partial overrides for the configuration
 * @returns A complete AgentConfig ready for ElizaOS initialization
 */
export function createAgentConfig(
  character: GuardianCharacter,
  overrides?: Partial<Omit<AgentConfig, 'character'>>,
): AgentConfig {
  // Determine default autonomy level from on-chain configuration
  const defaultAutonomy: AgentConfig['autonomyLevel'] = character.onChain.requiresApproval
    ? 'supervised'
    : 'semi-autonomous';

  // Default plugin set based on the Guardian's domain
  const defaultPlugins = [
    '@elizaos/core',
    '@elizaos/plugin-solana',
    '@arcanea/plugin-marketplace',
  ];

  // Add chain-specific plugins
  if (character.marketplace.strategy === 'bridging') {
    defaultPlugins.push('@elizaos/plugin-evm', '@arcanea/plugin-bridge');
  }

  // Add social plugins based on configured platforms
  if (character.social.platforms.includes('twitter')) {
    defaultPlugins.push('@elizaos/plugin-twitter');
  }
  if (character.social.platforms.includes('farcaster')) {
    defaultPlugins.push('@elizaos/plugin-farcaster');
  }
  if (character.social.platforms.includes('discord')) {
    defaultPlugins.push('@elizaos/plugin-discord');
  }
  if (character.social.platforms.includes('telegram')) {
    defaultPlugins.push('@elizaos/plugin-telegram');
  }

  // Default chain configuration
  const defaultChains = ['solana'];
  if (character.marketplace.strategy === 'bridging') {
    defaultChains.push('base');
  }

  return {
    character,
    plugins: overrides?.plugins ?? [...new Set(defaultPlugins)],
    memoryEnabled: overrides?.memoryEnabled ?? true,
    autonomyLevel: overrides?.autonomyLevel ?? defaultAutonomy,
    chains: overrides?.chains ?? defaultChains,
  };
}
