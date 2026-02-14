/**
 * @arcanea/marketplace
 *
 * Thirdweb-powered marketplace and auction engine for Arcanea.
 *
 * Features:
 * - Direct listings with fixed pricing
 * - English auctions for rare Guardian editions and 1/1 art
 * - Dutch auctions for time-sensitive drops
 * - Guardian curation — each Guardian curates with a unique personality
 * - Royalty enforcement via Metaplex Core plugins + ERC-721C
 * - Cross-chain support (Solana + Base)
 * - Event indexer for real-time marketplace activity
 */

// --- Types ---
export type {
  AuctionConfig,
  AuctionEndedData,
  Bid,
  BidPlacedData,
  Chain,
  CreateListingParams,
  Currency,
  FeeBreakdown,
  GuardianCurationRule,
  GuardianCuratorId,
  Listing,
  ListingStatus,
  ListingType,
  MarketplaceEvent,
  MarketplaceEventType,
  MarketplaceStats,
  SaleCompletedData,
  UpdateListingParams,
} from './types';

// --- Auction Engine ---
export { AuctionEngine, AuctionError } from './auctions/engine';
export type { AuctionPhase, AuctionState } from './auctions/engine';

// --- Guardian Curator ---
export {
  GuardianCurator,
  createGuardianCurator,
  getAllCurationRules,
} from './auctions/guardian-curator';
export type {
  CurationAnnouncement,
  CurationEvaluation,
} from './auctions/guardian-curator';

// --- Listing Manager ---
export { ListingManager, ListingError } from './listings/manager';

// --- Event Indexer ---
export { EventIndexer, createEventFilter } from './indexer/events';
export type {
  AuctionStartedData,
  BidOutbidData,
  EventPayloadMap,
  ListingCancelledData,
  ListingCreatedData,
  ListingUpdatedData,
  PriceUpdatedData,
} from './indexer/events';
