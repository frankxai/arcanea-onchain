/**
 * @arcanea/onboarding
 *
 * Crossmint fiat-to-NFT onboarding for Arcanea.
 *
 * Features:
 * - Credit card minting — no crypto wallet required
 * - Custodial wallet creation via email
 * - Email-based NFT delivery for non-crypto-native creators
 * - Seamless upgrade path from custodial to self-custody
 * - Multi-chain support (Solana + Base)
 * - Idempotent mint pipeline with retry logic
 * - Batch minting for collection drops
 *
 * Philosophy: Zero friction. A creator should go from inspiration
 * to on-chain ownership in under 60 seconds.
 */

// --- Types ---
export type {
  BatchMintRequest,
  BatchMintResult,
  Chain,
  CheckoutResult,
  CheckoutSession,
  CreateCheckoutParams,
  CreateWalletParams,
  CreateWalletResult,
  ExportWalletParams,
  ExportWalletResult,
  IdempotencyRecord,
  MintAndDeliverResult,
  MintRequest,
  OnboardingUser,
  PaymentMethod,
  PaymentWebhookEvent,
  PaymentWebhookEventType,
  PriceBreakdown,
  RecoverWalletParams,
  RecoverWalletResult,
  WalletConfig,
  WalletProvider,
} from './types';

// --- Crossmint Wallet Manager ---
export { CrossmintWalletManager, CrossmintError } from './wallets/crossmint';
export type { CrossmintConfig } from './wallets/crossmint';

// --- Payment Processor ---
export { PaymentProcessor, PaymentError } from './checkout/payment';
export type { PaymentConfig } from './checkout/payment';

// --- Mint Pipeline ---
export { MintPipeline, MintPipelineError } from './mint/pipeline';
export type {
  AuditLogEntry,
  MintHandler,
  MintPipelineConfig,
} from './mint/pipeline';
