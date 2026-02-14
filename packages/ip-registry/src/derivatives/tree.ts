/**
 * @arcanea/ip-registry — Derivative Tree Management
 *
 * Tracks and manages the lineage of IP derivatives within Arcanea.
 * Every derivative asset forms a tree rooted at a canonical IP asset.
 *
 * Key responsibilities:
 * - Lineage tracking (parent -> child relationships)
 * - Royalty flow calculation along the tree
 * - Permission validation for derivative creation
 * - Depth limiting (max 5 generations)
 * - Tree visualization data for UI rendering
 */

import type { IPAsset, DerivativeTreeNode } from '../types';
import {
  getAsset,
  getDirectDerivatives,
  getDerivativeDepth,
  MAX_DERIVATIVE_DEPTH,
} from '../register/assets';

// ---------------------------------------------------------------------------
// Tree Construction
// ---------------------------------------------------------------------------

/**
 * Build the complete derivative tree starting from a root asset.
 *
 * Recursively traverses all derivatives, constructing a tree structure
 * with depth and cumulative royalty information at each node.
 *
 * @param rootAssetId - The ID of the root asset
 * @returns The tree root node, or null if the asset doesn't exist
 */
export function buildDerivativeTree(
  rootAssetId: string,
): DerivativeTreeNode | null {
  const rootAsset = getAsset(rootAssetId);
  if (!rootAsset) return null;

  return buildNodeRecursive(rootAsset, 0, 100);
}

function buildNodeRecursive(
  asset: IPAsset,
  depth: number,
  parentCumulativeBase: number,
): DerivativeTreeNode {
  const royaltyShare = asset.licenseTerms.royaltyPercentage;
  const cumulativeRoyalty =
    depth === 0 ? 0 : (parentCumulativeBase * royaltyShare) / 100;

  const children = getDirectDerivatives(asset.id);
  const remainingBase = parentCumulativeBase - cumulativeRoyalty;

  return {
    asset,
    depth,
    cumulativeRoyalty,
    children: children.map((child) =>
      buildNodeRecursive(child, depth + 1, remainingBase),
    ),
  };
}

// ---------------------------------------------------------------------------
// Lineage Tracking
// ---------------------------------------------------------------------------

/**
 * Get the full lineage chain from a derivative back to its root.
 *
 * Returns an array ordered from the asset itself back to the root:
 * [self, parent, grandparent, ..., root]
 */
export function getLineage(assetId: string): IPAsset[] {
  const lineage: IPAsset[] = [];
  let current = getAsset(assetId);

  while (current) {
    lineage.push(current);
    if (!current.parentId) break;
    current = getAsset(current.parentId);
    // Safety: prevent infinite loops
    if (lineage.length > MAX_DERIVATIVE_DEPTH + 2) break;
  }

  return lineage;
}

/**
 * Get just the root ancestor of a derivative.
 */
export function getRootAncestor(assetId: string): IPAsset | undefined {
  const lineage = getLineage(assetId);
  return lineage.length > 0 ? lineage[lineage.length - 1] : undefined;
}

/**
 * Check if two assets share a common ancestor.
 */
export function shareCommonAncestor(
  assetIdA: string,
  assetIdB: string,
): boolean {
  const rootA = getRootAncestor(assetIdA);
  const rootB = getRootAncestor(assetIdB);
  if (!rootA || !rootB) return false;
  return rootA.id === rootB.id;
}

// ---------------------------------------------------------------------------
// Permission Validation
// ---------------------------------------------------------------------------

/**
 * Validate whether a new derivative can be created from a given parent.
 *
 * Checks:
 * 1. Parent exists
 * 2. Parent's license allows derivatives
 * 3. Depth limit is not exceeded
 *
 * @returns An object with `allowed` boolean and `reason` if denied
 */
export function canCreateDerivative(parentAssetId: string): {
  allowed: boolean;
  reason?: string;
} {
  const parent = getAsset(parentAssetId);

  if (!parent) {
    return { allowed: false, reason: `Asset '${parentAssetId}' not found` };
  }

  if (!parent.licenseTerms.derivativesAllowed) {
    return {
      allowed: false,
      reason: `Asset '${parent.name}' does not allow derivatives (license type: ${parent.licenseTerms.type})`,
    };
  }

  const depth = getDerivativeDepth(parentAssetId);
  if (depth >= MAX_DERIVATIVE_DEPTH) {
    return {
      allowed: false,
      reason: `Maximum derivative depth of ${MAX_DERIVATIVE_DEPTH} reached (current depth: ${depth})`,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Royalty Flow Calculation
// ---------------------------------------------------------------------------

/**
 * Represents a single royalty recipient in the flow chain.
 */
export interface RoyaltyFlowEntry {
  /** The asset owner receiving royalties */
  assetId: string;
  /** The asset name (for display) */
  assetName: string;
  /** Creator wallet address */
  creator: string;
  /** Percentage of the sale price this recipient gets */
  percentage: number;
  /** Depth in the tree (0 = root) */
  depth: number;
}

/**
 * Calculate the royalty flow for a sale of a given asset.
 *
 * When a derivative is sold, royalties flow upward through the tree:
 * - The immediate parent gets their royalty percentage
 * - The grandparent gets their percentage of the remainder
 * - And so on up to the root
 *
 * The seller retains whatever is left after all royalties are distributed.
 *
 * @param assetId - The asset being sold
 * @param salePercentage - The total percentage to distribute (default 100)
 * @returns Array of royalty flow entries from seller to root
 */
export function calculateRoyaltyFlow(
  assetId: string,
  salePercentage: number = 100,
): RoyaltyFlowEntry[] {
  const lineage = getLineage(assetId);
  if (lineage.length <= 1) return []; // Root assets have no royalty flow

  const flow: RoyaltyFlowEntry[] = [];
  let remainingPercentage = salePercentage;

  // Skip the first entry (the asset being sold) and walk up the chain
  for (let i = 1; i < lineage.length; i++) {
    const ancestor = lineage[i];
    const royaltyRate = ancestor.licenseTerms.royaltyPercentage / 100;
    const payment = remainingPercentage * royaltyRate;

    flow.push({
      assetId: ancestor.id,
      assetName: ancestor.name,
      creator: ancestor.creator,
      percentage: Math.round(payment * 10000) / 10000, // 4 decimal precision
      depth: lineage.length - 1 - i,
    });

    remainingPercentage -= payment;
  }

  return flow;
}

/**
 * Calculate the total royalty percentage that would be deducted from a sale
 * of the given asset (sum of all ancestor claims).
 */
export function getTotalRoyaltyBurden(assetId: string): number {
  const flow = calculateRoyaltyFlow(assetId);
  return flow.reduce((sum, entry) => sum + entry.percentage, 0);
}

// ---------------------------------------------------------------------------
// Tree Statistics
// ---------------------------------------------------------------------------

/**
 * Calculate statistics about a derivative tree.
 */
export interface TreeStats {
  /** Total number of nodes in the tree */
  totalNodes: number;
  /** Maximum depth reached */
  maxDepth: number;
  /** Number of leaf nodes (no children) */
  leafCount: number;
  /** Average branching factor */
  averageBranching: number;
  /** Set of unique creators */
  uniqueCreators: number;
}

export function getTreeStats(rootAssetId: string): TreeStats | null {
  const tree = buildDerivativeTree(rootAssetId);
  if (!tree) return null;

  const stats = {
    totalNodes: 0,
    maxDepth: 0,
    leafCount: 0,
    branchingSum: 0,
    nonLeafCount: 0,
    creators: new Set<string>(),
  };

  function traverse(node: DerivativeTreeNode): void {
    stats.totalNodes++;
    stats.creators.add(node.asset.creator);

    if (node.depth > stats.maxDepth) {
      stats.maxDepth = node.depth;
    }

    if (node.children.length === 0) {
      stats.leafCount++;
    } else {
      stats.nonLeafCount++;
      stats.branchingSum += node.children.length;
    }

    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree);

  return {
    totalNodes: stats.totalNodes,
    maxDepth: stats.maxDepth,
    leafCount: stats.leafCount,
    averageBranching:
      stats.nonLeafCount > 0 ? stats.branchingSum / stats.nonLeafCount : 0,
    uniqueCreators: stats.creators.size,
  };
}

// ---------------------------------------------------------------------------
// Tree Visualization Data
// ---------------------------------------------------------------------------

/**
 * A flattened representation of a tree node for UI rendering.
 */
export interface FlatTreeNode {
  id: string;
  name: string;
  type: string;
  creator: string;
  depth: number;
  parentId: string | null;
  childCount: number;
  royaltyPercentage: number;
  cumulativeRoyalty: number;
}

/**
 * Flatten a derivative tree into an array suitable for rendering
 * in a tree visualization component (e.g., D3, React Flow).
 */
export function flattenTree(rootAssetId: string): FlatTreeNode[] {
  const tree = buildDerivativeTree(rootAssetId);
  if (!tree) return [];

  const nodes: FlatTreeNode[] = [];

  function flatten(node: DerivativeTreeNode): void {
    nodes.push({
      id: node.asset.id,
      name: node.asset.name,
      type: node.asset.type,
      creator: node.asset.creator,
      depth: node.depth,
      parentId: node.asset.parentId ?? null,
      childCount: node.children.length,
      royaltyPercentage: node.asset.licenseTerms.royaltyPercentage,
      cumulativeRoyalty: node.cumulativeRoyalty,
    });

    for (const child of node.children) {
      flatten(child);
    }
  }

  flatten(tree);
  return nodes;
}
