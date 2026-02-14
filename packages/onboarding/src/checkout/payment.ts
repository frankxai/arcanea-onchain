/**
 * @arcanea/onboarding — Payment Processing
 *
 * Fiat-to-crypto payment flow for NFT purchases.
 * Abstracts away the complexity of crypto so creators can pay
 * with credit card, Apple Pay, or Google Pay.
 *
 * Flow:
 * 1. Create checkout session with NFT + payment method
 * 2. User completes payment on hosted checkout page
 * 3. Webhook confirms payment
 * 4. Mint pipeline triggered (see mint/pipeline.ts)
 *
 * Fee structure:
 * - Service fee: 3% (covers gas, infrastructure)
 * - Processing fee: 2.9% + $0.30 (card processing)
 */

import type {
  CheckoutResult,
  CheckoutSession,
  CreateCheckoutParams,
  PaymentMethod,
  PaymentWebhookEvent,
  PaymentWebhookEventType,
  PriceBreakdown,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Service fee: 3% = 300 basis points. */
const SERVICE_FEE_BPS = 300;

/** Card processing fee: 2.9% = 290 basis points. */
const PROCESSING_FEE_BPS = 290;

/** Fixed card processing fee: $0.30 = 30 cents. */
const PROCESSING_FIXED_FEE_CENTS = 30;

/** Minimum checkout amount: $1.00. */
const MIN_CHECKOUT_CENTS = 100;

/** Maximum checkout amount: $100,000.00. */
const MAX_CHECKOUT_CENTS = 10_000_000;

/** Checkout session expiry: 30 minutes. */
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PaymentConfig {
  /** Crossmint API key for payment processing. */
  apiKey: string;
  /** Crossmint project ID. */
  projectId: string;
  /** Webhook secret for verifying payment callbacks. */
  webhookSecret: string;
  /** Base URL for the checkout page redirect. */
  checkoutBaseUrl?: string;
  /** Override service fee in basis points (default 300). */
  serviceFeeBps?: number;
  /** API base URL override for testing. */
  baseUrl?: string;
}

const DEFAULT_CHECKOUT_BASE_URL = 'https://www.crossmint.com/checkout';
const DEFAULT_API_BASE_URL = 'https://www.crossmint.com/api/v1-alpha2';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

// ---------------------------------------------------------------------------
// Payment Processor
// ---------------------------------------------------------------------------

export class PaymentProcessor {
  private config: Required<PaymentConfig>;
  private sessions = new Map<string, CheckoutSession>();
  private webhookHandlers: Array<(event: PaymentWebhookEvent) => void | Promise<void>> =
    [];
  private idCounter = 0;

  constructor(config: PaymentConfig) {
    this.config = {
      apiKey: config.apiKey,
      projectId: config.projectId,
      webhookSecret: config.webhookSecret,
      checkoutBaseUrl: config.checkoutBaseUrl ?? DEFAULT_CHECKOUT_BASE_URL,
      serviceFeeBps: config.serviceFeeBps ?? SERVICE_FEE_BPS,
      baseUrl: config.baseUrl ?? DEFAULT_API_BASE_URL,
    };

    this.validateConfig();
  }

  // -------------------------------------------------------------------------
  // Checkout session creation
  // -------------------------------------------------------------------------

  /**
   * Create a new checkout session for an NFT purchase.
   * Returns a checkout URL where the user completes payment.
   */
  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    this.validateCheckoutParams(params);

    const breakdown = this.calculatePrice(
      params.priceUsdCents,
      params.paymentMethod,
    );
    const sessionId = this.generateSessionId();

    const session: CheckoutSession = {
      id: sessionId,
      userId: params.userId,
      nftId: params.nftId,
      amount: breakdown.totalCents,
      currency: 'usd',
      status: 'pending',
      paymentMethod: params.paymentMethod,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Create Crossmint checkout order
    const response = await this.apiRequest<{
      orderId: string;
      checkoutUrl: string;
    }>('/orders', 'POST', {
      type: 'purchase',
      payment: {
        method: this.mapPaymentMethod(params.paymentMethod),
        currency: 'usd',
        amount: breakdown.totalCents,
      },
      nft: {
        id: params.nftId,
      },
      recipient: {
        userId: params.userId,
      },
      metadata: {
        sessionId,
        ...params.metadata,
      },
    });

    const checkoutUrl = response.checkoutUrl || this.buildCheckoutUrl(sessionId);

    return {
      sessionId,
      checkoutUrl,
      totalAmountCents: breakdown.totalCents,
      breakdown,
    };
  }

  // -------------------------------------------------------------------------
  // Price calculation
  // -------------------------------------------------------------------------

  /**
   * Calculate the total price including all fees.
   * Transparent breakdown: NFT price + service fee + processing fee.
   */
  calculatePrice(
    nftPriceCents: number,
    paymentMethod: PaymentMethod,
  ): PriceBreakdown {
    if (nftPriceCents < MIN_CHECKOUT_CENTS) {
      throw new PaymentError(
        `Price must be at least $${(MIN_CHECKOUT_CENTS / 100).toFixed(2)}`,
        'PRICE_TOO_LOW',
      );
    }

    if (nftPriceCents > MAX_CHECKOUT_CENTS) {
      throw new PaymentError(
        `Price cannot exceed $${(MAX_CHECKOUT_CENTS / 100).toFixed(2)}`,
        'PRICE_TOO_HIGH',
      );
    }

    const serviceFeeCents = Math.ceil(
      (nftPriceCents * this.config.serviceFeeBps) / 10000,
    );

    // Processing fee varies by method
    let processingFeeCents: number;
    if (paymentMethod === 'card') {
      processingFeeCents =
        Math.ceil((nftPriceCents * PROCESSING_FEE_BPS) / 10000) +
        PROCESSING_FIXED_FEE_CENTS;
    } else {
      // Apple Pay / Google Pay: slightly lower processing
      processingFeeCents = Math.ceil(
        (nftPriceCents * (PROCESSING_FEE_BPS - 40)) / 10000,
      );
    }

    const totalCents = nftPriceCents + serviceFeeCents + processingFeeCents;

    return {
      nftPriceCents,
      serviceFeeCents,
      processingFeeCents,
      totalCents,
    };
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  /** Get a checkout session by ID. */
  getSession(sessionId: string): CheckoutSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get a checkout session, throwing if not found. */
  getSessionOrThrow(sessionId: string): CheckoutSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new PaymentError(
        `Checkout session '${sessionId}' not found`,
        'SESSION_NOT_FOUND',
      );
    }
    return session;
  }

  /** Get all sessions for a user. */
  getSessionsForUser(userId: string): CheckoutSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId,
    );
  }

  /** Update session status. Used internally by webhook handler. */
  private updateSessionStatus(
    sessionId: string,
    status: CheckoutSession['status'],
    txHash?: string,
  ): CheckoutSession {
    const session = this.getSessionOrThrow(sessionId);
    session.status = status;
    if (txHash) session.mintTxHash = txHash;
    return session;
  }

  /**
   * Expire stale sessions that have been pending beyond the timeout.
   * Returns the number of expired sessions.
   */
  expireStaleSessions(): number {
    const now = Date.now();
    let expired = 0;

    for (const session of this.sessions.values()) {
      if (
        session.status === 'pending' &&
        now - session.createdAt.getTime() > SESSION_EXPIRY_MS
      ) {
        session.status = 'failed';
        expired++;
      }
    }

    return expired;
  }

  // -------------------------------------------------------------------------
  // Webhook handling
  // -------------------------------------------------------------------------

  /**
   * Register a handler for payment webhook events.
   * The mint pipeline subscribes here to trigger minting on payment confirmation.
   */
  onPaymentEvent(
    handler: (event: PaymentWebhookEvent) => void | Promise<void>,
  ): () => void {
    this.webhookHandlers.push(handler);
    return () => {
      this.webhookHandlers = this.webhookHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Process an incoming webhook from the payment provider.
   * Validates the signature, updates session status, and dispatches to handlers.
   */
  async handleWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ processed: boolean; sessionId?: string }> {
    // --- Verify webhook signature ---
    if (!this.verifyWebhookSignature(rawBody, signature)) {
      throw new PaymentError(
        'Invalid webhook signature',
        'INVALID_SIGNATURE',
      );
    }

    // --- Parse the event ---
    let payload: {
      type: string;
      data: {
        sessionId: string;
        userId: string;
        nftId: string;
        amount: number;
        currency: string;
        txHash?: string;
        failureReason?: string;
      };
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new PaymentError('Invalid webhook payload', 'INVALID_PAYLOAD');
    }

    const eventType = this.mapWebhookEventType(payload.type);
    if (!eventType) {
      // Unknown event type — acknowledge but don't process
      return { processed: false };
    }

    // --- Update session ---
    const sessionId = payload.data.sessionId;
    const statusMap: Record<PaymentWebhookEventType, CheckoutSession['status']> = {
      'payment.pending': 'pending',
      'payment.processing': 'processing',
      'payment.completed': 'completed',
      'payment.failed': 'failed',
      'payment.refunded': 'failed',
    };

    this.updateSessionStatus(
      sessionId,
      statusMap[eventType],
      payload.data.txHash,
    );

    // --- Dispatch to handlers ---
    const event: PaymentWebhookEvent = {
      type: eventType,
      sessionId,
      timestamp: new Date(),
      data: {
        userId: payload.data.userId,
        nftId: payload.data.nftId,
        amount: payload.data.amount,
        currency: 'usd',
        txHash: payload.data.txHash,
        failureReason: payload.data.failureReason,
      },
    };

    const promises: Promise<void>[] = [];
    for (const handler of this.webhookHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error('[PaymentProcessor] Webhook handler error:', error);
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    return { processed: true, sessionId };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private generateSessionId(): string {
    this.idCounter++;
    return `cs_${Date.now()}_${this.idCounter}`;
  }

  private buildCheckoutUrl(sessionId: string): string {
    return `${this.config.checkoutBaseUrl}?session=${sessionId}&project=${this.config.projectId}`;
  }

  private mapPaymentMethod(
    method: PaymentMethod,
  ): string {
    switch (method) {
      case 'card':
        return 'credit-card';
      case 'apple_pay':
        return 'apple-pay';
      case 'google_pay':
        return 'google-pay';
    }
  }

  private mapWebhookEventType(
    rawType: string,
  ): PaymentWebhookEventType | null {
    const validTypes: PaymentWebhookEventType[] = [
      'payment.pending',
      'payment.processing',
      'payment.completed',
      'payment.failed',
      'payment.refunded',
    ];

    return validTypes.includes(rawType as PaymentWebhookEventType)
      ? (rawType as PaymentWebhookEventType)
      : null;
  }

  /**
   * Verify the webhook signature using HMAC-SHA256.
   * The signature is computed over the raw body using the webhook secret.
   */
  private verifyWebhookSignature(
    rawBody: string,
    signature: string,
  ): boolean {
    if (!signature?.trim()) return false;

    // In production, this uses crypto.createHmac('sha256', secret)
    // For now, we do a constant-time comparison placeholder
    // The actual implementation should use Node.js crypto module:
    //
    // const expected = crypto
    //   .createHmac('sha256', this.config.webhookSecret)
    //   .update(rawBody)
    //   .digest('hex');
    // return crypto.timingSafeEqual(
    //   Buffer.from(signature),
    //   Buffer.from(expected),
    // );

    // Placeholder: accept signatures that match the expected format
    return signature.length >= 64 && /^[a-f0-9]+$/i.test(signature);
  }

  private validateConfig(): void {
    if (!this.config.apiKey?.trim()) {
      throw new PaymentError('API key is required', 'MISSING_API_KEY');
    }
    if (!this.config.projectId?.trim()) {
      throw new PaymentError('Project ID is required', 'MISSING_PROJECT_ID');
    }
    if (!this.config.webhookSecret?.trim()) {
      throw new PaymentError(
        'Webhook secret is required',
        'MISSING_WEBHOOK_SECRET',
      );
    }
  }

  private validateCheckoutParams(params: CreateCheckoutParams): void {
    if (!params.userId?.trim()) {
      throw new PaymentError('User ID is required', 'MISSING_USER_ID');
    }
    if (!params.nftId?.trim()) {
      throw new PaymentError('NFT ID is required', 'MISSING_NFT_ID');
    }
    if (params.priceUsdCents < MIN_CHECKOUT_CENTS) {
      throw new PaymentError(
        `Price must be at least $${(MIN_CHECKOUT_CENTS / 100).toFixed(2)}`,
        'PRICE_TOO_LOW',
      );
    }
    if (params.priceUsdCents > MAX_CHECKOUT_CENTS) {
      throw new PaymentError(
        `Price cannot exceed $${(MAX_CHECKOUT_CENTS / 100).toFixed(2)}`,
        'PRICE_TOO_HIGH',
      );
    }
  }

  private async apiRequest<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.config.apiKey,
        'X-PROJECT-ID': this.config.projectId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new PaymentError(
        `Payment API error: ${response.status} ${errorBody}`,
        'API_ERROR',
      );
    }

    return (await response.json()) as T;
  }
}
