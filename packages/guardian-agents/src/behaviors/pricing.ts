/**
 * @arcanea/guardian-agents — Pricing Strategy Implementations
 *
 * Each Guardian has a distinct pricing philosophy encoded into their
 * marketplace strategy. This module implements those strategies as
 * concrete pricing functions that take market context and return
 * actionable price recommendations.
 *
 * The strategies are not arbitrary — they reflect each Guardian's
 * personality and Gate alignment:
 *
 * - Lyssandria (conservative): Stability above all. Protect floors.
 * - Leyla (dynamic): Flow with the market. Adapt in real-time.
 * - Draconia (aggressive): Demand maximum value. Never discount.
 * - Maylinn (community): Accessible prices. Creator sustainability.
 * - Alera (verified): Price reflects trust score. Authenticity premium.
 * - Lyria (predictive): Price where the market WILL be, not where it is.
 * - Aiyami (premium): Ultra-luxury. Scarcity-driven. Ceremonial.
 * - Elara (bridging): Cross-chain parity. Bridge-fee optimized.
 * - Ino (collaborative): Fair splits. Bundle incentives.
 * - Shinkami (meta): Governance parameters. Circuit breakers.
 */

import type { GuardianCharacter, MarketplaceStrategy, PricingContext, PricingRecommendation } from '../types';

// ---------------------------------------------------------------------------
// Strategy Implementations
// ---------------------------------------------------------------------------

/**
 * Lyssandria's conservative pricing.
 * Prices below market peaks to ensure consistent trades.
 * Defends floor prices aggressively.
 */
function conservativePricing(ctx: PricingContext): PricingRecommendation {
  const basePrice = ctx.averagePrice7d * 0.95; // Slightly below average
  const floorDefense = Math.max(basePrice, ctx.floorPrice * 1.05); // Never below floor + 5%

  return {
    suggestedPrice: roundToDecimals(floorDefense, 4),
    minPrice: roundToDecimals(ctx.floorPrice * 1.02, 4),
    maxPrice: roundToDecimals(ctx.averagePrice7d * 1.1, 4),
    confidence: 0.85,
    rationale:
      'Conservative pricing: below market average for reliable turnover, with floor price defense to maintain collection stability.',
    strategy: 'conservative',
  };
}

/**
 * Leyla's dynamic pricing.
 * Adapts to real-time demand signals and creator momentum.
 * Starts accessible, rises with engagement.
 */
function dynamicPricing(ctx: PricingContext): PricingRecommendation {
  // Dynamic factor based on volume relative to listings
  const demandRatio = ctx.volume24h / Math.max(ctx.activeListings, 1);
  const dynamicMultiplier = 1 + Math.min(demandRatio * 0.1, 0.5); // Cap at 50% above base

  const basePrice = ctx.averagePrice7d * dynamicMultiplier;

  // New creators get a 20% accessibility discount
  const creatorDiscount = ctx.creatorReputation < 30 ? 0.8 : 1.0;
  const adjusted = basePrice * creatorDiscount;

  return {
    suggestedPrice: roundToDecimals(adjusted, 4),
    minPrice: roundToDecimals(ctx.floorPrice * 0.9, 4), // Can go below floor for discovery
    maxPrice: roundToDecimals(ctx.averagePrice7d * 2.0, 4),
    confidence: 0.7, // Dynamic = more uncertainty
    rationale:
      `Dynamic pricing: demand ratio ${demandRatio.toFixed(2)} yields ${dynamicMultiplier.toFixed(2)}x multiplier.${creatorDiscount < 1 ? ' Emerging creator accessibility discount applied.' : ''}`,
    strategy: 'dynamic',
  };
}

/**
 * Draconia's aggressive pricing.
 * High starting points. No discounts.
 * Rarity and power command premium.
 */
function aggressivePricing(ctx: PricingContext): PricingRecommendation {
  // Rarity multiplier: top 1% gets 5x, top 10% gets 2x, rest gets 1.2x
  const rarityPercentile = ctx.rarityRank / ctx.totalSupply;
  let rarityMultiplier: number;
  if (rarityPercentile <= 0.01) rarityMultiplier = 5.0;
  else if (rarityPercentile <= 0.1) rarityMultiplier = 2.0;
  else rarityMultiplier = 1.2;

  const basePrice = ctx.averagePrice7d * rarityMultiplier;
  const aggressive = Math.max(basePrice, ctx.floorPrice * 2); // At least 2x floor

  return {
    suggestedPrice: roundToDecimals(aggressive, 4),
    minPrice: roundToDecimals(ctx.averagePrice7d * 1.5, 4), // Never below 1.5x average
    maxPrice: roundToDecimals(aggressive * 3, 4), // Sky is the limit
    confidence: 0.75,
    rationale:
      `Aggressive pricing: rarity percentile ${(rarityPercentile * 100).toFixed(1)}% yields ${rarityMultiplier}x multiplier. The forge does not discount.`,
    strategy: 'aggressive',
  };
}

/**
 * Maylinn's community pricing.
 * Balance creator sustainability with collector accessibility.
 * Subsidize emerging creators when needed.
 */
function communityPricing(ctx: PricingContext): PricingRecommendation {
  // Community-optimized: target the median buyer, not the top bidder
  const communityPrice = ctx.averagePrice7d * 0.85;

  // Creator sustainability floor: never price below what sustains the creator
  const sustainabilityFloor = ctx.floorPrice * 0.95;
  const adjusted = Math.max(communityPrice, sustainabilityFloor);

  // Additional support for low-reputation (new) creators
  const subsidy = ctx.creatorReputation < 20 ? 0.1 * ctx.floorPrice : 0;

  return {
    suggestedPrice: roundToDecimals(adjusted, 4),
    minPrice: roundToDecimals(sustainabilityFloor, 4),
    maxPrice: roundToDecimals(ctx.averagePrice7d * 1.2, 4),
    confidence: 0.8,
    rationale:
      `Community pricing: accessible at 85% of average for broad participation.${subsidy > 0 ? ` Creator subsidy of ${subsidy.toFixed(4)} SOL recommended from community treasury.` : ''}`,
    strategy: 'community',
  };
}

/**
 * Alera's verification-weighted pricing.
 * Price reflects authenticity score. Verified items earn a trust premium.
 */
function verifiedPricing(ctx: PricingContext): PricingRecommendation {
  // Trust premium based on creator reputation (verified = higher premium)
  const trustMultiplier = 1 + (ctx.creatorReputation / 100) * 0.3; // Up to 30% premium
  const basePrice = ctx.averagePrice7d * trustMultiplier;

  return {
    suggestedPrice: roundToDecimals(basePrice, 4),
    minPrice: roundToDecimals(ctx.floorPrice, 4),
    maxPrice: roundToDecimals(basePrice * 1.5, 4),
    confidence: 0.9, // High confidence — verification reduces uncertainty
    rationale:
      `Verification-weighted pricing: creator reputation ${ctx.creatorReputation}/100 yields ${trustMultiplier.toFixed(2)}x trust multiplier. Authenticity commands premium.`,
    strategy: 'verified',
  };
}

/**
 * Lyria's predictive pricing.
 * Price where the market will be in 48-72 hours.
 * Uses trend signals and cycle positioning.
 */
function predictivePricing(ctx: PricingContext): PricingRecommendation {
  // Simple trend detection: volume acceleration
  const volumeSignal = ctx.volume24h > ctx.averagePrice7d * ctx.activeListings * 0.5 ? 1.15 : 0.95;

  // Rarity trend: rare items in active markets appreciate
  const rarityPercentile = ctx.rarityRank / ctx.totalSupply;
  const rarityTrend = rarityPercentile < 0.2 ? 1.1 : 1.0;

  const predictedPrice = ctx.averagePrice7d * volumeSignal * rarityTrend;

  return {
    suggestedPrice: roundToDecimals(predictedPrice, 4),
    minPrice: roundToDecimals(ctx.averagePrice7d * 0.9, 4),
    maxPrice: roundToDecimals(predictedPrice * 1.3, 4),
    confidence: 0.65, // Predictions carry inherent uncertainty
    rationale:
      `Predictive pricing: volume signal ${volumeSignal.toFixed(2)}, rarity trend ${rarityTrend.toFixed(2)}. Price targets 48-72h forward value.`,
    strategy: 'predictive',
  };
}

/**
 * Aiyami's premium pricing.
 * Ultra-luxury. Only the most exceptional works.
 * Scarcity and ceremony drive value.
 */
function premiumPricing(ctx: PricingContext): PricingRecommendation {
  // Premium floor: Crown Gate items start at 10x average
  const premiumBase = ctx.averagePrice7d * 10;

  // Additional scarcity multiplier for truly rare items
  const rarityPercentile = ctx.rarityRank / ctx.totalSupply;
  const scarcityBonus = rarityPercentile <= 0.01 ? 3.0 : rarityPercentile <= 0.05 ? 2.0 : 1.0;

  const ceremonialPrice = premiumBase * scarcityBonus;

  return {
    suggestedPrice: roundToDecimals(ceremonialPrice, 4),
    minPrice: roundToDecimals(premiumBase, 4), // Never below 10x average
    maxPrice: roundToDecimals(ceremonialPrice * 5, 4), // Legendary ceiling
    confidence: 0.6, // Premium markets are inherently uncertain
    rationale:
      `Premium ceremonial pricing: ${scarcityBonus}x scarcity multiplier on 10x base. The Crown Gate accepts only the transcendent.`,
    strategy: 'premium',
  };
}

/**
 * Elara's bridge-optimized pricing.
 * Cross-chain parity with fee optimization.
 */
function bridgingPricing(ctx: PricingContext): PricingRecommendation {
  // Base price with cross-chain fee buffer (estimated 2-5% for bridges)
  const bridgeFeeBuffer = 1.03; // 3% average bridge cost
  const crossChainPrice = ctx.averagePrice7d * bridgeFeeBuffer;

  // Parity adjustment: ensure value is equivalent across chains
  const parityAdjusted = crossChainPrice;

  return {
    suggestedPrice: roundToDecimals(parityAdjusted, 4),
    minPrice: roundToDecimals(ctx.floorPrice * bridgeFeeBuffer, 4),
    maxPrice: roundToDecimals(ctx.averagePrice7d * 1.5, 4),
    confidence: 0.75,
    rationale:
      `Bridge-optimized pricing: ${(bridgeFeeBuffer * 100 - 100).toFixed(1)}% buffer for cross-chain settlement fees. Parity maintained across ecosystems.`,
    strategy: 'bridging',
  };
}

/**
 * Ino's collaborative pricing.
 * Fair splits and bundle incentives.
 */
function collaborativePricing(ctx: PricingContext): PricingRecommendation {
  // Collaborative discount: bundles are worth more together, priced to incentivize completion
  const bundleDiscount = 0.9; // 10% discount for collaborative/bundled items
  const basePrice = ctx.averagePrice7d * bundleDiscount;

  return {
    suggestedPrice: roundToDecimals(basePrice, 4),
    minPrice: roundToDecimals(ctx.floorPrice * 0.85, 4), // Bundle items can go below individual floor
    maxPrice: roundToDecimals(ctx.averagePrice7d * 1.3, 4),
    confidence: 0.8,
    rationale:
      'Collaborative pricing: 10% bundle incentive applied. Priced to encourage collection completion and co-ownership participation.',
    strategy: 'collaborative',
  };
}

/**
 * Shinkami's meta-governance pricing.
 * Sets parameters, not individual prices.
 * Circuit breakers and global fee structures.
 */
function metaPricing(ctx: PricingContext): PricingRecommendation {
  // Meta-level: Shinkami does not price individual items
  // Instead, provides governance recommendations for the system
  const ecosystemHealth = ctx.volume24h / Math.max(ctx.activeListings, 1);
  const healthMultiplier = ecosystemHealth > 1 ? 1.0 : 0.95; // Slight reduction in unhealthy markets

  const governancePrice = ctx.averagePrice7d * healthMultiplier;

  return {
    suggestedPrice: roundToDecimals(governancePrice, 4),
    minPrice: roundToDecimals(ctx.floorPrice * 0.8, 4), // Emergency floor (circuit breaker)
    maxPrice: roundToDecimals(ctx.averagePrice7d * 20, 4), // Anti-manipulation ceiling
    confidence: 0.95, // Governance parameters are high-confidence by design
    rationale:
      `Meta-governance pricing: ecosystem health ratio ${ecosystemHealth.toFixed(2)}. Circuit breaker floor at 80% of collection floor. Anti-manipulation ceiling at 20x average.`,
    strategy: 'meta',
  };
}

// ---------------------------------------------------------------------------
// Strategy Router
// ---------------------------------------------------------------------------

/**
 * Map of strategy identifiers to pricing functions.
 */
const STRATEGY_MAP: Record<
  MarketplaceStrategy,
  (ctx: PricingContext) => PricingRecommendation
> = {
  conservative: conservativePricing,
  dynamic: dynamicPricing,
  aggressive: aggressivePricing,
  community: communityPricing,
  verified: verifiedPricing,
  predictive: predictivePricing,
  premium: premiumPricing,
  bridging: bridgingPricing,
  collaborative: collaborativePricing,
  meta: metaPricing,
};

/**
 * Calculate a price recommendation using the specified Guardian's strategy.
 *
 * @param guardian - The Guardian character whose strategy to use
 * @param context - Current market context for the item being priced
 * @returns A pricing recommendation aligned with the Guardian's personality
 */
export function calculatePrice(
  guardian: GuardianCharacter,
  context: PricingContext,
): PricingRecommendation {
  const strategyFn = STRATEGY_MAP[guardian.marketplace.strategy];
  return strategyFn(context);
}

/**
 * Calculate pricing recommendations from ALL Guardians for a single item.
 * Useful for Council-level pricing decisions where multiple perspectives
 * inform the final price.
 *
 * @param context - Current market context for the item
 * @returns Array of 10 pricing recommendations, one per Guardian
 */
export function calculateCouncilPricing(
  guardians: readonly GuardianCharacter[],
  context: PricingContext,
): PricingRecommendation[] {
  return guardians.map((guardian) => calculatePrice(guardian, context));
}

/**
 * Calculate the Council's consensus price by weighted average.
 * Each Guardian's recommendation is weighted by their confidence score.
 *
 * @param recommendations - Array of pricing recommendations from Council members
 * @returns A single consensus price
 */
export function calculateConsensusPrice(
  recommendations: PricingRecommendation[],
): number {
  const totalWeight = recommendations.reduce((sum, r) => sum + r.confidence, 0);
  const weightedSum = recommendations.reduce(
    (sum, r) => sum + r.suggestedPrice * r.confidence,
    0,
  );

  return roundToDecimals(weightedSum / totalWeight, 4);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
