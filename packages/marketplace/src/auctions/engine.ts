/**
 * @arcanea/marketplace — Auction Engine
 *
 * Implements English and Dutch auction mechanics with anti-sniping
 * protection, reserve pricing, and configurable bid increments.
 *
 * English Auction: Ascending bids, highest bidder wins at expiry.
 * Dutch Auction: Price decreases linearly from start to floor over duration.
 */

import type {
  AuctionConfig,
  Bid,
  Currency,
  Listing,
  MarketplaceEvent,
  AuctionEndedData,
  BidPlacedData,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default anti-sniping extension: 15 minutes. */
const DEFAULT_EXTENSION_SECONDS = 15 * 60;

/** Minimum auction duration: 1 hour. */
const MIN_AUCTION_DURATION = 3600;

/** Maximum auction duration: 30 days. */
const MAX_AUCTION_DURATION = 30 * 24 * 3600;

/** Minimum bid increment: 1% (100 basis points). */
const MIN_BID_INCREMENT_BPS = 100;

/** Maximum bid increment: 50% (5000 basis points). */
const MAX_BID_INCREMENT_BPS = 5000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AuctionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AuctionError';
  }
}

// ---------------------------------------------------------------------------
// Auction state
// ---------------------------------------------------------------------------

export type AuctionPhase = 'pending' | 'active' | 'ending' | 'settled' | 'cancelled';

export interface AuctionState {
  listingId: string;
  config: AuctionConfig;
  phase: AuctionPhase;
  startTime: Date;
  endTime: Date;
  /** Effective end time after anti-sniping extensions. */
  effectiveEndTime: Date;
  bids: Bid[];
  highestBid?: Bid;
  extensionCount: number;
  settled: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AuctionEngine {
  private auctions = new Map<string, AuctionState>();
  private eventHandlers: Array<(event: MarketplaceEvent) => void> = [];

  // -------------------------------------------------------------------------
  // Event subscription
  // -------------------------------------------------------------------------

  /** Register a handler for marketplace events emitted by the engine. */
  onEvent(handler: (event: MarketplaceEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  private emit<T>(event: MarketplaceEvent<T>): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event as MarketplaceEvent);
      } catch {
        // Event handler errors must not break auction logic
      }
    }
  }

  // -------------------------------------------------------------------------
  // Auction lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a new auction from a listing. The listing must be of type
   * `english_auction` or `dutch_auction`.
   */
  createAuction(listing: Listing, config: AuctionConfig): AuctionState {
    this.validateConfig(config);

    if (this.auctions.has(listing.id)) {
      throw new AuctionError(
        `Auction already exists for listing ${listing.id}`,
        'AUCTION_EXISTS',
      );
    }

    const now = new Date();
    const startTime = listing.startTime > now ? listing.startTime : now;
    const endTime = new Date(startTime.getTime() + config.duration * 1000);

    const state: AuctionState = {
      listingId: listing.id,
      config,
      phase: startTime > now ? 'pending' : 'active',
      startTime,
      endTime,
      effectiveEndTime: endTime,
      bids: [],
      extensionCount: 0,
      settled: false,
    };

    this.auctions.set(listing.id, state);

    this.emit({
      type: 'auction_started',
      listingId: listing.id,
      timestamp: now,
      data: { config, startTime, endTime },
    });

    return state;
  }

  /**
   * Place a bid on an English auction.
   * Validates timing, minimum increment, and currency.
   */
  placeBid(
    listingId: string,
    bidder: string,
    amount: bigint,
    currency: Currency,
  ): Bid {
    const state = this.getAuctionState(listingId);
    const now = new Date();

    // --- Phase checks ---
    if (state.config.type !== 'english') {
      throw new AuctionError(
        'Bids can only be placed on English auctions',
        'INVALID_AUCTION_TYPE',
      );
    }

    this.activateIfReady(state, now);

    if (state.phase === 'pending') {
      throw new AuctionError('Auction has not started yet', 'AUCTION_NOT_STARTED');
    }
    if (state.phase === 'settled' || state.phase === 'cancelled') {
      throw new AuctionError('Auction is no longer active', 'AUCTION_CLOSED');
    }
    if (now > state.effectiveEndTime) {
      throw new AuctionError('Auction has ended', 'AUCTION_ENDED');
    }

    // --- Currency check ---
    if (currency !== state.config.currency) {
      throw new AuctionError(
        `Currency mismatch: expected ${state.config.currency}, got ${currency}`,
        'CURRENCY_MISMATCH',
      );
    }

    // --- Minimum bid check ---
    const minimumBid = this.calculateMinimumBid(state);
    if (amount < minimumBid) {
      throw new AuctionError(
        `Bid ${amount} is below minimum ${minimumBid}`,
        'BID_TOO_LOW',
      );
    }

    // --- Self-bid check ---
    if (state.highestBid && state.highestBid.bidder === bidder) {
      throw new AuctionError(
        'Cannot outbid yourself',
        'SELF_BID',
      );
    }

    // --- Mark previous high bid as outbid ---
    const previousHighBid = state.highestBid
      ? state.highestBid.amount
      : undefined;

    if (state.highestBid) {
      state.highestBid.status = 'outbid';
    }

    // --- Create new bid ---
    const bid: Bid = {
      id: generateBidId(listingId, state.bids.length),
      listingId,
      bidder,
      amount,
      currency,
      timestamp: now,
      status: 'active',
    };

    state.bids.push(bid);
    state.highestBid = bid;

    // --- Anti-sniping extension ---
    const extensionPeriod = state.config.extensionPeriod || DEFAULT_EXTENSION_SECONDS;
    const extensionThreshold = new Date(
      state.effectiveEndTime.getTime() - extensionPeriod * 1000,
    );

    if (now >= extensionThreshold) {
      state.effectiveEndTime = new Date(now.getTime() + extensionPeriod * 1000);
      state.extensionCount++;
      state.phase = 'ending';
    }

    // --- Emit event ---
    this.emit<BidPlacedData>({
      type: 'bid_placed',
      listingId,
      timestamp: now,
      data: {
        bidder,
        amount,
        currency,
        previousHighBid,
      },
    });

    return bid;
  }

  /**
   * Get the current price for a Dutch auction.
   * Price decreases linearly from startPrice to reservePrice over duration.
   */
  getDutchAuctionPrice(listingId: string, atTime?: Date): bigint {
    const state = this.getAuctionState(listingId);

    if (state.config.type !== 'dutch') {
      throw new AuctionError(
        'getDutchAuctionPrice only works on Dutch auctions',
        'INVALID_AUCTION_TYPE',
      );
    }

    const now = atTime ?? new Date();
    this.activateIfReady(state, now);

    if (now <= state.startTime) {
      return state.config.startPrice;
    }

    if (now >= state.endTime) {
      return state.config.reservePrice ?? 0n;
    }

    const elapsed = now.getTime() - state.startTime.getTime();
    const totalDuration = state.endTime.getTime() - state.startTime.getTime();
    const floorPrice = state.config.reservePrice ?? 0n;
    const priceRange = state.config.startPrice - floorPrice;

    // Linear decrease: current = start - (elapsed / total) * range
    // Use BigInt arithmetic to avoid floating-point precision loss
    const elapsedBig = BigInt(Math.floor(elapsed));
    const totalBig = BigInt(Math.floor(totalDuration));

    const decrease = (priceRange * elapsedBig) / totalBig;
    const currentPrice = state.config.startPrice - decrease;

    return currentPrice > floorPrice ? currentPrice : floorPrice;
  }

  /**
   * Accept the current Dutch auction price. Immediately settles the auction.
   */
  acceptDutchAuctionPrice(
    listingId: string,
    buyer: string,
    currency: Currency,
  ): Bid {
    const state = this.getAuctionState(listingId);
    const now = new Date();

    if (state.config.type !== 'dutch') {
      throw new AuctionError(
        'acceptDutchAuctionPrice only works on Dutch auctions',
        'INVALID_AUCTION_TYPE',
      );
    }

    if (state.phase === 'settled' || state.phase === 'cancelled') {
      throw new AuctionError('Auction is no longer active', 'AUCTION_CLOSED');
    }

    if (currency !== state.config.currency) {
      throw new AuctionError(
        `Currency mismatch: expected ${state.config.currency}, got ${currency}`,
        'CURRENCY_MISMATCH',
      );
    }

    const price = this.getDutchAuctionPrice(listingId, now);

    const bid: Bid = {
      id: generateBidId(listingId, 0),
      listingId,
      bidder: buyer,
      amount: price,
      currency,
      timestamp: now,
      status: 'won',
    };

    state.bids.push(bid);
    state.highestBid = bid;
    state.phase = 'settled';
    state.settled = true;

    this.emit<AuctionEndedData>({
      type: 'auction_ended',
      listingId,
      timestamp: now,
      data: {
        winner: buyer,
        winningBid: price,
        reserveMet: true,
        totalBids: 1,
      },
    });

    return bid;
  }

  /**
   * Settle an English auction after its end time.
   * Determines winner and emits settlement event.
   */
  settleAuction(listingId: string): AuctionEndedData {
    const state = this.getAuctionState(listingId);
    const now = new Date();

    if (state.config.type !== 'english') {
      throw new AuctionError(
        'settleAuction is for English auctions. Dutch auctions settle on acceptance.',
        'INVALID_AUCTION_TYPE',
      );
    }

    if (state.settled) {
      throw new AuctionError('Auction already settled', 'ALREADY_SETTLED');
    }

    if (now < state.effectiveEndTime) {
      throw new AuctionError(
        'Auction has not ended yet',
        'AUCTION_STILL_ACTIVE',
      );
    }

    const reserveMet = state.highestBid
      ? state.config.reservePrice
        ? state.highestBid.amount >= state.config.reservePrice
        : true
      : false;

    // Mark winning bid
    if (state.highestBid && reserveMet) {
      state.highestBid.status = 'won';
    }

    state.phase = 'settled';
    state.settled = true;

    const result: AuctionEndedData = {
      winner: reserveMet ? state.highestBid?.bidder : undefined,
      winningBid: reserveMet ? state.highestBid?.amount : undefined,
      reserveMet,
      totalBids: state.bids.length,
    };

    this.emit<AuctionEndedData>({
      type: 'auction_ended',
      listingId,
      timestamp: now,
      data: result,
    });

    return result;
  }

  /**
   * Cancel an auction. Only possible if no bids have been placed
   * (English) or not yet accepted (Dutch).
   */
  cancelAuction(listingId: string): void {
    const state = this.getAuctionState(listingId);

    if (state.settled) {
      throw new AuctionError('Cannot cancel a settled auction', 'ALREADY_SETTLED');
    }

    if (state.config.type === 'english' && state.bids.length > 0) {
      throw new AuctionError(
        'Cannot cancel an English auction with active bids',
        'HAS_BIDS',
      );
    }

    state.phase = 'cancelled';

    // Mark all bids as cancelled (Dutch auction edge case)
    for (const bid of state.bids) {
      bid.status = 'cancelled';
    }

    this.emit({
      type: 'listing_cancelled',
      listingId,
      timestamp: new Date(),
      data: { reason: 'auction_cancelled' },
    });
  }

  // -------------------------------------------------------------------------
  // Query methods
  // -------------------------------------------------------------------------

  /** Get the full auction state for a listing. */
  getAuction(listingId: string): AuctionState | undefined {
    return this.auctions.get(listingId);
  }

  /** Get the auction state, throwing if it doesn't exist. */
  getAuctionState(listingId: string): AuctionState {
    const state = this.auctions.get(listingId);
    if (!state) {
      throw new AuctionError(
        `No auction found for listing ${listingId}`,
        'AUCTION_NOT_FOUND',
      );
    }
    return state;
  }

  /** Calculate the minimum acceptable bid for an English auction. */
  calculateMinimumBid(state: AuctionState): bigint {
    if (!state.highestBid) {
      return state.config.startPrice;
    }

    const incrementBps = BigInt(state.config.minBidIncrementBps);
    const increment = (state.highestBid.amount * incrementBps) / 10000n;

    // Ensure at least 1 unit increment
    const effectiveIncrement = increment > 0n ? increment : 1n;

    return state.highestBid.amount + effectiveIncrement;
  }

  /** Check whether a given auction has ended (based on effective end time). */
  isAuctionEnded(listingId: string, atTime?: Date): boolean {
    const state = this.getAuctionState(listingId);
    const now = atTime ?? new Date();

    if (state.phase === 'settled' || state.phase === 'cancelled') {
      return true;
    }

    return now >= state.effectiveEndTime;
  }

  /** Get all active auctions. */
  getActiveAuctions(): AuctionState[] {
    return Array.from(this.auctions.values()).filter(
      (a) => a.phase === 'active' || a.phase === 'ending',
    );
  }

  /** Get all auctions that need settlement (ended but not settled). */
  getSettleableAuctions(): AuctionState[] {
    const now = new Date();
    return Array.from(this.auctions.values()).filter(
      (a) =>
        !a.settled &&
        a.phase !== 'cancelled' &&
        a.config.type === 'english' &&
        now >= a.effectiveEndTime,
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Transition pending auctions to active if their start time has passed. */
  private activateIfReady(state: AuctionState, now: Date): void {
    if (state.phase === 'pending' && now >= state.startTime) {
      state.phase = 'active';
    }
  }

  /** Validate auction configuration at creation time. */
  private validateConfig(config: AuctionConfig): void {
    if (config.startPrice <= 0n) {
      throw new AuctionError('Start price must be positive', 'INVALID_PRICE');
    }

    if (config.reservePrice !== undefined && config.reservePrice < 0n) {
      throw new AuctionError('Reserve price cannot be negative', 'INVALID_PRICE');
    }

    if (config.type === 'dutch') {
      if (config.reservePrice !== undefined && config.reservePrice >= config.startPrice) {
        throw new AuctionError(
          'Dutch auction reserve (floor) price must be below start price',
          'INVALID_DUTCH_PRICE',
        );
      }
    }

    if (config.type === 'english') {
      if (config.reservePrice !== undefined && config.reservePrice > config.startPrice) {
        throw new AuctionError(
          'English auction reserve price should not exceed start price (bids start at startPrice)',
          'INVALID_RESERVE',
        );
      }
    }

    if (config.duration < MIN_AUCTION_DURATION) {
      throw new AuctionError(
        `Auction duration must be at least ${MIN_AUCTION_DURATION}s (1 hour)`,
        'DURATION_TOO_SHORT',
      );
    }

    if (config.duration > MAX_AUCTION_DURATION) {
      throw new AuctionError(
        `Auction duration cannot exceed ${MAX_AUCTION_DURATION}s (30 days)`,
        'DURATION_TOO_LONG',
      );
    }

    if (
      config.minBidIncrementBps < MIN_BID_INCREMENT_BPS ||
      config.minBidIncrementBps > MAX_BID_INCREMENT_BPS
    ) {
      throw new AuctionError(
        `Bid increment must be between ${MIN_BID_INCREMENT_BPS}-${MAX_BID_INCREMENT_BPS} bps`,
        'INVALID_INCREMENT',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateBidId(listingId: string, index: number): string {
  return `bid_${listingId}_${index}_${Date.now()}`;
}
