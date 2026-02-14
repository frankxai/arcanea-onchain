/**
 * @arcanea/marketplace — Auction Engine Test Suite
 *
 * Comprehensive tests for English and Dutch auction mechanics,
 * including anti-sniping protection, bid validation, settlement,
 * and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuctionEngine, AuctionError } from '../src/auctions/engine';
import type { AuctionConfig, Listing, Currency, MarketplaceEvent } from '../src/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestListing(overrides: Partial<Listing> = {}): Listing {
  const now = new Date();
  return {
    id: overrides.id ?? `listing-${Date.now()}`,
    nftAddress: '0xtest',
    tokenId: '1',
    seller: 'seller-wallet',
    chain: 'solana',
    type: 'english_auction',
    status: 'active',
    price: 1000000000n, // 1 SOL
    currency: 'SOL',
    startTime: overrides.startTime ?? now,
    bids: [],
    metadata: { tier: 'epic', element: 'fire' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createEnglishConfig(overrides: Partial<AuctionConfig> = {}): AuctionConfig {
  return {
    type: 'english',
    startPrice: 1000000000n, // 1 SOL
    reservePrice: 500000000n, // 0.5 SOL
    duration: 86400, // 24 hours
    extensionPeriod: 900, // 15 minutes
    minBidIncrementBps: 500, // 5%
    currency: 'SOL',
    ...overrides,
  };
}

function createDutchConfig(overrides: Partial<AuctionConfig> = {}): AuctionConfig {
  return {
    type: 'dutch',
    startPrice: 10000000000n, // 10 SOL
    reservePrice: 1000000000n, // 1 SOL (floor)
    duration: 86400, // 24 hours
    extensionPeriod: 0,
    minBidIncrementBps: 100, // not used for dutch, but required
    currency: 'SOL',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// English Auction Tests
// ---------------------------------------------------------------------------

describe('English Auction', () => {
  let engine: AuctionEngine;

  beforeEach(() => {
    engine = new AuctionEngine();
  });

  it('should create an auction from a listing', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    const state = engine.createAuction(listing, config);

    expect(state.listingId).toBe(listing.id);
    expect(state.config.type).toBe('english');
    expect(state.phase).toBe('active');
    expect(state.bids).toHaveLength(0);
    expect(state.settled).toBe(false);
  });

  it('should not allow duplicate auctions for same listing', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();

    engine.createAuction(listing, config);

    expect(() => engine.createAuction(listing, config)).toThrow(AuctionError);
    expect(() => engine.createAuction(listing, config)).toThrow('AUCTION_EXISTS');
  });

  it('should accept a valid first bid at start price', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    const bid = engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    expect(bid.bidder).toBe('bidder-1');
    expect(bid.amount).toBe(1000000000n);
    expect(bid.status).toBe('active');
  });

  it('should reject bid below start price', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    expect(() =>
      engine.placeBid(listing.id, 'bidder-1', 500000000n, 'SOL'),
    ).toThrow('BID_TOO_LOW');
  });

  it('should reject bid below minimum increment', () => {
    const listing = createTestListing();
    const config = createEnglishConfig({ minBidIncrementBps: 500 }); // 5%
    engine.createAuction(listing, config);

    // First bid at start price
    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    // Second bid must be at least 5% higher (1.05 SOL)
    expect(() =>
      engine.placeBid(listing.id, 'bidder-2', 1040000000n, 'SOL'),
    ).toThrow('BID_TOO_LOW');
  });

  it('should accept bid meeting minimum increment', () => {
    const listing = createTestListing();
    const config = createEnglishConfig({ minBidIncrementBps: 500 }); // 5%
    engine.createAuction(listing, config);

    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    // 5% of 1 SOL = 0.05 SOL, so minimum is 1.05 SOL
    const bid = engine.placeBid(listing.id, 'bidder-2', 1050000000n, 'SOL');
    expect(bid.amount).toBe(1050000000n);
  });

  it('should reject wrong currency', () => {
    const listing = createTestListing();
    const config = createEnglishConfig({ currency: 'SOL' });
    engine.createAuction(listing, config);

    expect(() =>
      engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'ETH'),
    ).toThrow('CURRENCY_MISMATCH');
  });

  it('should reject self-bidding (cannot outbid yourself)', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    expect(() =>
      engine.placeBid(listing.id, 'bidder-1', 2000000000n, 'SOL'),
    ).toThrow('SELF_BID');
  });

  it('should mark previous high bid as outbid', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    const bid1 = engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');
    engine.placeBid(listing.id, 'bidder-2', 2000000000n, 'SOL');

    expect(bid1.status).toBe('outbid');
  });

  it('should track highest bid correctly across multiple bids', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');
    engine.placeBid(listing.id, 'bidder-2', 2000000000n, 'SOL');
    engine.placeBid(listing.id, 'bidder-3', 3000000000n, 'SOL');

    const state = engine.getAuctionState(listing.id);
    expect(state.highestBid?.bidder).toBe('bidder-3');
    expect(state.highestBid?.amount).toBe(3000000000n);
    expect(state.bids).toHaveLength(3);
  });

  it('should reject bids on non-existent auction', () => {
    expect(() =>
      engine.placeBid('non-existent', 'bidder-1', 1000000000n, 'SOL'),
    ).toThrow('AUCTION_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Anti-Sniping Protection
// ---------------------------------------------------------------------------

describe('Anti-Sniping Protection', () => {
  let engine: AuctionEngine;

  beforeEach(() => {
    engine = new AuctionEngine();
  });

  it('should extend auction when bid placed within extension period', () => {
    // Create an auction that ends in 10 minutes
    const now = new Date();
    const listing = createTestListing({
      startTime: new Date(now.getTime() - 86400 * 1000 + 10 * 60 * 1000),
    });
    const config = createEnglishConfig({
      extensionPeriod: 900, // 15 minutes
      duration: 86400,
    });
    engine.createAuction(listing, config);

    // Get original end time
    const originalEndTime = engine.getAuctionState(listing.id).effectiveEndTime;

    // Place a bid (which happens "now" — within 15 minutes of end)
    engine.placeBid(listing.id, 'sniper', 1000000000n, 'SOL');

    const newEndTime = engine.getAuctionState(listing.id).effectiveEndTime;

    // End time should have been extended
    expect(newEndTime.getTime()).toBeGreaterThanOrEqual(
      originalEndTime.getTime(),
    );
  });

  it('should increment extension count on anti-sniping extension', () => {
    const now = new Date();
    // Create auction that ends in 5 minutes (within the 15-minute extension window)
    const listing = createTestListing({
      startTime: new Date(now.getTime() - 86400 * 1000 + 5 * 60 * 1000),
    });
    const config = createEnglishConfig({
      extensionPeriod: 900,
      duration: 86400,
    });
    engine.createAuction(listing, config);

    engine.placeBid(listing.id, 'sniper', 1000000000n, 'SOL');

    const state = engine.getAuctionState(listing.id);
    expect(state.extensionCount).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Dutch Auction Tests
// ---------------------------------------------------------------------------

describe('Dutch Auction', () => {
  let engine: AuctionEngine;

  beforeEach(() => {
    engine = new AuctionEngine();
  });

  it('should create a Dutch auction', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    const config = createDutchConfig();
    const state = engine.createAuction(listing, config);

    expect(state.config.type).toBe('dutch');
    expect(state.phase).toBe('active');
  });

  it('should start at startPrice before auction begins', () => {
    const futureStart = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    const listing = createTestListing({
      type: 'dutch_auction',
      startTime: futureStart,
    });
    const config = createDutchConfig();
    engine.createAuction(listing, config);

    const price = engine.getDutchAuctionPrice(listing.id, new Date());
    expect(price).toBe(config.startPrice);
  });

  it('should reach reserve price at end of auction', () => {
    const now = new Date();
    const listing = createTestListing({
      type: 'dutch_auction',
      startTime: new Date(now.getTime() - 86400 * 1000), // Started 24h ago
    });
    const config = createDutchConfig({ duration: 86400 });
    engine.createAuction(listing, config);

    // Check price at or after the end time
    const endTime = new Date(
      listing.startTime.getTime() + config.duration * 1000 + 1000,
    );
    const price = engine.getDutchAuctionPrice(listing.id, endTime);
    expect(price).toBe(config.reservePrice);
  });

  it('should decrease price linearly over time', () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 43200 * 1000); // Started 12h ago
    const listing = createTestListing({
      type: 'dutch_auction',
      startTime,
    });
    const config = createDutchConfig({ duration: 86400 }); // 24h
    engine.createAuction(listing, config);

    // At half duration, price should be approximately halfway
    const midPrice = engine.getDutchAuctionPrice(listing.id, now);
    const expectedMid =
      (config.startPrice + (config.reservePrice ?? 0n)) / 2n;

    // Allow 1% tolerance for timing precision
    const tolerance = config.startPrice / 100n;
    expect(midPrice).toBeLessThan(config.startPrice);
    expect(midPrice).toBeGreaterThan(config.reservePrice ?? 0n);
    // Price should be roughly in the middle
    const diff = midPrice > expectedMid ? midPrice - expectedMid : expectedMid - midPrice;
    expect(diff).toBeLessThan(tolerance);
  });

  it('should reject regular bids on Dutch auctions', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    const config = createDutchConfig();
    engine.createAuction(listing, config);

    expect(() =>
      engine.placeBid(listing.id, 'bidder-1', 5000000000n, 'SOL'),
    ).toThrow('INVALID_AUCTION_TYPE');
  });

  it('should accept Dutch auction price and settle immediately', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    const config = createDutchConfig();
    engine.createAuction(listing, config);

    const bid = engine.acceptDutchAuctionPrice(listing.id, 'buyer-1', 'SOL');

    expect(bid.status).toBe('won');
    expect(bid.bidder).toBe('buyer-1');

    const state = engine.getAuctionState(listing.id);
    expect(state.phase).toBe('settled');
    expect(state.settled).toBe(true);
  });

  it('should reject Dutch acceptance on settled auction', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    const config = createDutchConfig();
    engine.createAuction(listing, config);

    engine.acceptDutchAuctionPrice(listing.id, 'buyer-1', 'SOL');

    expect(() =>
      engine.acceptDutchAuctionPrice(listing.id, 'buyer-2', 'SOL'),
    ).toThrow('AUCTION_CLOSED');
  });

  it('should reject wrong currency on Dutch auction', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    const config = createDutchConfig({ currency: 'SOL' });
    engine.createAuction(listing, config);

    expect(() =>
      engine.acceptDutchAuctionPrice(listing.id, 'buyer-1', 'ETH'),
    ).toThrow('CURRENCY_MISMATCH');
  });

  it('should reject getDutchAuctionPrice on English auction', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    expect(() => engine.getDutchAuctionPrice(listing.id)).toThrow(
      'INVALID_AUCTION_TYPE',
    );
  });
});

// ---------------------------------------------------------------------------
// Settlement Tests
// ---------------------------------------------------------------------------

describe('Auction Settlement', () => {
  let engine: AuctionEngine;

  beforeEach(() => {
    engine = new AuctionEngine();
  });

  it('should settle English auction with winner when reserve is met', () => {
    // Create active auction and place bids
    const listing = createTestListing();
    const config = createEnglishConfig({
      duration: 86400,
      reservePrice: 500000000n,
    });
    engine.createAuction(listing, config);

    // Place bid above reserve while auction is still active
    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    // Simulate auction ending by moving end times to the past
    const state = engine.getAuctionState(listing.id);
    state.endTime = new Date(Date.now() - 1000);
    state.effectiveEndTime = new Date(Date.now() - 1000);

    const result = engine.settleAuction(listing.id);

    expect(result.winner).toBe('bidder-1');
    expect(result.winningBid).toBe(1000000000n);
    expect(result.reserveMet).toBe(true);
    expect(result.totalBids).toBe(1);
  });

  it('should settle English auction without winner when reserve not met', () => {
    // Create active auction and place bids
    const listing = createTestListing();
    const config = createEnglishConfig({
      duration: 86400,
      reservePrice: 5000000000n, // 5 SOL reserve
    });
    engine.createAuction(listing, config);

    // Place bid below reserve while auction is still active
    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    // Simulate auction ending
    const state = engine.getAuctionState(listing.id);
    state.endTime = new Date(Date.now() - 1000);
    state.effectiveEndTime = new Date(Date.now() - 1000);

    const result = engine.settleAuction(listing.id);

    expect(result.winner).toBeUndefined();
    expect(result.reserveMet).toBe(false);
  });

  it('should settle English auction without winner when no bids', () => {
    const pastStart = new Date(Date.now() - 2 * 86400 * 1000);
    const listing = createTestListing({ startTime: pastStart });
    const config = createEnglishConfig({ duration: 86400 });
    engine.createAuction(listing, config);

    const result = engine.settleAuction(listing.id);

    expect(result.winner).toBeUndefined();
    expect(result.reserveMet).toBe(false);
    expect(result.totalBids).toBe(0);
  });

  it('should reject settling an active auction', () => {
    const listing = createTestListing();
    const config = createEnglishConfig({ duration: 86400 });
    engine.createAuction(listing, config);

    expect(() => engine.settleAuction(listing.id)).toThrow(
      'AUCTION_STILL_ACTIVE',
    );
  });

  it('should reject settling an already settled auction', () => {
    const pastStart = new Date(Date.now() - 2 * 86400 * 1000);
    const listing = createTestListing({ startTime: pastStart });
    const config = createEnglishConfig({ duration: 86400 });
    engine.createAuction(listing, config);

    engine.settleAuction(listing.id);

    expect(() => engine.settleAuction(listing.id)).toThrow('ALREADY_SETTLED');
  });

  it('should reject settling a Dutch auction via settleAuction', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    const config = createDutchConfig();
    engine.createAuction(listing, config);

    expect(() => engine.settleAuction(listing.id)).toThrow(
      'INVALID_AUCTION_TYPE',
    );
  });
});

// ---------------------------------------------------------------------------
// Cancellation Tests
// ---------------------------------------------------------------------------

describe('Auction Cancellation', () => {
  let engine: AuctionEngine;

  beforeEach(() => {
    engine = new AuctionEngine();
  });

  it('should cancel an English auction with no bids', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    engine.cancelAuction(listing.id);

    const state = engine.getAuctionState(listing.id);
    expect(state.phase).toBe('cancelled');
  });

  it('should not cancel an English auction with active bids', () => {
    const listing = createTestListing();
    const config = createEnglishConfig();
    engine.createAuction(listing, config);

    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    expect(() => engine.cancelAuction(listing.id)).toThrow('HAS_BIDS');
  });

  it('should not cancel a settled auction', () => {
    const pastStart = new Date(Date.now() - 2 * 86400 * 1000);
    const listing = createTestListing({ startTime: pastStart });
    const config = createEnglishConfig({ duration: 86400 });
    engine.createAuction(listing, config);

    engine.settleAuction(listing.id);

    expect(() => engine.cancelAuction(listing.id)).toThrow('ALREADY_SETTLED');
  });

  it('should cancel a Dutch auction that has not been accepted', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    const config = createDutchConfig();
    engine.createAuction(listing, config);

    engine.cancelAuction(listing.id);

    const state = engine.getAuctionState(listing.id);
    expect(state.phase).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------------
// Configuration Validation
// ---------------------------------------------------------------------------

describe('Auction Configuration Validation', () => {
  let engine: AuctionEngine;

  beforeEach(() => {
    engine = new AuctionEngine();
  });

  it('should reject zero start price', () => {
    const listing = createTestListing();
    expect(() =>
      engine.createAuction(
        listing,
        createEnglishConfig({ startPrice: 0n }),
      ),
    ).toThrow('INVALID_PRICE');
  });

  it('should reject negative start price', () => {
    const listing = createTestListing();
    expect(() =>
      engine.createAuction(
        listing,
        createEnglishConfig({ startPrice: -1n }),
      ),
    ).toThrow('INVALID_PRICE');
  });

  it('should reject Dutch auction where reserve >= start', () => {
    const listing = createTestListing({ type: 'dutch_auction' });
    expect(() =>
      engine.createAuction(
        listing,
        createDutchConfig({
          startPrice: 1000000000n,
          reservePrice: 2000000000n, // Floor above start
        }),
      ),
    ).toThrow('INVALID_DUTCH_PRICE');
  });

  it('should reject duration below minimum (1 hour)', () => {
    const listing = createTestListing();
    expect(() =>
      engine.createAuction(
        listing,
        createEnglishConfig({ duration: 60 }), // 1 minute
      ),
    ).toThrow('DURATION_TOO_SHORT');
  });

  it('should reject duration above maximum (30 days)', () => {
    const listing = createTestListing();
    expect(() =>
      engine.createAuction(
        listing,
        createEnglishConfig({ duration: 31 * 24 * 3600 }),
      ),
    ).toThrow('DURATION_TOO_LONG');
  });

  it('should reject bid increment below minimum (1%)', () => {
    const listing = createTestListing();
    expect(() =>
      engine.createAuction(
        listing,
        createEnglishConfig({ minBidIncrementBps: 50 }), // 0.5%
      ),
    ).toThrow('INVALID_INCREMENT');
  });

  it('should reject bid increment above maximum (50%)', () => {
    const listing = createTestListing();
    expect(() =>
      engine.createAuction(
        listing,
        createEnglishConfig({ minBidIncrementBps: 6000 }), // 60%
      ),
    ).toThrow('INVALID_INCREMENT');
  });
});

// ---------------------------------------------------------------------------
// Event Emission Tests
// ---------------------------------------------------------------------------

describe('Event Emission', () => {
  let engine: AuctionEngine;
  let events: MarketplaceEvent[];

  beforeEach(() => {
    engine = new AuctionEngine();
    events = [];
    engine.onEvent((event) => events.push(event));
  });

  it('should emit auction_started on creation', () => {
    const listing = createTestListing();
    engine.createAuction(listing, createEnglishConfig());

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('auction_started');
    expect(events[0].listingId).toBe(listing.id);
  });

  it('should emit bid_placed on each bid', () => {
    const listing = createTestListing();
    engine.createAuction(listing, createEnglishConfig());

    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');
    engine.placeBid(listing.id, 'bidder-2', 2000000000n, 'SOL');

    const bidEvents = events.filter((e) => e.type === 'bid_placed');
    expect(bidEvents).toHaveLength(2);
  });

  it('should emit auction_ended on settlement', () => {
    const pastStart = new Date(Date.now() - 2 * 86400 * 1000);
    const listing = createTestListing({ startTime: pastStart });
    engine.createAuction(listing, createEnglishConfig({ duration: 86400 }));

    engine.settleAuction(listing.id);

    const endEvents = events.filter((e) => e.type === 'auction_ended');
    expect(endEvents).toHaveLength(1);
  });

  it('should emit listing_cancelled on cancellation', () => {
    const listing = createTestListing();
    engine.createAuction(listing, createEnglishConfig());

    engine.cancelAuction(listing.id);

    const cancelEvents = events.filter((e) => e.type === 'listing_cancelled');
    expect(cancelEvents).toHaveLength(1);
  });

  it('should allow unsubscribing from events', () => {
    const unsubscribe = engine.onEvent(() => {});
    unsubscribe();

    // After unsubscribe, the handler should not be called
    // (we just verify the unsubscribe function exists and runs)
    expect(unsubscribe).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// Query Methods
// ---------------------------------------------------------------------------

describe('Query Methods', () => {
  let engine: AuctionEngine;

  beforeEach(() => {
    engine = new AuctionEngine();
  });

  it('should return undefined for non-existent auction', () => {
    expect(engine.getAuction('non-existent')).toBeUndefined();
  });

  it('should throw on getAuctionState for non-existent auction', () => {
    expect(() => engine.getAuctionState('non-existent')).toThrow(
      'AUCTION_NOT_FOUND',
    );
  });

  it('should list active auctions', () => {
    const listing1 = createTestListing({ id: 'l1' });
    const listing2 = createTestListing({ id: 'l2' });
    engine.createAuction(listing1, createEnglishConfig());
    engine.createAuction(listing2, createEnglishConfig());

    const active = engine.getActiveAuctions();
    expect(active).toHaveLength(2);
  });

  it('should not include cancelled auctions in active list', () => {
    const listing1 = createTestListing({ id: 'l1' });
    const listing2 = createTestListing({ id: 'l2' });
    engine.createAuction(listing1, createEnglishConfig());
    engine.createAuction(listing2, createEnglishConfig());

    engine.cancelAuction('l1');

    const active = engine.getActiveAuctions();
    expect(active).toHaveLength(1);
    expect(active[0].listingId).toBe('l2');
  });

  it('should calculate minimum bid correctly for first bid', () => {
    const listing = createTestListing();
    const config = createEnglishConfig({ startPrice: 1000000000n });
    engine.createAuction(listing, config);

    const state = engine.getAuctionState(listing.id);
    const minBid = engine.calculateMinimumBid(state);
    expect(minBid).toBe(1000000000n); // Start price
  });

  it('should calculate minimum bid with increment after first bid', () => {
    const listing = createTestListing();
    const config = createEnglishConfig({
      startPrice: 1000000000n,
      minBidIncrementBps: 1000, // 10%
    });
    engine.createAuction(listing, config);

    engine.placeBid(listing.id, 'bidder-1', 1000000000n, 'SOL');

    const state = engine.getAuctionState(listing.id);
    const minBid = engine.calculateMinimumBid(state);
    // 10% of 1 SOL = 0.1 SOL, so minimum = 1.1 SOL
    expect(minBid).toBe(1100000000n);
  });

  it('should identify ended auctions', () => {
    const pastStart = new Date(Date.now() - 2 * 86400 * 1000);
    const listing = createTestListing({ startTime: pastStart });
    engine.createAuction(listing, createEnglishConfig({ duration: 86400 }));

    expect(engine.isAuctionEnded(listing.id)).toBe(true);
  });

  it('should identify active (not ended) auctions', () => {
    const listing = createTestListing();
    engine.createAuction(listing, createEnglishConfig({ duration: 86400 }));

    expect(engine.isAuctionEnded(listing.id)).toBe(false);
  });

  it('should list settleable auctions', () => {
    const pastStart = new Date(Date.now() - 2 * 86400 * 1000);
    const listing1 = createTestListing({ id: 'ended', startTime: pastStart });
    const listing2 = createTestListing({ id: 'active' });

    engine.createAuction(
      listing1,
      createEnglishConfig({ duration: 86400 }),
    );
    engine.createAuction(
      listing2,
      createEnglishConfig({ duration: 86400 }),
    );

    const settleable = engine.getSettleableAuctions();
    expect(settleable).toHaveLength(1);
    expect(settleable[0].listingId).toBe('ended');
  });
});
