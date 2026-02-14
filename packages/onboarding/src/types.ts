/**
 * @arcanea/onboarding — Core Types
 *
 * All type definitions for the Arcanea onboarding system:
 * wallet creation, fiat checkout, and mint-on-purchase pipeline.
 */

// ---------------------------------------------------------------------------
// Wallet types
// ---------------------------------------------------------------------------

export type WalletProvider = 'crossmint' | 'phantom' | 'metamask';
export type Chain = 'solana' | 'base' | 'both';
export type PaymentMethod = 'card' | 'apple_pay' | 'google_pay';

export interface WalletConfig {
  provider: WalletProvider;
  chain: Chain;
  /** If true, Crossmint manages the private key (email-based login). */
  custodial: boolean;
}

export interface OnboardingUser {
  id: string;
  email: string;
  walletAddress?: string;
  chain?: string;
  provider: string;
  /** Whether the wallet is custodial (Crossmint-managed) or self-custody. */
  custodial: boolean;
  kycVerified: boolean;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Wallet operations
// ---------------------------------------------------------------------------

export interface CreateWalletParams {
  email: string;
  chain: Chain;
  /** Optional display name for the user. */
  displayName?: string;
}

export interface CreateWalletResult {
  userId: string;
  walletAddress: string;
  chain: string;
  custodial: true;
  /** Crossmint wallet ID for internal reference. */
  crossmintWalletId: string;
}

export interface ExportWalletParams {
  userId: string;
  /** Target wallet provider to export to. */
  targetProvider: 'phantom' | 'metamask';
  /** The chain to export the wallet for. */
  chain: 'solana' | 'base';
}

export interface ExportWalletResult {
  success: boolean;
  walletAddress: string;
  chain: string;
  targetProvider: string;
  /** Instructions for the user to complete the transfer. */
  instructions: string;
  error?: string;
}

export interface RecoverWalletParams {
  email: string;
  /** Verification code sent to the user's email. */
  verificationCode: string;
}

export interface RecoverWalletResult {
  success: boolean;
  userId: string;
  walletAddress: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Checkout types
// ---------------------------------------------------------------------------

export interface CheckoutSession {
  id: string;
  userId: string;
  nftId: string;
  /** Amount in USD cents (e.g. 2500 = $25.00). */
  amount: number;
  currency: 'usd';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paymentMethod: PaymentMethod;
  /** On-chain transaction hash once mint is confirmed. */
  mintTxHash?: string;
  createdAt: Date;
}

export interface CreateCheckoutParams {
  userId: string;
  nftId: string;
  paymentMethod: PaymentMethod;
  /** NFT price in USD cents. */
  priceUsdCents: number;
  /** Optional metadata to attach to the checkout session. */
  metadata?: Record<string, unknown>;
}

export interface CheckoutResult {
  sessionId: string;
  /** URL to redirect the user to for payment (card form, Apple Pay, etc). */
  checkoutUrl: string;
  /** Amount charged in USD cents. */
  totalAmountCents: number;
  /** Breakdown of the charge. */
  breakdown: PriceBreakdown;
}

export interface PriceBreakdown {
  /** Base NFT price in USD cents. */
  nftPriceCents: number;
  /** Platform service fee in USD cents. */
  serviceFeeCents: number;
  /** Payment processing fee in USD cents. */
  processingFeeCents: number;
  /** Total charge in USD cents. */
  totalCents: number;
}

// ---------------------------------------------------------------------------
// Payment webhook
// ---------------------------------------------------------------------------

export type PaymentWebhookEventType =
  | 'payment.pending'
  | 'payment.processing'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.refunded';

export interface PaymentWebhookEvent {
  type: PaymentWebhookEventType;
  sessionId: string;
  timestamp: Date;
  data: {
    userId: string;
    nftId: string;
    amount: number;
    currency: 'usd';
    txHash?: string;
    failureReason?: string;
  };
}

// ---------------------------------------------------------------------------
// Mint pipeline
// ---------------------------------------------------------------------------

export interface MintAndDeliverResult {
  success: boolean;
  txHash?: string;
  nftAddress?: string;
  tokenId?: string;
  walletAddress: string;
  error?: string;
}

export interface MintRequest {
  /** Checkout session that triggered this mint. */
  sessionId: string;
  userId: string;
  nftId: string;
  walletAddress: string;
  chain: 'solana' | 'base';
  /** Metadata URI (IPFS/Arweave) for the NFT. */
  metadataUri: string;
  /** Collection address the NFT belongs to. */
  collectionAddress: string;
  /** Whether to use compressed NFTs (Solana only). */
  compressed?: boolean;
}

export interface BatchMintRequest {
  /** Shared collection address. */
  collectionAddress: string;
  chain: 'solana' | 'base';
  /** Individual mint items. */
  items: Array<{
    userId: string;
    walletAddress: string;
    metadataUri: string;
    sessionId: string;
  }>;
  /** Whether to use compressed NFTs (Solana only). */
  compressed?: boolean;
}

export interface BatchMintResult {
  totalRequested: number;
  successful: number;
  failed: number;
  results: MintAndDeliverResult[];
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export interface IdempotencyRecord {
  key: string;
  sessionId: string;
  result: MintAndDeliverResult;
  createdAt: Date;
  expiresAt: Date;
}
