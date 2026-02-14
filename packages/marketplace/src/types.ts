/**
 * @arcanea/marketplace — Core Types
 *
 * All type definitions for the Arcanea marketplace, auction engine,
 * and listing management system.
 */

// ---------------------------------------------------------------------------
// Primitive union types
// ---------------------------------------------------------------------------

export type ListingType = 'fixed' | 'english_auction' | 'dutch_auction';
export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';
export type Currency = 'SOL' | 'ETH' | 'USDC';
export type Chain = 'solana' | 'base';

// ---------------------------------------------------------------------------
// Core marketplace entities
// ---------------------------------------------------------------------------

export interface Listing {
  id: string;
  nftAddress: string;
  tokenId: string;
  seller: string;
  chain: Chain;
  type: ListingType;
  status: ListingStatus;
  price: bigint;
  currency: Currency;
  startTime: Date;
  endTime?: Date;
  reservePrice?: bigint;
  /** Minimum bid increment as a percentage (e.g. 5 = 5%). */
  minBidIncrement?: number;
  highestBid?: Bid;
  bids: Bid[];
  /** Guardian who curates/features this listing. */
  guardianCurator?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Bid {
  id: string;
  listingId: string;
  bidder: string;
  amount: bigint;
  currency: Currency;
  timestamp: Date;
  status: 'active' | 'won' | 'outbid' | 'cancelled';
}

// ---------------------------------------------------------------------------
// Auction configuration
// ---------------------------------------------------------------------------

export interface AuctionConfig {
  type: 'english' | 'dutch';
  startPrice: bigint;
  reservePrice?: bigint;
  /** Auction duration in seconds. */
  duration: number;
  /** Seconds to extend when a bid is placed near the end. */
  extensionPeriod: number;
  /** Minimum bid increment in basis points (500 = 5%). */
  minBidIncrementBps: number;
  currency: Currency;
}

// ---------------------------------------------------------------------------
// Listing creation / update
// ---------------------------------------------------------------------------

export interface CreateListingParams {
  nftAddress: string;
  tokenId: string;
  seller: string;
  chain: Chain;
  type: ListingType;
  price: bigint;
  currency: Currency;
  startTime?: Date;
  endTime?: Date;
  auctionConfig?: AuctionConfig;
  guardianCurator?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateListingParams {
  price?: bigint;
  endTime?: Date;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fee structure
// ---------------------------------------------------------------------------

export interface FeeBreakdown {
  /** Platform fee in basis points (250 = 2.5%). */
  platformFeeBps: number;
  /** Creator royalty in basis points. */
  creatorRoyaltyBps: number;
  /** Net amount to seller after all fees. */
  sellerProceeds: bigint;
  /** Amount owed to platform. */
  platformFee: bigint;
  /** Amount owed to original creator. */
  creatorRoyalty: bigint;
}

// ---------------------------------------------------------------------------
// Guardian curation
// ---------------------------------------------------------------------------

export type GuardianCuratorId =
  | 'draconia'
  | 'aiyami'
  | 'lyria'
  | 'lyssandria'
  | 'leyla'
  | 'maylinn'
  | 'alera'
  | 'elara'
  | 'ino'
  | 'shinkami';

export interface GuardianCurationRule {
  guardian: GuardianCuratorId;
  /** Minimum tier the Guardian will curate. */
  minTier: 'legendary' | 'epic' | 'rare' | 'common' | 'fragment';
  /** Preferred auction type for this Guardian. */
  preferredAuctionType: 'english' | 'dutch' | 'fixed';
  /** Minimum reserve price in lamports/wei for curated auctions. */
  minReservePrice?: bigint;
  /** Whether this Guardian requires manual approval for curation. */
  requiresApproval: boolean;
  /** Elements this Guardian prefers to curate. */
  preferredElements: string[];
  /** Flavor text for curated listings. */
  curationMessage: string;
}

// ---------------------------------------------------------------------------
// Marketplace events
// ---------------------------------------------------------------------------

export type MarketplaceEventType =
  | 'listing_created'
  | 'listing_cancelled'
  | 'listing_updated'
  | 'sale_completed'
  | 'auction_started'
  | 'auction_ended'
  | 'bid_placed'
  | 'bid_outbid'
  | 'price_updated';

export interface MarketplaceEvent<T = unknown> {
  type: MarketplaceEventType;
  listingId: string;
  timestamp: Date;
  data: T;
}

export interface SaleCompletedData {
  buyer: string;
  seller: string;
  price: bigint;
  currency: Currency;
  fees: FeeBreakdown;
  txHash: string;
}

export interface BidPlacedData {
  bidder: string;
  amount: bigint;
  currency: Currency;
  previousHighBid?: bigint;
}

export interface AuctionEndedData {
  winner?: string;
  winningBid?: bigint;
  reserveMet: boolean;
  totalBids: number;
}

// ---------------------------------------------------------------------------
// Marketplace statistics
// ---------------------------------------------------------------------------

export interface MarketplaceStats {
  totalVolume: bigint;
  totalSales: number;
  activeListings: number;
  activeAuctions: number;
  uniqueSellers: number;
  uniqueBuyers: number;
  averagePrice: bigint;
}
