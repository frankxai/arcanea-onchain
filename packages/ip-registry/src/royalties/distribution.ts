/**
 * @arcanea/ip-registry — Royalty Distribution
 *
 * Manages the accumulation, calculation, and claiming of royalties
 * across the Arcanea IP derivative tree.
 *
 * Uses a pull-based claiming pattern:
 * 1. Sales are recorded, royalties are accumulated per recipient
 * 2. Recipients claim their pending royalties when ready
 * 3. Distribution reports provide transparency
 */

import type { RoyaltyDistribution, RoyaltyReport } from '../types';
import { getAsset } from '../register/assets';
import { calculateRoyaltyFlow, getLineage } from '../derivatives/tree';

// ---------------------------------------------------------------------------
// In-memory royalty ledger
// ---------------------------------------------------------------------------

/**
 * Royalty balances keyed by recipient wallet address.
 * In production this would be on-chain state.
 */
const royaltyLedger = new Map<string, RoyaltyDistribution>();

// ---------------------------------------------------------------------------
// Sale Recording
// ---------------------------------------------------------------------------

/**
 * Record a sale and distribute royalties to all ancestors in the
 * derivative tree.
 *
 * @param assetId - The IP asset that was sold
 * @param saleAmount - Sale amount in smallest currency unit (e.g., lamports, wei)
 * @returns Array of distributions created by this sale
 */
export function recordSale(
  assetId: string,
  saleAmount: bigint,
): RoyaltyDistribution[] {
  const asset = getAsset(assetId);
  if (!asset) {
    throw new Error(`Asset '${assetId}' not found`);
  }

  const flow = calculateRoyaltyFlow(assetId);
  const distributions: RoyaltyDistribution[] = [];

  for (const entry of flow) {
    const royaltyAmount =
      (saleAmount * BigInt(Math.round(entry.percentage * 100))) / 10000n;

    if (royaltyAmount <= 0n) continue;

    const existing = royaltyLedger.get(entry.creator);
    if (existing) {
      existing.earned += royaltyAmount;
      existing.pending += royaltyAmount;
      distributions.push({ ...existing });
    } else {
      const distribution: RoyaltyDistribution = {
        recipient: entry.creator,
        percentage: entry.percentage,
        earned: royaltyAmount,
        claimed: 0n,
        pending: royaltyAmount,
      };
      royaltyLedger.set(entry.creator, distribution);
      distributions.push({ ...distribution });
    }
  }

  return distributions;
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

/**
 * Claim pending royalties for a given recipient.
 *
 * Pull pattern: the recipient initiates the claim. In production,
 * this would trigger an on-chain transfer.
 *
 * @param recipient - Wallet address of the claimant
 * @param amount - Amount to claim (if undefined, claims all pending)
 * @returns The claimed amount, or 0n if nothing to claim
 */
export function claimRoyalties(
  recipient: string,
  amount?: bigint,
): { claimed: bigint; remaining: bigint } {
  const distribution = royaltyLedger.get(recipient);

  if (!distribution || distribution.pending <= 0n) {
    return { claimed: 0n, remaining: 0n };
  }

  const claimAmount =
    amount !== undefined && amount < distribution.pending
      ? amount
      : distribution.pending;

  distribution.claimed += claimAmount;
  distribution.pending -= claimAmount;

  return {
    claimed: claimAmount,
    remaining: distribution.pending,
  };
}

// ---------------------------------------------------------------------------
// Balance Queries
// ---------------------------------------------------------------------------

/**
 * Get the current royalty balance for a recipient.
 */
export function getRoyaltyBalance(
  recipient: string,
): RoyaltyDistribution | null {
  const distribution = royaltyLedger.get(recipient);
  return distribution ? { ...distribution } : null;
}

/**
 * Get all royalty distributions (entire ledger).
 */
export function getAllDistributions(): RoyaltyDistribution[] {
  return Array.from(royaltyLedger.values()).map((d) => ({ ...d }));
}

/**
 * Get the total pending royalties across all recipients.
 */
export function getTotalPendingRoyalties(): bigint {
  let total = 0n;
  for (const distribution of royaltyLedger.values()) {
    total += distribution.pending;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Distribution Report
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive royalty report for a root asset.
 *
 * The report includes all distributions along the derivative tree,
 * with totals for earned, claimed, and pending amounts.
 */
export function generateRoyaltyReport(rootAssetId: string): RoyaltyReport {
  const rootAsset = getAsset(rootAssetId);
  if (!rootAsset) {
    throw new Error(`Asset '${rootAssetId}' not found`);
  }

  // Collect all asset IDs in the tree
  const assetIds = collectAllAssetIds(rootAssetId);

  // Collect all unique creators from the tree
  const creators = new Set<string>();
  for (const id of assetIds) {
    const asset = getAsset(id);
    if (asset) {
      creators.add(asset.creator);
    }
  }

  // Build distributions for creators who have entries in the ledger
  const distributions: RoyaltyDistribution[] = [];
  let totalEarned = 0n;
  let totalClaimed = 0n;
  let totalPending = 0n;

  for (const creator of creators) {
    const entry = royaltyLedger.get(creator);
    if (entry) {
      distributions.push({ ...entry });
      totalEarned += entry.earned;
      totalClaimed += entry.claimed;
      totalPending += entry.pending;
    }
  }

  return {
    rootAssetId,
    distributions,
    totalEarned,
    totalClaimed,
    totalPending,
    generatedAt: new Date(),
  };
}

/**
 * Collect all asset IDs in a derivative tree recursively.
 */
function collectAllAssetIds(assetId: string): string[] {
  const asset = getAsset(assetId);
  if (!asset) return [];

  const ids = [assetId];
  for (const childId of asset.derivatives) {
    ids.push(...collectAllAssetIds(childId));
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Royalty Calculation Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the royalty amount for a hypothetical sale of a given asset.
 *
 * Does NOT record the sale — purely a preview/estimation.
 *
 * @param assetId - The asset being sold
 * @param saleAmount - The hypothetical sale amount
 * @returns Breakdown of royalties per recipient
 */
export function estimateRoyalties(
  assetId: string,
  saleAmount: bigint,
): Array<{
  recipient: string;
  assetName: string;
  amount: bigint;
  percentage: number;
}> {
  const flow = calculateRoyaltyFlow(assetId);

  return flow.map((entry) => ({
    recipient: entry.creator,
    assetName: entry.assetName,
    amount:
      (saleAmount * BigInt(Math.round(entry.percentage * 100))) / 10000n,
    percentage: entry.percentage,
  }));
}

/**
 * Calculate the seller's net proceeds after all royalties are deducted.
 *
 * @param assetId - The asset being sold
 * @param saleAmount - The gross sale amount
 * @returns The net amount the seller receives
 */
export function calculateNetProceeds(
  assetId: string,
  saleAmount: bigint,
): bigint {
  const royalties = estimateRoyalties(assetId, saleAmount);
  const totalRoyalties = royalties.reduce((sum, r) => sum + r.amount, 0n);
  return saleAmount - totalRoyalties;
}

// ---------------------------------------------------------------------------
// Ledger Management (testing / admin)
// ---------------------------------------------------------------------------

/**
 * Clear the entire royalty ledger. Used for testing.
 */
export function clearRoyaltyLedger(): void {
  royaltyLedger.clear();
}
