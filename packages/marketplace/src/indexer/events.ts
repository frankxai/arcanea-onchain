/**
 * @arcanea/marketplace — Event Indexer
 *
 * Typed event listener system for marketplace activity.
 * Consumers subscribe to specific event types and receive
 * strongly-typed payloads.
 *
 * Used by:
 * - Guardian agents (react to sales, curate listings)
 * - Analytics dashboards (volume, trending)
 * - Notification services (bid alerts, sale confirmations)
 * - Royalty distribution pipeline
 */

import type {
  AuctionEndedData,
  BidPlacedData,
  MarketplaceEvent,
  MarketplaceEventType,
  SaleCompletedData,
} from '../types';

// ---------------------------------------------------------------------------
// Event payload type mapping
// ---------------------------------------------------------------------------

/**
 * Maps event types to their strongly-typed data payloads.
 * Use with `EventIndexer.on<T>()` for type-safe event handling.
 */
export interface EventPayloadMap {
  listing_created: ListingCreatedData;
  listing_cancelled: ListingCancelledData;
  listing_updated: ListingUpdatedData;
  sale_completed: SaleCompletedData;
  auction_started: AuctionStartedData;
  auction_ended: AuctionEndedData;
  bid_placed: BidPlacedData;
  bid_outbid: BidOutbidData;
  price_updated: PriceUpdatedData;
}

// ---------------------------------------------------------------------------
// Event-specific payload interfaces
// ---------------------------------------------------------------------------

export interface ListingCreatedData {
  seller: string;
  nftAddress: string;
  tokenId: string;
  type: string;
  price: bigint;
  currency: string;
  chain: string;
}

export interface ListingCancelledData {
  seller?: string;
  reason: string;
}

export interface ListingUpdatedData {
  updates: Record<string, unknown>;
  seller: string;
}

export interface AuctionStartedData {
  config: Record<string, unknown>;
  startTime: Date;
  endTime: Date;
}

export interface BidOutbidData {
  bidder: string;
  outbidBy: string;
  previousAmount: bigint;
  newAmount: bigint;
}

export interface PriceUpdatedData {
  previousPrice: bigint;
  newPrice: bigint;
  seller: string;
}

// ---------------------------------------------------------------------------
// Typed event handler
// ---------------------------------------------------------------------------

type EventHandler<T> = (event: MarketplaceEvent<T>) => void | Promise<void>;

interface HandlerEntry {
  type: MarketplaceEventType;
  handler: EventHandler<unknown>;
  once: boolean;
}

// ---------------------------------------------------------------------------
// Event Indexer
// ---------------------------------------------------------------------------

export class EventIndexer {
  private handlers: HandlerEntry[] = [];
  private eventLog: MarketplaceEvent[] = [];
  private maxLogSize: number;

  constructor(options?: { maxLogSize?: number }) {
    this.maxLogSize = options?.maxLogSize ?? 10_000;
  }

  // -------------------------------------------------------------------------
  // Subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to a specific event type with a typed handler.
   * Returns an unsubscribe function.
   */
  on<K extends MarketplaceEventType>(
    type: K,
    handler: EventHandler<K extends keyof EventPayloadMap ? EventPayloadMap[K] : unknown>,
  ): () => void {
    const entry: HandlerEntry = {
      type,
      handler: handler as EventHandler<unknown>,
      once: false,
    };
    this.handlers.push(entry);

    return () => {
      this.handlers = this.handlers.filter((h) => h !== entry);
    };
  }

  /**
   * Subscribe to a specific event type, but only fire once.
   * Automatically unsubscribes after the first matching event.
   */
  once<K extends MarketplaceEventType>(
    type: K,
    handler: EventHandler<K extends keyof EventPayloadMap ? EventPayloadMap[K] : unknown>,
  ): () => void {
    const entry: HandlerEntry = {
      type,
      handler: handler as EventHandler<unknown>,
      once: true,
    };
    this.handlers.push(entry);

    return () => {
      this.handlers = this.handlers.filter((h) => h !== entry);
    };
  }

  /**
   * Subscribe to ALL event types. Useful for logging and analytics.
   * Returns an unsubscribe function.
   */
  onAny(handler: EventHandler<unknown>): () => void {
    const entries: HandlerEntry[] = ALL_EVENT_TYPES.map((type) => ({
      type,
      handler,
      once: false,
    }));

    this.handlers.push(...entries);

    return () => {
      this.handlers = this.handlers.filter((h) => !entries.includes(h));
    };
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  /**
   * Dispatch an event to all matching handlers.
   * Also appends the event to the internal log.
   */
  async dispatch(event: MarketplaceEvent): Promise<void> {
    // Log the event
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // Collect handlers to remove after (once handlers)
    const toRemove: HandlerEntry[] = [];

    // Execute all matching handlers
    const promises: Promise<void>[] = [];

    for (const entry of this.handlers) {
      if (entry.type === event.type) {
        try {
          const result = entry.handler(event);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          // Handler errors should not prevent other handlers from executing
          console.error(
            `[EventIndexer] Handler error for '${event.type}':`,
            error,
          );
        }

        if (entry.once) {
          toRemove.push(entry);
        }
      }
    }

    // Await async handlers
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    // Remove once-handlers
    if (toRemove.length > 0) {
      this.handlers = this.handlers.filter((h) => !toRemove.includes(h));
    }
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /** Get the full event log (most recent events last). */
  getEventLog(): ReadonlyArray<MarketplaceEvent> {
    return this.eventLog;
  }

  /** Get events of a specific type. */
  getEvents(type: MarketplaceEventType): MarketplaceEvent[] {
    return this.eventLog.filter((e) => e.type === type);
  }

  /** Get events for a specific listing. */
  getEventsForListing(listingId: string): MarketplaceEvent[] {
    return this.eventLog.filter((e) => e.listingId === listingId);
  }

  /** Get events within a time range. */
  getEventsBetween(start: Date, end: Date): MarketplaceEvent[] {
    return this.eventLog.filter(
      (e) => e.timestamp >= start && e.timestamp <= end,
    );
  }

  /** Get the count of events by type. */
  getEventCounts(): Record<MarketplaceEventType, number> {
    const counts = {} as Record<MarketplaceEventType, number>;
    for (const type of ALL_EVENT_TYPES) {
      counts[type] = 0;
    }
    for (const event of this.eventLog) {
      counts[event.type]++;
    }
    return counts;
  }

  /** Get the number of registered handlers. */
  getHandlerCount(): number {
    return this.handlers.length;
  }

  /** Clear the event log. */
  clearLog(): void {
    this.eventLog = [];
  }

  /** Remove all handlers. */
  removeAllHandlers(): void {
    this.handlers = [];
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_EVENT_TYPES: MarketplaceEventType[] = [
  'listing_created',
  'listing_cancelled',
  'listing_updated',
  'sale_completed',
  'auction_started',
  'auction_ended',
  'bid_placed',
  'bid_outbid',
  'price_updated',
];

// ---------------------------------------------------------------------------
// Convenience: pre-built event filters
// ---------------------------------------------------------------------------

/**
 * Create an event filter that passes events matching specific criteria.
 * Useful for building filtered event streams.
 */
export function createEventFilter(criteria: {
  types?: MarketplaceEventType[];
  listingIds?: string[];
  after?: Date;
  before?: Date;
}): (event: MarketplaceEvent) => boolean {
  return (event: MarketplaceEvent): boolean => {
    if (criteria.types && !criteria.types.includes(event.type)) return false;
    if (criteria.listingIds && !criteria.listingIds.includes(event.listingId))
      return false;
    if (criteria.after && event.timestamp < criteria.after) return false;
    if (criteria.before && event.timestamp > criteria.before) return false;
    return true;
  };
}
