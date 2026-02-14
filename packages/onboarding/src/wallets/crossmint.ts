/**
 * @arcanea/onboarding — Crossmint Wallet Integration
 *
 * Manages custodial wallet creation and lifecycle through the
 * Crossmint API. Enables non-crypto-native creators to own NFTs
 * with just an email address.
 *
 * Flow:
 * 1. Creator signs up with email
 * 2. Crossmint creates a custodial wallet (no seed phrase needed)
 * 3. Creator can later export to self-custody (Phantom / MetaMask)
 *
 * Philosophy: Zero friction. A creator should go from inspiration
 * to on-chain ownership in under 60 seconds.
 */

import type {
  Chain,
  CreateWalletParams,
  CreateWalletResult,
  ExportWalletParams,
  ExportWalletResult,
  OnboardingUser,
  RecoverWalletParams,
  RecoverWalletResult,
} from '../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CrossmintConfig {
  /** Crossmint API key (server-side). */
  apiKey: string;
  /** Crossmint project ID. */
  projectId: string;
  /** API base URL. Override for testing. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://www.crossmint.com/api/v1-alpha2';
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CrossmintError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'CrossmintError';
  }
}

// ---------------------------------------------------------------------------
// Crossmint Wallet Manager
// ---------------------------------------------------------------------------

export class CrossmintWalletManager {
  private config: Required<CrossmintConfig>;
  private users = new Map<string, OnboardingUser>();
  private walletsByEmail = new Map<string, string>(); // email -> userId

  constructor(config: CrossmintConfig) {
    this.config = {
      apiKey: config.apiKey,
      projectId: config.projectId,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    this.validateConfig();
  }

  // -------------------------------------------------------------------------
  // Wallet creation
  // -------------------------------------------------------------------------

  /**
   * Create a custodial wallet for a new user via email.
   * If the email already has a wallet, returns the existing one.
   */
  async createWallet(params: CreateWalletParams): Promise<CreateWalletResult> {
    this.validateEmail(params.email);

    // Check for existing wallet
    const existingUserId = this.walletsByEmail.get(params.email);
    if (existingUserId) {
      const existingUser = this.users.get(existingUserId);
      if (existingUser?.walletAddress) {
        return {
          userId: existingUserId,
          walletAddress: existingUser.walletAddress,
          chain: existingUser.chain ?? this.resolveChainString(params.chain),
          custodial: true,
          crossmintWalletId: `cmw_${existingUserId}`,
        };
      }
    }

    // Create wallet via Crossmint API
    const chain = this.resolveChainString(params.chain);
    const response = await this.apiRequest<{
      id: string;
      address: string;
      chain: string;
    }>('/wallets', 'POST', {
      type: 'custodial',
      email: params.email,
      chain,
      linkedUser: params.displayName
        ? `email:${params.email}:${params.displayName}`
        : `email:${params.email}`,
    });

    // Store user record
    const userId = response.id;
    const user: OnboardingUser = {
      id: userId,
      email: params.email,
      walletAddress: response.address,
      chain: response.chain,
      provider: 'crossmint',
      custodial: true,
      kycVerified: false,
      createdAt: new Date(),
    };

    this.users.set(userId, user);
    this.walletsByEmail.set(params.email, userId);

    return {
      userId,
      walletAddress: response.address,
      chain: response.chain,
      custodial: true,
      crossmintWalletId: `cmw_${userId}`,
    };
  }

  /**
   * Create wallets on both Solana and Base for a user.
   * Returns both wallet addresses.
   */
  async createMultiChainWallet(
    email: string,
    displayName?: string,
  ): Promise<{ solana: CreateWalletResult; base: CreateWalletResult }> {
    const [solana, base] = await Promise.all([
      this.createWallet({ email, chain: 'solana', displayName }),
      this.createWallet({ email, chain: 'base', displayName }),
    ]);

    return { solana, base };
  }

  // -------------------------------------------------------------------------
  // Wallet recovery
  // -------------------------------------------------------------------------

  /**
   * Recover wallet access by email + verification code.
   * Crossmint sends a verification email; the user provides the code.
   */
  async recoverWallet(params: RecoverWalletParams): Promise<RecoverWalletResult> {
    this.validateEmail(params.email);

    if (!params.verificationCode?.trim()) {
      throw new CrossmintError(
        'Verification code is required',
        'MISSING_VERIFICATION_CODE',
      );
    }

    try {
      const response = await this.apiRequest<{
        userId: string;
        walletAddress: string;
        verified: boolean;
      }>('/wallets/recover', 'POST', {
        email: params.email,
        verificationCode: params.verificationCode,
      });

      if (!response.verified) {
        return {
          success: false,
          userId: '',
          walletAddress: '',
          error: 'Verification code is invalid or expired',
        };
      }

      return {
        success: true,
        userId: response.userId,
        walletAddress: response.walletAddress,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Recovery failed';
      return {
        success: false,
        userId: '',
        walletAddress: '',
        error: message,
      };
    }
  }

  /**
   * Request a recovery verification code to be sent to the user's email.
   */
  async requestRecoveryCode(email: string): Promise<{ sent: boolean }> {
    this.validateEmail(email);

    await this.apiRequest('/wallets/recover/request', 'POST', { email });

    return { sent: true };
  }

  // -------------------------------------------------------------------------
  // Export to self-custody
  // -------------------------------------------------------------------------

  /**
   * Export a custodial wallet to self-custody.
   * The user transitions from Crossmint-managed to Phantom (Solana)
   * or MetaMask (Base).
   */
  async exportToSelfCustody(
    params: ExportWalletParams,
  ): Promise<ExportWalletResult> {
    const user = this.users.get(params.userId);
    if (!user) {
      throw new CrossmintError(
        `User '${params.userId}' not found`,
        'USER_NOT_FOUND',
      );
    }

    if (!user.custodial) {
      throw new CrossmintError(
        'User wallet is already self-custody',
        'ALREADY_SELF_CUSTODY',
      );
    }

    // Validate provider-chain compatibility
    if (params.targetProvider === 'phantom' && params.chain !== 'solana') {
      throw new CrossmintError(
        'Phantom only supports Solana',
        'PROVIDER_CHAIN_MISMATCH',
      );
    }
    if (params.targetProvider === 'metamask' && params.chain !== 'base') {
      throw new CrossmintError(
        'MetaMask export is for Base (EVM) chain only',
        'PROVIDER_CHAIN_MISMATCH',
      );
    }

    try {
      const response = await this.apiRequest<{
        exportUrl: string;
        walletAddress: string;
      }>(`/wallets/${params.userId}/export`, 'POST', {
        targetProvider: params.targetProvider,
        chain: params.chain,
      });

      // Update user record
      user.custodial = false;
      user.provider = params.targetProvider;

      const instructions =
        params.targetProvider === 'phantom'
          ? `Open Phantom wallet and import your wallet using the export link. Your NFTs will appear automatically on Solana.`
          : `Open MetaMask and add the Base network if not already configured. Import your wallet using the export link.`;

      return {
        success: true,
        walletAddress: response.walletAddress,
        chain: params.chain,
        targetProvider: params.targetProvider,
        instructions,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Export failed';
      return {
        success: false,
        walletAddress: user.walletAddress ?? '',
        chain: params.chain,
        targetProvider: params.targetProvider,
        instructions: '',
        error: message,
      };
    }
  }

  // -------------------------------------------------------------------------
  // User queries
  // -------------------------------------------------------------------------

  /** Get a user by ID. */
  getUser(userId: string): OnboardingUser | undefined {
    return this.users.get(userId);
  }

  /** Get a user by email. */
  getUserByEmail(email: string): OnboardingUser | undefined {
    const userId = this.walletsByEmail.get(email);
    return userId ? this.users.get(userId) : undefined;
  }

  /** Get the wallet address for a user on a specific chain. */
  getWalletAddress(userId: string, chain?: string): string | undefined {
    const user = this.users.get(userId);
    if (!user) return undefined;
    if (chain && user.chain !== chain) return undefined;
    return user.walletAddress;
  }

  // -------------------------------------------------------------------------
  // Internal: API client
  // -------------------------------------------------------------------------

  /**
   * Make a request to the Crossmint API.
   * In production, this wraps fetch with auth headers and error handling.
   */
  private async apiRequest<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.config.apiKey,
          'X-PROJECT-ID': this.config.projectId,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new CrossmintError(
          `Crossmint API error: ${response.status} ${errorBody}`,
          'API_ERROR',
          response.status,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof CrossmintError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new CrossmintError(
          `Request timeout after ${this.config.timeoutMs}ms`,
          'TIMEOUT',
        );
      }

      throw new CrossmintError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  // -------------------------------------------------------------------------
  // Internal: validation
  // -------------------------------------------------------------------------

  private validateConfig(): void {
    if (!this.config.apiKey?.trim()) {
      throw new CrossmintError(
        'Crossmint API key is required',
        'MISSING_API_KEY',
      );
    }
    if (!this.config.projectId?.trim()) {
      throw new CrossmintError(
        'Crossmint project ID is required',
        'MISSING_PROJECT_ID',
      );
    }
  }

  private validateEmail(email: string): void {
    if (!email?.trim()) {
      throw new CrossmintError('Email is required', 'MISSING_EMAIL');
    }
    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new CrossmintError(
        `Invalid email format: ${email}`,
        'INVALID_EMAIL',
      );
    }
  }

  private resolveChainString(chain: Chain): string {
    switch (chain) {
      case 'solana':
        return 'solana';
      case 'base':
        return 'base';
      case 'both':
        return 'solana'; // Default to Solana for single-chain operations
    }
  }
}
