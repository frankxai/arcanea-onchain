/**
 * @arcanea/onboarding — Mint Pipeline
 *
 * The mint-on-purchase pipeline handles the full lifecycle:
 *   Payment confirmed -> Mint NFT -> Deliver to wallet
 *
 * Key guarantees:
 * - Idempotency: duplicate payment events never double-mint
 * - Retry logic: transient failures are retried with exponential backoff
 * - Batch support: collection drops can mint many NFTs in parallel
 * - Audit trail: every mint attempt is logged
 */

import type {
  BatchMintRequest,
  BatchMintResult,
  IdempotencyRecord,
  MintAndDeliverResult,
  MintRequest,
  PaymentWebhookEvent,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum retry attempts for transient failures. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms). */
const BASE_RETRY_DELAY_MS = 2000;

/** Idempotency record TTL: 24 hours. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Maximum concurrent mints in a batch. */
const MAX_BATCH_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MintPipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'MintPipelineError';
  }
}

// ---------------------------------------------------------------------------
// Mint handler interface
// ---------------------------------------------------------------------------

/**
 * Abstract interface for the actual on-chain minting operation.
 * Implement this for Solana (Metaplex/Bubblegum) or Base (ERC-721).
 */
export interface MintHandler {
  /** Execute the mint transaction and return the result. */
  mint(request: MintRequest): Promise<MintAndDeliverResult>;
}

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

export interface MintPipelineConfig {
  /** Handler for Solana minting. */
  solanaMintHandler: MintHandler;
  /** Handler for Base (EVM) minting. */
  baseMintHandler: MintHandler;
  /** Maximum retries for transient failures (default: 3). */
  maxRetries?: number;
  /** Maximum concurrent batch mints (default: 10). */
  maxBatchConcurrency?: number;
  /** Callback for audit logging. */
  onAuditLog?: (entry: AuditLogEntry) => void;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  timestamp: Date;
  action: 'mint_started' | 'mint_succeeded' | 'mint_failed' | 'mint_retried' | 'idempotent_skip';
  sessionId: string;
  nftId?: string;
  walletAddress?: string;
  chain?: string;
  txHash?: string;
  error?: string;
  attempt?: number;
}

// ---------------------------------------------------------------------------
// Mint Pipeline
// ---------------------------------------------------------------------------

export class MintPipeline {
  private config: MintPipelineConfig;
  private idempotencyStore = new Map<string, IdempotencyRecord>();
  private auditLog: AuditLogEntry[] = [];
  private maxRetries: number;
  private maxBatchConcurrency: number;

  constructor(config: MintPipelineConfig) {
    this.config = config;
    this.maxRetries = config.maxRetries ?? MAX_RETRIES;
    this.maxBatchConcurrency = config.maxBatchConcurrency ?? MAX_BATCH_CONCURRENCY;
  }

  // -------------------------------------------------------------------------
  // Single mint
  // -------------------------------------------------------------------------

  /**
   * Execute a mint-and-deliver operation for a single NFT.
   * Includes idempotency checks and retry logic.
   */
  async mintAndDeliver(request: MintRequest): Promise<MintAndDeliverResult> {
    // --- Idempotency check ---
    const idempotencyKey = this.buildIdempotencyKey(request.sessionId, request.nftId);
    const existingRecord = this.getIdempotencyRecord(idempotencyKey);

    if (existingRecord) {
      this.log({
        timestamp: new Date(),
        action: 'idempotent_skip',
        sessionId: request.sessionId,
        nftId: request.nftId,
        walletAddress: request.walletAddress,
        chain: request.chain,
        txHash: existingRecord.result.txHash,
      });
      return existingRecord.result;
    }

    // --- Validate request ---
    this.validateMintRequest(request);

    // --- Execute with retry ---
    const handler = this.getHandler(request.chain);
    const result = await this.executeWithRetry(handler, request);

    // --- Store idempotency record ---
    if (result.success) {
      this.setIdempotencyRecord(idempotencyKey, request.sessionId, result);
    }

    return result;
  }

  /**
   * Process a payment webhook event and trigger minting.
   * Only triggers on `payment.completed` events.
   */
  async handlePaymentEvent(
    event: PaymentWebhookEvent,
    mintParams: {
      walletAddress: string;
      chain: 'solana' | 'base';
      metadataUri: string;
      collectionAddress: string;
      compressed?: boolean;
    },
  ): Promise<MintAndDeliverResult | null> {
    // Only mint on completed payments
    if (event.type !== 'payment.completed') {
      return null;
    }

    const request: MintRequest = {
      sessionId: event.sessionId,
      userId: event.data.userId,
      nftId: event.data.nftId,
      walletAddress: mintParams.walletAddress,
      chain: mintParams.chain,
      metadataUri: mintParams.metadataUri,
      collectionAddress: mintParams.collectionAddress,
      compressed: mintParams.compressed,
    };

    return this.mintAndDeliver(request);
  }

  // -------------------------------------------------------------------------
  // Batch mint
  // -------------------------------------------------------------------------

  /**
   * Mint multiple NFTs in a batch with concurrency control.
   * Used for collection drops where many mints happen simultaneously.
   */
  async batchMint(request: BatchMintRequest): Promise<BatchMintResult> {
    if (request.items.length === 0) {
      return { totalRequested: 0, successful: 0, failed: 0, results: [] };
    }

    const results: MintAndDeliverResult[] = [];
    const chunks = this.chunkArray(request.items, this.maxBatchConcurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map((item) =>
          this.mintAndDeliver({
            sessionId: item.sessionId,
            userId: item.userId,
            nftId: `${request.collectionAddress}_${item.sessionId}`,
            walletAddress: item.walletAddress,
            chain: request.chain,
            metadataUri: item.metadataUri,
            collectionAddress: request.collectionAddress,
            compressed: request.compressed,
          }),
        ),
      );

      for (const settledResult of chunkResults) {
        if (settledResult.status === 'fulfilled') {
          results.push(settledResult.value);
        } else {
          results.push({
            success: false,
            walletAddress: '',
            error: settledResult.reason instanceof Error
              ? settledResult.reason.message
              : 'Unknown batch mint error',
          });
        }
      }
    }

    const successful = results.filter((r) => r.success).length;

    return {
      totalRequested: request.items.length,
      successful,
      failed: request.items.length - successful,
      results,
    };
  }

  // -------------------------------------------------------------------------
  // Retry logic
  // -------------------------------------------------------------------------

  /**
   * Execute a mint with exponential backoff retry.
   * Only retries on transient errors (network, timeout, rate limit).
   */
  private async executeWithRetry(
    handler: MintHandler,
    request: MintRequest,
  ): Promise<MintAndDeliverResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      this.log({
        timestamp: new Date(),
        action: attempt === 1 ? 'mint_started' : 'mint_retried',
        sessionId: request.sessionId,
        nftId: request.nftId,
        walletAddress: request.walletAddress,
        chain: request.chain,
        attempt,
      });

      try {
        const result = await handler.mint(request);

        if (result.success) {
          this.log({
            timestamp: new Date(),
            action: 'mint_succeeded',
            sessionId: request.sessionId,
            nftId: request.nftId,
            walletAddress: result.walletAddress,
            chain: request.chain,
            txHash: result.txHash,
          });
          return result;
        }

        // Non-retryable failure from handler
        if (result.error && !this.isRetryable(result.error)) {
          this.log({
            timestamp: new Date(),
            action: 'mint_failed',
            sessionId: request.sessionId,
            nftId: request.nftId,
            walletAddress: request.walletAddress,
            chain: request.chain,
            error: result.error,
            attempt,
          });
          return result;
        }

        lastError = new Error(result.error ?? 'Mint failed');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryable(lastError.message)) {
          this.log({
            timestamp: new Date(),
            action: 'mint_failed',
            sessionId: request.sessionId,
            nftId: request.nftId,
            walletAddress: request.walletAddress,
            chain: request.chain,
            error: lastError.message,
            attempt,
          });

          return {
            success: false,
            walletAddress: request.walletAddress,
            error: lastError.message,
          };
        }
      }

      // Wait before retrying (exponential backoff with jitter)
      if (attempt < this.maxRetries) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * delay * 0.3;
        await this.sleep(delay + jitter);
      }
    }

    // All retries exhausted
    const errorMessage = lastError?.message ?? 'Max retries exceeded';

    this.log({
      timestamp: new Date(),
      action: 'mint_failed',
      sessionId: request.sessionId,
      nftId: request.nftId,
      walletAddress: request.walletAddress,
      chain: request.chain,
      error: `Max retries (${this.maxRetries}) exhausted: ${errorMessage}`,
    });

    return {
      success: false,
      walletAddress: request.walletAddress,
      error: `Mint failed after ${this.maxRetries} attempts: ${errorMessage}`,
    };
  }

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  private buildIdempotencyKey(sessionId: string, nftId: string): string {
    return `idem_${sessionId}_${nftId}`;
  }

  private getIdempotencyRecord(key: string): IdempotencyRecord | undefined {
    const record = this.idempotencyStore.get(key);
    if (!record) return undefined;

    // Check TTL
    if (record.expiresAt < new Date()) {
      this.idempotencyStore.delete(key);
      return undefined;
    }

    return record;
  }

  private setIdempotencyRecord(
    key: string,
    sessionId: string,
    result: MintAndDeliverResult,
  ): void {
    const now = new Date();
    this.idempotencyStore.set(key, {
      key,
      sessionId,
      result,
      createdAt: now,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    });
  }

  /** Clean up expired idempotency records. */
  cleanupIdempotencyRecords(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [key, record] of this.idempotencyStore) {
      if (record.expiresAt < now) {
        this.idempotencyStore.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Get the full audit log. */
  getAuditLog(): ReadonlyArray<AuditLogEntry> {
    return this.auditLog;
  }

  /** Get audit log entries for a specific session. */
  getAuditLogForSession(sessionId: string): AuditLogEntry[] {
    return this.auditLog.filter((e) => e.sessionId === sessionId);
  }

  /** Get the number of stored idempotency records. */
  getIdempotencyRecordCount(): number {
    return this.idempotencyStore.size;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private getHandler(chain: 'solana' | 'base'): MintHandler {
    switch (chain) {
      case 'solana':
        return this.config.solanaMintHandler;
      case 'base':
        return this.config.baseMintHandler;
      default:
        throw new MintPipelineError(
          `Unsupported chain: ${chain}`,
          'UNSUPPORTED_CHAIN',
        );
    }
  }

  private validateMintRequest(request: MintRequest): void {
    if (!request.sessionId?.trim()) {
      throw new MintPipelineError('Session ID is required', 'MISSING_SESSION_ID');
    }
    if (!request.userId?.trim()) {
      throw new MintPipelineError('User ID is required', 'MISSING_USER_ID');
    }
    if (!request.walletAddress?.trim()) {
      throw new MintPipelineError(
        'Wallet address is required',
        'MISSING_WALLET_ADDRESS',
      );
    }
    if (!request.metadataUri?.trim()) {
      throw new MintPipelineError(
        'Metadata URI is required',
        'MISSING_METADATA_URI',
      );
    }
    if (!request.collectionAddress?.trim()) {
      throw new MintPipelineError(
        'Collection address is required',
        'MISSING_COLLECTION_ADDRESS',
      );
    }
  }

  /**
   * Determine if an error is transient and should be retried.
   * Network errors, timeouts, and rate limits are retryable.
   */
  private isRetryable(errorMessage: string): boolean {
    const retryablePatterns = [
      'timeout',
      'network',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'rate limit',
      'too many requests',
      '429',
      '502',
      '503',
      '504',
      'blockhash not found',
      'slot has been skipped',
      'transaction simulation failed',
    ];

    const lower = errorMessage.toLowerCase();
    return retryablePatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
  }

  private log(entry: AuditLogEntry): void {
    this.auditLog.push(entry);
    this.config.onAuditLog?.(entry);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
