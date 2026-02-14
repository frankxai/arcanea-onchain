/**
 * @arcanea/onboarding — Comprehensive Test Suite
 *
 * Tests for all three modules:
 *   1. CrossmintWalletManager (wallets/crossmint.ts)
 *   2. PaymentProcessor (checkout/payment.ts)
 *   3. MintPipeline (mint/pipeline.ts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CrossmintWalletManager,
  CrossmintError,
} from '../src/wallets/crossmint';
import { PaymentProcessor, PaymentError } from '../src/checkout/payment';
import {
  MintPipeline,
  MintPipelineError,
  type MintHandler,
} from '../src/mint/pipeline';
import type {
  MintRequest,
  MintAndDeliverResult,
  PaymentWebhookEvent,
} from '../src/types';

// =============================================================================
// Helpers
// =============================================================================

/** A valid hex signature that passes the >=64 hex chars check. */
const VALID_SIGNATURE = 'a'.repeat(64);

/** Standard Crossmint config for tests. */
function crossmintConfig(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: 'test-api-key',
    projectId: 'test-project-id',
    baseUrl: 'https://test.crossmint.com/api',
    ...overrides,
  };
}

/** Standard PaymentProcessor config for tests. */
function paymentConfig(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: 'test-api-key',
    projectId: 'test-project-id',
    webhookSecret: 'test-webhook-secret',
    baseUrl: 'https://test.crossmint.com/api',
    ...overrides,
  };
}

/** Build a standard MintRequest. */
function mintRequest(overrides: Partial<MintRequest> = {}): MintRequest {
  return {
    sessionId: 'sess_001',
    userId: 'user_001',
    nftId: 'nft_001',
    walletAddress: 'So1ana1111111111111111111111111111111111111',
    chain: 'solana',
    metadataUri: 'https://arweave.net/metadata.json',
    collectionAddress: 'Col1ection1111111111111111111111111111111',
    ...overrides,
  };
}

/** Create a mock fetch that returns a successful JSON response. */
function mockFetchSuccess(data: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

/** Create a mock fetch that returns an error response. */
function mockFetchError(status: number, body = 'Error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

/** Create mock MintHandler objects. */
function createMockHandlers() {
  const solanaHandler: MintHandler = {
    mint: vi.fn<(req: MintRequest) => Promise<MintAndDeliverResult>>().mockResolvedValue({
      success: true,
      txHash: 'sol_tx_abc123',
      nftAddress: 'SolNft111111111111111111111111111111111',
      walletAddress: 'So1ana1111111111111111111111111111111111111',
    }),
  };
  const baseHandler: MintHandler = {
    mint: vi.fn<(req: MintRequest) => Promise<MintAndDeliverResult>>().mockResolvedValue({
      success: true,
      txHash: '0xbase_tx_def456',
      nftAddress: '0xBaseNft000000000000000000000000000000',
      walletAddress: '0xBaseWallet0000000000000000000000000000',
    }),
  };
  return { solanaHandler, baseHandler };
}

// =============================================================================
// Module 1: CrossmintWalletManager
// =============================================================================

describe('CrossmintWalletManager', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess({
      id: 'user_123',
      address: 'SolWallet111111111111111111111111111111111',
      chain: 'solana',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // Config validation
  // ---------------------------------------------------------------------------

  describe('config validation', () => {
    it('throws CrossmintError when apiKey is missing', () => {
      expect(() => crossmintConfig({ apiKey: '' }))
        .not.toThrow(); // config builder itself doesn't throw
      expect(
        () => new CrossmintWalletManager(crossmintConfig({ apiKey: '' }) as any),
      ).toThrow(CrossmintError);
    });

    it('throws CrossmintError when apiKey is whitespace-only', () => {
      expect(
        () => new CrossmintWalletManager(crossmintConfig({ apiKey: '   ' }) as any),
      ).toThrow('API key is required');
    });

    it('throws CrossmintError when projectId is missing', () => {
      expect(
        () =>
          new CrossmintWalletManager(
            crossmintConfig({ projectId: '' }) as any,
          ),
      ).toThrow(CrossmintError);
    });

    it('throws CrossmintError with correct code for missing projectId', () => {
      try {
        new CrossmintWalletManager(crossmintConfig({ projectId: '' }) as any);
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CrossmintError);
        expect((e as CrossmintError).code).toBe('MISSING_PROJECT_ID');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // createWallet
  // ---------------------------------------------------------------------------

  describe('createWallet', () => {
    it('creates a wallet with a valid email', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });

      expect(result.userId).toBe('user_123');
      expect(result.walletAddress).toBe('SolWallet111111111111111111111111111111111');
      expect(result.chain).toBe('solana');
      expect(result.custodial).toBe(true);
      expect(result.crossmintWalletId).toBe('cmw_user_123');
    });

    it('throws CrossmintError for empty email', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await expect(
        manager.createWallet({ email: '', chain: 'solana' }),
      ).rejects.toThrow(CrossmintError);
    });

    it('throws CrossmintError for invalid email format', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await expect(
        manager.createWallet({ email: 'not-an-email', chain: 'solana' }),
      ).rejects.toThrow('Invalid email format');
    });

    it('returns existing wallet for duplicate email', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);

      const first = await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });
      const second = await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });

      expect(second.userId).toBe(first.userId);
      expect(second.walletAddress).toBe(first.walletAddress);
      // fetch should have been called only once (the second call hits the cache)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('stores user in-memory after creation', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });

      const user = manager.getUserByEmail('creator@arcanea.ai');
      expect(user).toBeDefined();
      expect(user!.email).toBe('creator@arcanea.ai');
      expect(user!.custodial).toBe(true);
      expect(user!.provider).toBe('crossmint');
    });

    it('sends displayName in linkedUser when provided', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
        displayName: 'Lumina',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.linkedUser).toBe('email:creator@arcanea.ai:Lumina');
    });

    it('calls the correct API endpoint', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://test.crossmint.com/api/wallets',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-KEY': 'test-api-key',
            'X-PROJECT-ID': 'test-project-id',
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // createMultiChainWallet
  // ---------------------------------------------------------------------------

  describe('createMultiChainWallet', () => {
    it('creates wallets on both solana and base', async () => {
      let callCount = 0;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        const chain = callCount === 1 ? 'solana' : 'base';
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: `user_${chain}`,
              address: `${chain}_wallet_addr`,
              chain,
            }),
        });
      });

      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.createMultiChainWallet('creator@arcanea.ai');

      expect(result.solana).toBeDefined();
      expect(result.base).toBeDefined();
      // Two fetch calls (one per chain)
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // recoverWallet
  // ---------------------------------------------------------------------------

  describe('recoverWallet', () => {
    it('throws when verification code is missing', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await expect(
        manager.recoverWallet({
          email: 'creator@arcanea.ai',
          verificationCode: '',
        }),
      ).rejects.toThrow(CrossmintError);
    });

    it('throws with MISSING_VERIFICATION_CODE code', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      try {
        await manager.recoverWallet({
          email: 'creator@arcanea.ai',
          verificationCode: '  ',
        });
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect((e as CrossmintError).code).toBe('MISSING_VERIFICATION_CODE');
      }
    });

    it('returns error result when API fails', async () => {
      globalThis.fetch = mockFetchError(500, 'Internal Server Error');
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.recoverWallet({
        email: 'creator@arcanea.ai',
        verificationCode: '123456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success when verification is valid', async () => {
      globalThis.fetch = mockFetchSuccess({
        userId: 'user_recovered',
        walletAddress: 'RecoveredWallet111111111111111111111111111',
        verified: true,
      });

      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.recoverWallet({
        email: 'creator@arcanea.ai',
        verificationCode: '123456',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user_recovered');
      expect(result.walletAddress).toBe('RecoveredWallet111111111111111111111111111');
    });

    it('returns failure when verification code is invalid', async () => {
      globalThis.fetch = mockFetchSuccess({
        userId: 'user_x',
        walletAddress: 'addr_x',
        verified: false,
      });

      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.recoverWallet({
        email: 'creator@arcanea.ai',
        verificationCode: 'wrong-code',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid or expired');
    });
  });

  // ---------------------------------------------------------------------------
  // exportToSelfCustody
  // ---------------------------------------------------------------------------

  describe('exportToSelfCustody', () => {
    async function managerWithUser() {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await manager.createWallet({ email: 'creator@arcanea.ai', chain: 'solana' });
      const user = manager.getUserByEmail('creator@arcanea.ai')!;
      return { manager, user };
    }

    it('throws USER_NOT_FOUND when user does not exist', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      await expect(
        manager.exportToSelfCustody({
          userId: 'nonexistent',
          targetProvider: 'phantom',
          chain: 'solana',
        }),
      ).rejects.toThrow('not found');
    });

    it('throws ALREADY_SELF_CUSTODY when user is not custodial', async () => {
      const { manager, user } = await managerWithUser();
      // Manually set user to non-custodial
      user.custodial = false;

      await expect(
        manager.exportToSelfCustody({
          userId: user.id,
          targetProvider: 'phantom',
          chain: 'solana',
        }),
      ).rejects.toThrow('already self-custody');
    });

    it('throws PROVIDER_CHAIN_MISMATCH for phantom + base', async () => {
      const { manager, user } = await managerWithUser();

      await expect(
        manager.exportToSelfCustody({
          userId: user.id,
          targetProvider: 'phantom',
          chain: 'base',
        }),
      ).rejects.toThrow('Phantom only supports Solana');
    });

    it('throws PROVIDER_CHAIN_MISMATCH for metamask + solana', async () => {
      const { manager, user } = await managerWithUser();

      await expect(
        manager.exportToSelfCustody({
          userId: user.id,
          targetProvider: 'metamask',
          chain: 'solana',
        }),
      ).rejects.toThrow('MetaMask export is for Base');
    });

    it('exports successfully with phantom + solana', async () => {
      const { manager, user } = await managerWithUser();

      globalThis.fetch = mockFetchSuccess({
        exportUrl: 'https://crossmint.com/export/abc',
        walletAddress: 'ExportedSolWallet1111111111111111111111',
      });

      const result = await manager.exportToSelfCustody({
        userId: user.id,
        targetProvider: 'phantom',
        chain: 'solana',
      });

      expect(result.success).toBe(true);
      expect(result.targetProvider).toBe('phantom');
      expect(result.instructions).toContain('Phantom');
    });

    it('updates user record after successful export', async () => {
      const { manager, user } = await managerWithUser();

      globalThis.fetch = mockFetchSuccess({
        exportUrl: 'https://crossmint.com/export/abc',
        walletAddress: 'ExportedSolWallet1111111111111111111111',
      });

      await manager.exportToSelfCustody({
        userId: user.id,
        targetProvider: 'phantom',
        chain: 'solana',
      });

      const updatedUser = manager.getUser(user.id)!;
      expect(updatedUser.custodial).toBe(false);
      expect(updatedUser.provider).toBe('phantom');
    });
  });

  // ---------------------------------------------------------------------------
  // User queries
  // ---------------------------------------------------------------------------

  describe('user queries', () => {
    it('getUser returns undefined for nonexistent user', () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      expect(manager.getUser('nonexistent')).toBeUndefined();
    });

    it('getUser returns user after createWallet', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });
      const user = manager.getUser(result.userId);
      expect(user).toBeDefined();
      expect(user!.id).toBe(result.userId);
    });

    it('getUserByEmail returns undefined for unknown email', () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      expect(manager.getUserByEmail('nobody@arcanea.ai')).toBeUndefined();
    });

    it('getWalletAddress returns undefined for nonexistent user', () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      expect(manager.getWalletAddress('nonexistent')).toBeUndefined();
    });

    it('getWalletAddress returns address after createWallet', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });
      expect(manager.getWalletAddress(result.userId)).toBe(result.walletAddress);
    });

    it('getWalletAddress returns undefined when chain filter does not match', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });
      expect(manager.getWalletAddress(result.userId, 'base')).toBeUndefined();
    });

    it('getWalletAddress returns address when chain filter matches', async () => {
      const manager = new CrossmintWalletManager(crossmintConfig() as any);
      const result = await manager.createWallet({
        email: 'creator@arcanea.ai',
        chain: 'solana',
      });
      expect(manager.getWalletAddress(result.userId, 'solana')).toBe(
        result.walletAddress,
      );
    });
  });
});

// =============================================================================
// Module 2: PaymentProcessor
// =============================================================================

describe('PaymentProcessor', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess({
      orderId: 'order_001',
      checkoutUrl: 'https://checkout.crossmint.com/session/abc',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // Config validation
  // ---------------------------------------------------------------------------

  describe('config validation', () => {
    it('throws PaymentError when apiKey is missing', () => {
      expect(
        () => new PaymentProcessor(paymentConfig({ apiKey: '' }) as any),
      ).toThrow(PaymentError);
    });

    it('throws PaymentError when projectId is missing', () => {
      expect(
        () => new PaymentProcessor(paymentConfig({ projectId: '' }) as any),
      ).toThrow(PaymentError);
    });

    it('throws PaymentError when webhookSecret is missing', () => {
      expect(
        () => new PaymentProcessor(paymentConfig({ webhookSecret: '' }) as any),
      ).toThrow(PaymentError);
    });
  });

  // ---------------------------------------------------------------------------
  // calculatePrice
  // ---------------------------------------------------------------------------

  describe('calculatePrice', () => {
    it('calculates card fees correctly (2.9% + $0.30 + 3% service)', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      // $10.00 = 1000 cents
      const breakdown = pp.calculatePrice(1000, 'card');

      // Service fee: ceil(1000 * 300 / 10000) = ceil(30) = 30
      expect(breakdown.serviceFeeCents).toBe(30);
      // Processing fee: ceil(1000 * 290 / 10000) + 30 = ceil(29) + 30 = 29 + 30 = 59
      expect(breakdown.processingFeeCents).toBe(59);
      // Total: 1000 + 30 + 59 = 1089
      expect(breakdown.totalCents).toBe(1089);
      expect(breakdown.nftPriceCents).toBe(1000);
    });

    it('calculates apple_pay fees (2.5% no fixed fee + 3% service)', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const breakdown = pp.calculatePrice(1000, 'apple_pay');

      // Service fee: ceil(1000 * 300 / 10000) = 30
      expect(breakdown.serviceFeeCents).toBe(30);
      // Processing: ceil(1000 * 250 / 10000) = ceil(25) = 25 (no fixed fee)
      expect(breakdown.processingFeeCents).toBe(25);
      expect(breakdown.totalCents).toBe(1055);
    });

    it('calculates google_pay fees same as apple_pay', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const breakdown = pp.calculatePrice(1000, 'google_pay');

      // Same as apple_pay: 250bps, no fixed fee
      expect(breakdown.processingFeeCents).toBe(25);
      expect(breakdown.totalCents).toBe(1055);
    });

    it('throws PRICE_TOO_LOW when price is below $1.00', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      expect(() => pp.calculatePrice(99, 'card')).toThrow(PaymentError);
      expect(() => pp.calculatePrice(99, 'card')).toThrow('at least $1.00');
    });

    it('throws PRICE_TOO_HIGH when price exceeds $100,000', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      expect(() => pp.calculatePrice(10_000_001, 'card')).toThrow(PaymentError);
      expect(() => pp.calculatePrice(10_000_001, 'card')).toThrow('cannot exceed');
    });

    it('accepts exact minimum price ($1.00)', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const breakdown = pp.calculatePrice(100, 'card');
      expect(breakdown.nftPriceCents).toBe(100);
    });

    it('accepts exact maximum price ($100,000)', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const breakdown = pp.calculatePrice(10_000_000, 'card');
      expect(breakdown.nftPriceCents).toBe(10_000_000);
    });
  });

  // ---------------------------------------------------------------------------
  // createCheckout
  // ---------------------------------------------------------------------------

  describe('createCheckout', () => {
    it('creates a checkout session successfully', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const result = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 2500,
      });

      expect(result.sessionId).toBeDefined();
      expect(result.checkoutUrl).toBeDefined();
      expect(result.totalAmountCents).toBeGreaterThan(2500);
      expect(result.breakdown.nftPriceCents).toBe(2500);
    });

    it('throws when userId is missing', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.createCheckout({
          userId: '',
          nftId: 'nft_001',
          paymentMethod: 'card',
          priceUsdCents: 2500,
        }),
      ).rejects.toThrow('User ID is required');
    });

    it('throws when nftId is missing', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.createCheckout({
          userId: 'user_001',
          nftId: '',
          paymentMethod: 'card',
          priceUsdCents: 2500,
        }),
      ).rejects.toThrow('NFT ID is required');
    });

    it('throws when price is too low', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.createCheckout({
          userId: 'user_001',
          nftId: 'nft_001',
          paymentMethod: 'card',
          priceUsdCents: 50,
        }),
      ).rejects.toThrow('at least $1.00');
    });

    it('throws when price is too high', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.createCheckout({
          userId: 'user_001',
          nftId: 'nft_001',
          paymentMethod: 'card',
          priceUsdCents: 99_999_999,
        }),
      ).rejects.toThrow('cannot exceed');
    });
  });

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  describe('session management', () => {
    it('getSession returns undefined for nonexistent session', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      expect(pp.getSession('nonexistent')).toBeUndefined();
    });

    it('getSession returns session after createCheckout', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const result = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      const session = pp.getSession(result.sessionId);
      expect(session).toBeDefined();
      expect(session!.userId).toBe('user_001');
      expect(session!.status).toBe('pending');
    });

    it('getSessionOrThrow throws for missing session', () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      expect(() => pp.getSessionOrThrow('nonexistent')).toThrow(PaymentError);
      expect(() => pp.getSessionOrThrow('nonexistent')).toThrow('not found');
    });

    it('getSessionsForUser filters by userId', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await pp.createCheckout({
        userId: 'user_A',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });
      await pp.createCheckout({
        userId: 'user_B',
        nftId: 'nft_002',
        paymentMethod: 'card',
        priceUsdCents: 2000,
      });
      await pp.createCheckout({
        userId: 'user_A',
        nftId: 'nft_003',
        paymentMethod: 'apple_pay',
        priceUsdCents: 3000,
      });

      const userASessions = pp.getSessionsForUser('user_A');
      expect(userASessions).toHaveLength(2);
      expect(userASessions.every((s) => s.userId === 'user_A')).toBe(true);

      const userBSessions = pp.getSessionsForUser('user_B');
      expect(userBSessions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // expireStaleSessions
  // ---------------------------------------------------------------------------

  describe('expireStaleSessions', () => {
    it('expires pending sessions older than 30 minutes', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);

      // Create a session
      const result = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      // Manually set createdAt to 31 minutes ago
      const session = pp.getSession(result.sessionId)!;
      session.createdAt = new Date(Date.now() - 31 * 60 * 1000);

      const expired = pp.expireStaleSessions();
      expect(expired).toBe(1);
      expect(pp.getSession(result.sessionId)!.status).toBe('failed');
    });

    it('does not expire recent pending sessions', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      const expired = pp.expireStaleSessions();
      expect(expired).toBe(0);
    });

    it('does not expire completed sessions regardless of age', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const result = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      // Set to completed and old
      const session = pp.getSession(result.sessionId)!;
      session.status = 'completed';
      session.createdAt = new Date(Date.now() - 60 * 60 * 1000);

      const expired = pp.expireStaleSessions();
      expect(expired).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // handleWebhook
  // ---------------------------------------------------------------------------

  describe('handleWebhook', () => {
    function webhookPayload(
      type: string,
      sessionId: string,
      overrides: Record<string, unknown> = {},
    ) {
      return JSON.stringify({
        type,
        data: {
          sessionId,
          userId: 'user_001',
          nftId: 'nft_001',
          amount: 1000,
          currency: 'usd',
          ...overrides,
        },
      });
    }

    it('rejects invalid signature (too short)', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.handleWebhook('{}', 'tooshort'),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('rejects invalid signature (non-hex chars)', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.handleWebhook('{}', 'g'.repeat(64)),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('rejects empty signature', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.handleWebhook('{}', ''),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('rejects invalid JSON payload', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      await expect(
        pp.handleWebhook('not json at all', VALID_SIGNATURE),
      ).rejects.toThrow('Invalid webhook payload');
    });

    it('returns processed=false for unknown event type', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const result = await pp.handleWebhook(
        JSON.stringify({ type: 'some.unknown.event', data: {} }),
        VALID_SIGNATURE,
      );

      expect(result.processed).toBe(false);
    });

    it('processes payment.completed event and updates session status', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);

      // Create a session first
      const checkout = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      const payload = webhookPayload('payment.completed', checkout.sessionId, {
        txHash: 'tx_completed_hash',
      });

      const result = await pp.handleWebhook(payload, VALID_SIGNATURE);

      expect(result.processed).toBe(true);
      expect(result.sessionId).toBe(checkout.sessionId);

      const session = pp.getSession(checkout.sessionId)!;
      expect(session.status).toBe('completed');
      expect(session.mintTxHash).toBe('tx_completed_hash');
    });

    it('dispatches event to registered handlers', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const handler = vi.fn();
      pp.onPaymentEvent(handler);

      const checkout = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      const payload = webhookPayload('payment.completed', checkout.sessionId);
      await pp.handleWebhook(payload, VALID_SIGNATURE);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment.completed',
          sessionId: checkout.sessionId,
        }),
      );
    });

    it('supports async webhook handlers', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      let handlerResolved = false;

      pp.onPaymentEvent(async () => {
        await new Promise((r) => setTimeout(r, 10));
        handlerResolved = true;
      });

      const checkout = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      const payload = webhookPayload('payment.completed', checkout.sessionId);
      await pp.handleWebhook(payload, VALID_SIGNATURE);

      expect(handlerResolved).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // onPaymentEvent subscription
  // ---------------------------------------------------------------------------

  describe('onPaymentEvent', () => {
    it('returns an unsubscribe function', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const handler = vi.fn();
      const unsubscribe = pp.onPaymentEvent(handler);

      const checkout = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      // Unsubscribe before webhook fires
      unsubscribe();

      const payload = JSON.stringify({
        type: 'payment.completed',
        data: {
          sessionId: checkout.sessionId,
          userId: 'user_001',
          nftId: 'nft_001',
          amount: 1000,
          currency: 'usd',
        },
      });
      await pp.handleWebhook(payload, VALID_SIGNATURE);

      expect(handler).not.toHaveBeenCalled();
    });

    it('supports multiple concurrent handlers', async () => {
      const pp = new PaymentProcessor(paymentConfig() as any);
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      pp.onPaymentEvent(handler1);
      pp.onPaymentEvent(handler2);

      const checkout = await pp.createCheckout({
        userId: 'user_001',
        nftId: 'nft_001',
        paymentMethod: 'card',
        priceUsdCents: 1000,
      });

      const payload = JSON.stringify({
        type: 'payment.completed',
        data: {
          sessionId: checkout.sessionId,
          userId: 'user_001',
          nftId: 'nft_001',
          amount: 1000,
          currency: 'usd',
        },
      });
      await pp.handleWebhook(payload, VALID_SIGNATURE);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// Module 3: MintPipeline
// =============================================================================

describe('MintPipeline', () => {
  // ---------------------------------------------------------------------------
  // mintAndDeliver — validation
  // ---------------------------------------------------------------------------

  describe('mintAndDeliver validation', () => {
    it('throws MISSING_SESSION_ID when sessionId is empty', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await expect(
        pipeline.mintAndDeliver(mintRequest({ sessionId: '' })),
      ).rejects.toThrow('Session ID is required');
    });

    it('throws MISSING_USER_ID when userId is empty', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await expect(
        pipeline.mintAndDeliver(mintRequest({ userId: '' })),
      ).rejects.toThrow('User ID is required');
    });

    it('throws MISSING_WALLET_ADDRESS when walletAddress is empty', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await expect(
        pipeline.mintAndDeliver(mintRequest({ walletAddress: '' })),
      ).rejects.toThrow('Wallet address is required');
    });

    it('throws MISSING_METADATA_URI when metadataUri is empty', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await expect(
        pipeline.mintAndDeliver(mintRequest({ metadataUri: '' })),
      ).rejects.toThrow('Metadata URI is required');
    });

    it('throws MISSING_COLLECTION_ADDRESS when collectionAddress is empty', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await expect(
        pipeline.mintAndDeliver(mintRequest({ collectionAddress: '' })),
      ).rejects.toThrow('Collection address is required');
    });
  });

  // ---------------------------------------------------------------------------
  // mintAndDeliver — chain routing
  // ---------------------------------------------------------------------------

  describe('mintAndDeliver chain routing', () => {
    it('routes to solana handler for solana chain', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest({ chain: 'solana' }));

      expect(solanaHandler.mint).toHaveBeenCalledTimes(1);
      expect(baseHandler.mint).not.toHaveBeenCalled();
    });

    it('routes to base handler for base chain', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(
        mintRequest({
          chain: 'base',
          walletAddress: '0xBaseWallet0000000000000000000000000000',
        }),
      );

      expect(baseHandler.mint).toHaveBeenCalledTimes(1);
      expect(solanaHandler.mint).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // mintAndDeliver — success
  // ---------------------------------------------------------------------------

  describe('mintAndDeliver success', () => {
    it('returns successful result with txHash', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const result = await pipeline.mintAndDeliver(mintRequest());

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('sol_tx_abc123');
      expect(result.walletAddress).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // mintAndDeliver — idempotency
  // ---------------------------------------------------------------------------

  describe('mintAndDeliver idempotency', () => {
    it('returns cached result for duplicate sessionId+nftId', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const req = mintRequest();
      const first = await pipeline.mintAndDeliver(req);
      const second = await pipeline.mintAndDeliver(req);

      expect(second).toEqual(first);
      // Handler should only be called once
      expect(solanaHandler.mint).toHaveBeenCalledTimes(1);
    });

    it('allows re-mint after idempotency record expires', async () => {
      vi.useFakeTimers();
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const req = mintRequest();
      await pipeline.mintAndDeliver(req);

      // Advance time past 24h TTL
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      await pipeline.mintAndDeliver(req);

      // Handler should be called twice (once per non-cached attempt)
      expect(solanaHandler.mint).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('does NOT store idempotency record for failed mint', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        walletAddress: 'addr',
        error: 'Permanent failure',
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest());

      expect(pipeline.getIdempotencyRecordCount()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // handlePaymentEvent
  // ---------------------------------------------------------------------------

  describe('handlePaymentEvent', () => {
    it('processes payment.completed events', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const event: PaymentWebhookEvent = {
        type: 'payment.completed',
        sessionId: 'sess_webhook_001',
        timestamp: new Date(),
        data: {
          userId: 'user_001',
          nftId: 'nft_webhook_001',
          amount: 2500,
          currency: 'usd',
        },
      };

      const result = await pipeline.handlePaymentEvent(event, {
        walletAddress: 'SolWallet111111111111111111111111111111111',
        chain: 'solana',
        metadataUri: 'https://arweave.net/metadata.json',
        collectionAddress: 'Col1ection1111111111111111111111111111111',
      });

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
    });

    it('returns null for payment.pending events', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const event: PaymentWebhookEvent = {
        type: 'payment.pending',
        sessionId: 'sess_001',
        timestamp: new Date(),
        data: {
          userId: 'user_001',
          nftId: 'nft_001',
          amount: 1000,
          currency: 'usd',
        },
      };

      const result = await pipeline.handlePaymentEvent(event, {
        walletAddress: 'addr',
        chain: 'solana',
        metadataUri: 'https://arweave.net/meta.json',
        collectionAddress: 'col_addr',
      });

      expect(result).toBeNull();
    });

    it('returns null for payment.failed events', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const event: PaymentWebhookEvent = {
        type: 'payment.failed',
        sessionId: 'sess_001',
        timestamp: new Date(),
        data: {
          userId: 'user_001',
          nftId: 'nft_001',
          amount: 1000,
          currency: 'usd',
          failureReason: 'Card declined',
        },
      };

      const result = await pipeline.handlePaymentEvent(event, {
        walletAddress: 'addr',
        chain: 'solana',
        metadataUri: 'https://arweave.net/meta.json',
        collectionAddress: 'col_addr',
      });

      expect(result).toBeNull();
    });

    it('returns null for payment.refunded events', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const event: PaymentWebhookEvent = {
        type: 'payment.refunded',
        sessionId: 'sess_001',
        timestamp: new Date(),
        data: {
          userId: 'user_001',
          nftId: 'nft_001',
          amount: 1000,
          currency: 'usd',
        },
      };

      const result = await pipeline.handlePaymentEvent(event, {
        walletAddress: 'addr',
        chain: 'solana',
        metadataUri: 'https://arweave.net/meta.json',
        collectionAddress: 'col_addr',
      });

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // batchMint
  // ---------------------------------------------------------------------------

  describe('batchMint', () => {
    it('returns zero counts for empty items', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const result = await pipeline.batchMint({
        collectionAddress: 'col_addr',
        chain: 'solana',
        items: [],
      });

      expect(result.totalRequested).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('returns correct counts for successful batch', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const result = await pipeline.batchMint({
        collectionAddress: 'col_addr',
        chain: 'solana',
        items: [
          {
            userId: 'u1',
            walletAddress: 'w1_valid_address_padding_here_1111111111',
            metadataUri: 'https://arweave.net/1.json',
            sessionId: 'batch_sess_1',
          },
          {
            userId: 'u2',
            walletAddress: 'w2_valid_address_padding_here_2222222222',
            metadataUri: 'https://arweave.net/2.json',
            sessionId: 'batch_sess_2',
          },
          {
            userId: 'u3',
            walletAddress: 'w3_valid_address_padding_here_3333333333',
            metadataUri: 'https://arweave.net/3.json',
            sessionId: 'batch_sess_3',
          },
        ],
      });

      expect(result.totalRequested).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
    });

    it('counts partial failures correctly', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      let callNum = 0;
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callNum++;
        if (callNum === 2) {
          return Promise.resolve({
            success: false,
            walletAddress: 'w2',
            error: 'Insufficient funds',
          });
        }
        return Promise.resolve({
          success: true,
          txHash: `tx_${callNum}`,
          walletAddress: `w${callNum}`,
        });
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const result = await pipeline.batchMint({
        collectionAddress: 'col_addr',
        chain: 'solana',
        items: [
          {
            userId: 'u1',
            walletAddress: 'w1_valid_address_1',
            metadataUri: 'https://arweave.net/1.json',
            sessionId: 'batch_partial_1',
          },
          {
            userId: 'u2',
            walletAddress: 'w2_valid_address_2',
            metadataUri: 'https://arweave.net/2.json',
            sessionId: 'batch_partial_2',
          },
          {
            userId: 'u3',
            walletAddress: 'w3_valid_address_3',
            metadataUri: 'https://arweave.net/3.json',
            sessionId: 'batch_partial_3',
          },
        ],
      });

      expect(result.totalRequested).toBe(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Retry logic
  // ---------------------------------------------------------------------------

  describe('retry logic', () => {
    it('does not retry non-retryable errors', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        walletAddress: 'addr',
        error: 'Invalid metadata: missing name field',
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 3,
      });

      const result = await pipeline.mintAndDeliver(mintRequest());

      expect(result.success).toBe(false);
      // Should only be called once (no retry for non-retryable)
      expect(solanaHandler.mint).toHaveBeenCalledTimes(1);
    });

    it('does not retry non-retryable thrown errors', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Invalid account data'),
      );

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 3,
      });

      const result = await pipeline.mintAndDeliver(mintRequest());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid account data');
      expect(solanaHandler.mint).toHaveBeenCalledTimes(1);
    });

    it('retries on timeout error messages', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      let callCount = 0;
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: false,
            walletAddress: 'addr',
            error: 'Request timeout after 30000ms',
          });
        }
        return Promise.resolve({
          success: true,
          txHash: 'tx_success',
          walletAddress: 'addr',
        });
      });

      // Use maxRetries: 2 and mock sleep to avoid actual delays
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 2,
      });

      // Mock the private sleep method to resolve immediately
      (pipeline as any).sleep = () => Promise.resolve();

      const result = await pipeline.mintAndDeliver(mintRequest());

      expect(result.success).toBe(true);
      expect(solanaHandler.mint).toHaveBeenCalledTimes(2);
    });

    it('retries on network errors', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      let callCount = 0;
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network error: ECONNRESET'));
        }
        return Promise.resolve({
          success: true,
          txHash: 'tx_recovered',
          walletAddress: 'addr',
        });
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 2,
      });
      (pipeline as any).sleep = () => Promise.resolve();

      const result = await pipeline.mintAndDeliver(mintRequest());

      expect(result.success).toBe(true);
      expect(solanaHandler.mint).toHaveBeenCalledTimes(2);
    });

    it('retries on 429 rate limit errors', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      let callCount = 0;
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: false,
            walletAddress: 'addr',
            error: 'HTTP 429: Too Many Requests',
          });
        }
        return Promise.resolve({
          success: true,
          txHash: 'tx_after_ratelimit',
          walletAddress: 'addr',
        });
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 2,
      });
      (pipeline as any).sleep = () => Promise.resolve();

      const result = await pipeline.mintAndDeliver(mintRequest());

      expect(result.success).toBe(true);
      expect(solanaHandler.mint).toHaveBeenCalledTimes(2);
    });

    it('exhausts all retries and returns failure', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        walletAddress: 'addr',
        error: 'Network timeout',
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 3,
      });
      (pipeline as any).sleep = () => Promise.resolve();

      const result = await pipeline.mintAndDeliver(mintRequest());

      expect(result.success).toBe(false);
      expect(result.error).toContain('3 attempts');
      expect(solanaHandler.mint).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  describe('audit log', () => {
    it('records mint_started on first attempt', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest());

      const log = pipeline.getAuditLog();
      expect(log.some((e) => e.action === 'mint_started')).toBe(true);
    });

    it('records mint_succeeded after successful mint', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest());

      const log = pipeline.getAuditLog();
      const success = log.find((e) => e.action === 'mint_succeeded');
      expect(success).toBeDefined();
      expect(success!.txHash).toBe('sol_tx_abc123');
    });

    it('records mint_failed on non-retryable failure', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        walletAddress: 'addr',
        error: 'Permanent: invalid account',
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest());

      const log = pipeline.getAuditLog();
      expect(log.some((e) => e.action === 'mint_failed')).toBe(true);
    });

    it('records mint_retried on retry attempts', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      let callCount = 0;
      (solanaHandler.mint as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: false,
            walletAddress: 'addr',
            error: 'timeout',
          });
        }
        return Promise.resolve({
          success: true,
          txHash: 'tx_retry_success',
          walletAddress: 'addr',
        });
      });

      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 2,
      });
      (pipeline as any).sleep = () => Promise.resolve();

      await pipeline.mintAndDeliver(mintRequest());

      const log = pipeline.getAuditLog();
      expect(log.some((e) => e.action === 'mint_retried')).toBe(true);
    });

    it('records idempotent_skip on duplicate mint', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const req = mintRequest();
      await pipeline.mintAndDeliver(req);
      await pipeline.mintAndDeliver(req);

      const log = pipeline.getAuditLog();
      expect(log.some((e) => e.action === 'idempotent_skip')).toBe(true);
    });

    it('invokes onAuditLog callback', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const onAuditLog = vi.fn();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
        onAuditLog,
      });

      await pipeline.mintAndDeliver(mintRequest());

      expect(onAuditLog).toHaveBeenCalled();
      expect(onAuditLog.mock.calls[0][0]).toHaveProperty('action', 'mint_started');
    });
  });

  // ---------------------------------------------------------------------------
  // getAuditLogForSession
  // ---------------------------------------------------------------------------

  describe('getAuditLogForSession', () => {
    it('filters audit log entries by session ID', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest({ sessionId: 'sess_A', nftId: 'nft_A' }));
      await pipeline.mintAndDeliver(mintRequest({ sessionId: 'sess_B', nftId: 'nft_B' }));

      const sessALog = pipeline.getAuditLogForSession('sess_A');
      const sessBLog = pipeline.getAuditLogForSession('sess_B');

      expect(sessALog.every((e) => e.sessionId === 'sess_A')).toBe(true);
      expect(sessBLog.every((e) => e.sessionId === 'sess_B')).toBe(true);
      expect(sessALog.length).toBeGreaterThan(0);
      expect(sessBLog.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown session', () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
      });

      expect(pipeline.getAuditLogForSession('nonexistent')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // cleanupIdempotencyRecords
  // ---------------------------------------------------------------------------

  describe('cleanupIdempotencyRecords', () => {
    it('removes expired records', async () => {
      vi.useFakeTimers();
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest({ sessionId: 'old_sess', nftId: 'old_nft' }));
      expect(pipeline.getIdempotencyRecordCount()).toBe(1);

      // Advance past 24h TTL
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      const cleaned = pipeline.cleanupIdempotencyRecords();
      expect(cleaned).toBe(1);
      expect(pipeline.getIdempotencyRecordCount()).toBe(0);

      vi.useRealTimers();
    });

    it('does not remove non-expired records', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest());

      const cleaned = pipeline.cleanupIdempotencyRecords();
      expect(cleaned).toBe(0);
      expect(pipeline.getIdempotencyRecordCount()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getIdempotencyRecordCount
  // ---------------------------------------------------------------------------

  describe('getIdempotencyRecordCount', () => {
    it('returns 0 when no mints have occurred', () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
      });

      expect(pipeline.getIdempotencyRecordCount()).toBe(0);
    });

    it('increments after successful mints', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      await pipeline.mintAndDeliver(mintRequest({ sessionId: 'a', nftId: 'x' }));
      expect(pipeline.getIdempotencyRecordCount()).toBe(1);

      await pipeline.mintAndDeliver(mintRequest({ sessionId: 'b', nftId: 'y' }));
      expect(pipeline.getIdempotencyRecordCount()).toBe(2);
    });

    it('does not increment for idempotent duplicates', async () => {
      const { solanaHandler, baseHandler } = createMockHandlers();
      const pipeline = new MintPipeline({
        solanaMintHandler: solanaHandler,
        baseMintHandler: baseHandler,
        maxRetries: 1,
      });

      const req = mintRequest();
      await pipeline.mintAndDeliver(req);
      await pipeline.mintAndDeliver(req);

      expect(pipeline.getIdempotencyRecordCount()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // MintPipelineError
  // ---------------------------------------------------------------------------

  describe('MintPipelineError', () => {
    it('has correct name, code, and retryable properties', () => {
      const err = new MintPipelineError('test error', 'TEST_CODE', true);
      expect(err.name).toBe('MintPipelineError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.retryable).toBe(true);
      expect(err.message).toBe('test error');
    });

    it('defaults retryable to false', () => {
      const err = new MintPipelineError('test', 'CODE');
      expect(err.retryable).toBe(false);
    });
  });
});
