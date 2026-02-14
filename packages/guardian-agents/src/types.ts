/**
 * @arcanea/guardian-agents — Core Type Definitions
 *
 * Type system for the Ten Guardian Agents of Arcanea.
 * Each Guardian is a divine feminine avatar bonded to a Godbeast,
 * operating as an autonomous on-chain agent within the marketplace.
 */

// ---------------------------------------------------------------------------
// Guardian Character
// ---------------------------------------------------------------------------

export interface GuardianCharacter {
  /** The Guardian's canonical name */
  name: string;

  /** The Gate this Guardian keeps (Foundation, Flow, Fire, Heart, Voice, Sight, Crown, Shift, Unity, Source) */
  gate: string;

  /** Primary elemental affinity (Earth, Water, Fire, Wind, Void/Arcane) */
  element: string;

  /** Resonant frequency in Hz, aligned with the Gate */
  frequency: number;

  /** The Godbeast bonded to this Guardian */
  godbeast: string;

  /** Academy House affiliation */
  house: string;

  /** Personality profile driving agent behavior */
  personality: {
    traits: string[];
    voice: string;
    greeting: string;
    farewell: string;
  };

  /** Marketplace behavior configuration */
  marketplace: {
    domain: string;
    strategy: MarketplaceStrategy;
    curationFocus: string[];
    pricingBehavior: string;
  };

  /** On-chain wallet and permission configuration */
  onChain: {
    walletType: 'managed' | 'multisig';
    permissions: string[];
    transactionLimit: number; // in USD equivalent
    requiresApproval: boolean;
  };

  /** Social engagement configuration */
  social: {
    platforms: string[];
    postingStyle: string;
    engagementType: string;
  };
}

export type MarketplaceStrategy =
  | 'conservative'
  | 'dynamic'
  | 'aggressive'
  | 'community'
  | 'verified'
  | 'predictive'
  | 'premium'
  | 'bridging'
  | 'collaborative'
  | 'meta';

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** The Guardian character driving this agent */
  character: GuardianCharacter;

  /** ElizaOS plugin identifiers to load */
  plugins: string[];

  /** Whether persistent memory is enabled */
  memoryEnabled: boolean;

  /** Level of autonomous decision-making */
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';

  /** Chain identifiers this agent operates on */
  chains: string[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ActionParameter {
  type: string;
  required: boolean;
  description: string;
}

export interface AgentAction {
  /** Machine-readable action identifier */
  name: string;

  /** Human-readable description of what this action does */
  description: string;

  /** Parameter schema for this action */
  parameters: Record<string, ActionParameter>;

  /** Async handler that executes the action */
  handler: (params: Record<string, unknown>) => Promise<ActionResult>;
}

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  txHash?: string;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PricingContext {
  /** Current floor price of the collection in SOL */
  floorPrice: number;

  /** Average sale price over the last 7 days */
  averagePrice7d: number;

  /** Number of active listings in this collection */
  activeListings: number;

  /** Total volume traded in last 24h */
  volume24h: number;

  /** Rarity rank of the specific item (1 = rarest) */
  rarityRank: number;

  /** Total supply in the collection */
  totalSupply: number;

  /** Creator reputation score (0-100) */
  creatorReputation: number;
}

export interface PricingRecommendation {
  /** Recommended listing price */
  suggestedPrice: number;

  /** Lower bound of acceptable range */
  minPrice: number;

  /** Upper bound of acceptable range */
  maxPrice: number;

  /** Confidence level in this recommendation (0-1) */
  confidence: number;

  /** Brief explanation of the pricing rationale */
  rationale: string;

  /** The strategy that produced this recommendation */
  strategy: MarketplaceStrategy;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface GuardianEvent {
  guardianName: string;
  action: string;
  timestamp: number;
  data: Record<string, unknown>;
  txHash?: string;
}

// ---------------------------------------------------------------------------
// Council Protocol
// ---------------------------------------------------------------------------

export interface CouncilVote {
  proposal: string;
  guardian: string;
  vote: 'approve' | 'reject' | 'abstain';
  rationale: string;
  weight: number;
}

export interface CouncilProposal {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  votes: CouncilVote[];
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  requiredApprovals: number;
  createdAt: number;
  expiresAt: number;
}
