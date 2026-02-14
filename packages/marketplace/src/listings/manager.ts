/**
 * @arcanea/marketplace — Listing Manager
 *
 * Manages the lifecycle of marketplace listings: creation, updates,
 * cancellation, fee calculation, and status transitions.
 *
 * Fee structure:
 * - Platform fee: 2.5% (250 bps)
 * - Creator royalty: variable (set per NFT collection)
 * - Seller receives: sale price - platform fee - creator royalty
 */

import type {
  CreateListingParams,
  FeeBreakdown,
  Listing,
  ListingStatus,
  MarketplaceEvent,
  SaleCompletedData,
  UpdateListingParams,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Platform fee: 2.5% = 250 basis points. */
const PLATFORM_FEE_BPS = 250;

/** Maximum creator royalty: 10% = 1000 basis points. */
const MAX_CREATOR_ROYALTY_BPS = 1000;

/** Minimum listing price: 0.001 SOL / 0.0001 ETH equivalent. */
const MIN_LISTING_PRICE = 1_000n; // In smallest unit (lamports / wei)

/** Maximum listing duration: 90 days in milliseconds. */
const MAX_LISTING_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ListingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ListingError';
  }
}

// ---------------------------------------------------------------------------
// Listing Manager
// ---------------------------------------------------------------------------

export class ListingManager {
  private listings = new Map<string, Listing>();
  private eventHandlers: Array<(event: MarketplaceEvent) => void> = [];
  private idCounter = 0;

  // -------------------------------------------------------------------------
  // Event subscription
  // -------------------------------------------------------------------------

  /** Register a handler for marketplace events. */
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
        // Event handler errors must not disrupt listing operations
      }
    }
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /** Create a new marketplace listing. */
  createListing(params: CreateListingParams): Listing {
    this.validateCreateParams(params);

    const now = new Date();
    const id = this.generateId();

    const listing: Listing = {
      id,
      nftAddress: params.nftAddress,
      tokenId: params.tokenId,
      seller: params.seller,
      chain: params.chain,
      type: params.type,
      status: 'active',
      price: params.price,
      currency: params.currency,
      startTime: params.startTime ?? now,
      endTime: params.endTime,
      reservePrice: params.auctionConfig?.reservePrice,
      minBidIncrement: params.auctionConfig
        ? params.auctionConfig.minBidIncrementBps / 100
        : undefined,
      bids: [],
      guardianCurator: params.guardianCurator,
      metadata: params.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    this.listings.set(id, listing);

    this.emit({
      type: 'listing_created',
      listingId: id,
      timestamp: now,
      data: {
        seller: params.seller,
        nftAddress: params.nftAddress,
        tokenId: params.tokenId,
        type: params.type,
        price: params.price,
        currency: params.currency,
        chain: params.chain,
      },
    });

    return listing;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /**
   * Update a listing's mutable fields.
   * Only the seller can update, and only while the listing is active.
   */
  updateListing(
    listingId: string,
    seller: string,
    updates: UpdateListingParams,
  ): Listing {
    const listing = this.getListingOrThrow(listingId);

    // --- Authorization ---
    if (listing.seller !== seller) {
      throw new ListingError(
        'Only the seller can update this listing',
        'UNAUTHORIZED',
      );
    }

    // --- Status check ---
    if (listing.status !== 'active') {
      throw new ListingError(
        `Cannot update a listing with status '${listing.status}'`,
        'INVALID_STATUS',
      );
    }

    // --- Auction restriction: no price changes with active bids ---
    if (
      updates.price !== undefined &&
      listing.type !== 'fixed' &&
      listing.bids.length > 0
    ) {
      throw new ListingError(
        'Cannot change price on an auction with active bids',
        'AUCTION_HAS_BIDS',
      );
    }

    // --- Price validation ---
    if (updates.price !== undefined) {
      if (updates.price < MIN_LISTING_PRICE) {
        throw new ListingError(
          `Price must be at least ${MIN_LISTING_PRICE}`,
          'PRICE_TOO_LOW',
        );
      }
    }

    // --- End time validation ---
    if (updates.endTime !== undefined) {
      const maxEnd = new Date(listing.createdAt.getTime() + MAX_LISTING_DURATION_MS);
      if (updates.endTime > maxEnd) {
        throw new ListingError(
          'End time exceeds maximum listing duration (90 days)',
          'DURATION_TOO_LONG',
        );
      }
      if (updates.endTime <= new Date()) {
        throw new ListingError(
          'End time must be in the future',
          'INVALID_END_TIME',
        );
      }
    }

    // --- Apply updates ---
    const now = new Date();
    if (updates.price !== undefined) listing.price = updates.price;
    if (updates.endTime !== undefined) listing.endTime = updates.endTime;
    if (updates.metadata !== undefined) {
      listing.metadata = { ...listing.metadata, ...updates.metadata };
    }
    listing.updatedAt = now;

    this.emit({
      type: updates.price !== undefined ? 'price_updated' : 'listing_updated',
      listingId,
      timestamp: now,
      data: { updates, seller },
    });

    return listing;
  }

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  /**
   * Cancel a listing. Only the seller can cancel.
   * Auction listings with bids cannot be cancelled (handled by auction engine).
   */
  cancelListing(listingId: string, seller: string): Listing {
    const listing = this.getListingOrThrow(listingId);

    if (listing.seller !== seller) {
      throw new ListingError(
        'Only the seller can cancel this listing',
        'UNAUTHORIZED',
      );
    }

    if (listing.status !== 'active') {
      throw new ListingError(
        `Cannot cancel a listing with status '${listing.status}'`,
        'INVALID_STATUS',
      );
    }

    if (listing.type !== 'fixed' && listing.bids.length > 0) {
      throw new ListingError(
        'Cannot cancel an auction listing with active bids. Use the auction engine to settle.',
        'AUCTION_HAS_BIDS',
      );
    }

    listing.status = 'cancelled';
    listing.updatedAt = new Date();

    this.emit({
      type: 'listing_cancelled',
      listingId,
      timestamp: listing.updatedAt,
      data: { seller, reason: 'seller_cancelled' },
    });

    return listing;
  }

  // -------------------------------------------------------------------------
  // Complete sale
  // -------------------------------------------------------------------------

  /**
   * Mark a listing as sold and calculate the fee breakdown.
   * Called by the auction engine or direct purchase flow.
   */
  completeSale(
    listingId: string,
    buyer: string,
    salePrice: bigint,
    creatorRoyaltyBps: number,
    txHash: string,
  ): { listing: Listing; fees: FeeBreakdown } {
    const listing = this.getListingOrThrow(listingId);

    if (listing.status !== 'active') {
      throw new ListingError(
        `Cannot complete sale on listing with status '${listing.status}'`,
        'INVALID_STATUS',
      );
    }

    if (creatorRoyaltyBps < 0 || creatorRoyaltyBps > MAX_CREATOR_ROYALTY_BPS) {
      throw new ListingError(
        `Creator royalty must be 0-${MAX_CREATOR_ROYALTY_BPS} bps`,
        'INVALID_ROYALTY',
      );
    }

    const fees = this.calculateFees(salePrice, creatorRoyaltyBps);

    listing.status = 'sold';
    listing.updatedAt = new Date();

    const saleData: SaleCompletedData = {
      buyer,
      seller: listing.seller,
      price: salePrice,
      currency: listing.currency,
      fees,
      txHash,
    };

    this.emit<SaleCompletedData>({
      type: 'sale_completed',
      listingId,
      timestamp: listing.updatedAt,
      data: saleData,
    });

    return { listing, fees };
  }

  // -------------------------------------------------------------------------
  // Fee calculation
  // -------------------------------------------------------------------------

  /**
   * Calculate the fee breakdown for a given sale price.
   * Platform: 2.5% | Creator: variable | Seller: remainder
   */
  calculateFees(salePrice: bigint, creatorRoyaltyBps: number): FeeBreakdown {
    if (salePrice <= 0n) {
      throw new ListingError('Sale price must be positive', 'INVALID_PRICE');
    }

    const platformFee = (salePrice * BigInt(PLATFORM_FEE_BPS)) / 10000n;
    const creatorRoyalty = (salePrice * BigInt(creatorRoyaltyBps)) / 10000n;
    const sellerProceeds = salePrice - platformFee - creatorRoyalty;

    return {
      platformFeeBps: PLATFORM_FEE_BPS,
      creatorRoyaltyBps,
      sellerProceeds,
      platformFee,
      creatorRoyalty,
    };
  }

  // -------------------------------------------------------------------------
  // Query methods
  // -------------------------------------------------------------------------

  /** Get a listing by ID. */
  getListing(listingId: string): Listing | undefined {
    return this.listings.get(listingId);
  }

  /** Get a listing by ID, throwing if it doesn't exist. */
  getListingOrThrow(listingId: string): Listing {
    const listing = this.listings.get(listingId);
    if (!listing) {
      throw new ListingError(
        `Listing '${listingId}' not found`,
        'LISTING_NOT_FOUND',
      );
    }
    return listing;
  }

  /** Get all listings matching an optional status filter. */
  getListings(filter?: { status?: ListingStatus; seller?: string }): Listing[] {
    let results = Array.from(this.listings.values());

    if (filter?.status) {
      results = results.filter((l) => l.status === filter.status);
    }
    if (filter?.seller) {
      results = results.filter((l) => l.seller === filter.seller);
    }

    return results;
  }

  /** Get all active listings. */
  getActiveListings(): Listing[] {
    return this.getListings({ status: 'active' });
  }

  /** Get listings by NFT address (all tokens in a collection). */
  getListingsByCollection(nftAddress: string): Listing[] {
    return Array.from(this.listings.values()).filter(
      (l) => l.nftAddress === nftAddress,
    );
  }

  /** Expire listings whose endTime has passed. Returns the number of expired listings. */
  expireStaleListings(): number {
    const now = new Date();
    let expired = 0;

    for (const listing of this.listings.values()) {
      if (
        listing.status === 'active' &&
        listing.type === 'fixed' &&
        listing.endTime &&
        listing.endTime <= now
      ) {
        listing.status = 'expired';
        listing.updatedAt = now;
        expired++;
      }
    }

    return expired;
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  /** Calculate marketplace statistics from all listings. */
  getStats(): {
    totalListings: number;
    activeListings: number;
    totalSold: number;
    totalCancelled: number;
    totalExpired: number;
  } {
    const all = Array.from(this.listings.values());
    return {
      totalListings: all.length,
      activeListings: all.filter((l) => l.status === 'active').length,
      totalSold: all.filter((l) => l.status === 'sold').length,
      totalCancelled: all.filter((l) => l.status === 'cancelled').length,
      totalExpired: all.filter((l) => l.status === 'expired').length,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private generateId(): string {
    this.idCounter++;
    return `listing_${Date.now()}_${this.idCounter}`;
  }

  private validateCreateParams(params: CreateListingParams): void {
    if (!params.nftAddress?.trim()) {
      throw new ListingError('NFT address is required', 'MISSING_NFT_ADDRESS');
    }

    if (!params.tokenId?.trim()) {
      throw new ListingError('Token ID is required', 'MISSING_TOKEN_ID');
    }

    if (!params.seller?.trim()) {
      throw new ListingError('Seller address is required', 'MISSING_SELLER');
    }

    if (params.price < MIN_LISTING_PRICE) {
      throw new ListingError(
        `Price must be at least ${MIN_LISTING_PRICE}`,
        'PRICE_TOO_LOW',
      );
    }

    // --- Auction-specific validation ---
    if (params.type !== 'fixed' && !params.auctionConfig) {
      throw new ListingError(
        'Auction listings require an auctionConfig',
        'MISSING_AUCTION_CONFIG',
      );
    }

    if (params.type === 'fixed' && params.auctionConfig) {
      throw new ListingError(
        'Fixed-price listings should not have an auctionConfig',
        'UNEXPECTED_AUCTION_CONFIG',
      );
    }

    // --- End time validation ---
    if (params.endTime) {
      const maxEnd = new Date(Date.now() + MAX_LISTING_DURATION_MS);
      if (params.endTime > maxEnd) {
        throw new ListingError(
          'End time exceeds maximum listing duration (90 days)',
          'DURATION_TOO_LONG',
        );
      }
    }

    // --- Dutch auction floor price ---
    if (
      params.type === 'dutch_auction' &&
      params.auctionConfig?.reservePrice !== undefined &&
      params.auctionConfig.reservePrice >= params.price
    ) {
      throw new ListingError(
        'Dutch auction floor price must be below the start price',
        'INVALID_DUTCH_FLOOR',
      );
    }
  }
}
