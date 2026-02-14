import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateAndList,
  purchaseAndDeliver,
  collectionDrop,
  type GeneratedNFT,
  type GuardianCuration,
  type ListingResult,
  type PurchaseResult,
  type GenerateAndListParams,
  type PurchaseAndDeliverParams,
  type CollectionDropParams,
} from '../src/integration/workflows';

// --- Mock Data Factories ---

function mockNFT(overrides: Partial<GeneratedNFT> = {}): GeneratedNFT {
  return {
    metadata: {
      name: 'Fire Guardian #001',
      description: 'A legendary Fire Guardian NFT',
      image: 'ipfs://Qm...',
      attributes: [
        { trait_type: 'Element', value: 'Fire' },
        { trait_type: 'Tier', value: 'legendary' },
      ],
    },
    imageUri: 'ipfs://QmImage',
    metadataUri: 'ipfs://QmMeta',
    tier: 'legendary',
    element: 'Fire',
    guardianName: 'Draconia',
    canonScore: 92,
    ...overrides,
  };
}

function mockCuration(overrides: Partial<GuardianCuration> = {}): GuardianCuration {
  return {
    guardianName: 'Draconia',
    approved: true,
    suggestedPrice: BigInt(5_000_000_000),
    auctionType: 'english',
    auctionDuration: 86400,
    curationNotes: 'Excellent elemental alignment',
    confidence: 0.95,
    ...overrides,
  };
}

function mockListing(overrides: Partial<ListingResult> = {}): ListingResult {
  return {
    listingId: 'listing_001',
    chain: 'solana',
    price: BigInt(5_000_000_000),
    currency: 'SOL',
    auctionType: 'english',
    startTime: new Date('2026-03-01'),
    endTime: new Date('2026-03-02'),
    ...overrides,
  };
}

function mockPurchaseResult(overrides: Partial<PurchaseResult> = {}): PurchaseResult {
  return {
    success: true,
    sessionId: 'session_001',
    buyerWallet: '0xBuyer123',
    txHash: '0xTx456',
    tokenId: 'token_789',
    ...overrides,
  };
}

// --- Default Params ---

const defaultGenerateAndListParams: GenerateAndListParams = {
  creatorId: 'creator_001',
  element: 'Fire',
  tier: 'legendary',
  curatingGuardian: 'Draconia',
  chain: 'solana',
};

const defaultPurchaseParams: PurchaseAndDeliverParams = {
  buyerEmail: 'buyer@arcanea.ai',
  listingId: 'listing_001',
  chain: 'solana',
  paymentMethod: 'card',
  metadataUri: 'ipfs://QmMeta',
  collectionAddress: 'CollectionPubkey123',
  priceCents: 9999,
};

const defaultCollectionDropParams: CollectionDropParams = {
  collectionName: 'Guardians of Fire',
  element: 'Fire',
  tier: 'epic',
  count: 10,
  curatingGuardian: 'Draconia',
  chain: 'solana',
};

// ==========================================================================
// generateAndList
// ==========================================================================

describe('generateAndList', () => {
  let deps: {
    generateNFT: ReturnType<typeof vi.fn>;
    curateWithGuardian: ReturnType<typeof vi.fn>;
    registerIP: ReturnType<typeof vi.fn>;
    createListing: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    deps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT()),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      registerIP: vi.fn().mockResolvedValue({ assetId: 'ip_001', licenseId: 'lic_001' }),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };
  });

  it('should complete full success flow with all steps', async () => {
    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.status).toBe('completed');
    expect(result.name).toBe('generate_and_list');
    expect(result.steps).toHaveLength(4); // generate, canon, curation, listing (no IP)
    expect(result.steps.every(s => s.status === 'completed')).toBe(true);
  });

  it('should call generateNFT with correct element, tier, and prompt', async () => {
    const params = { ...defaultGenerateAndListParams, customPrompt: 'Blazing phoenix' };
    await generateAndList(params, deps);

    expect(deps.generateNFT).toHaveBeenCalledWith('Fire', 'legendary', 'Blazing phoenix');
  });

  it('should call curateWithGuardian with guardian name and generated NFT', async () => {
    await generateAndList(defaultGenerateAndListParams, deps);

    expect(deps.curateWithGuardian).toHaveBeenCalledWith('Draconia', expect.objectContaining({
      canonScore: 92,
      element: 'Fire',
    }));
  });

  it('should fail when generation throws an error', async () => {
    deps.generateNFT.mockRejectedValue(new Error('AI provider offline'));

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.status).toBe('failed');
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toBe('AI provider offline');
    expect(result.steps).toHaveLength(1);
    expect(deps.curateWithGuardian).not.toHaveBeenCalled();
  });

  it('should fail when canon score is below 60', async () => {
    deps.generateNFT.mockResolvedValue(mockNFT({ canonScore: 45 }));

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.status).toBe('failed');
    expect(result.steps[1].name).toBe('canon_check');
    expect(result.steps[1].status).toBe('failed');
    expect(result.steps[1].error).toContain('45');
    expect(result.steps[1].error).toContain('below minimum threshold');
    expect(deps.curateWithGuardian).not.toHaveBeenCalled();
  });

  it('should pass canon check with score exactly 60', async () => {
    deps.generateNFT.mockResolvedValue(mockNFT({ canonScore: 60 }));

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.status).toBe('completed');
    const canonStep = result.steps.find(s => s.name === 'canon_check');
    expect(canonStep?.status).toBe('completed');
  });

  it('should assign correct grade based on canon score', async () => {
    // Score >= 90 → S
    deps.generateNFT.mockResolvedValue(mockNFT({ canonScore: 95 }));
    let result = await generateAndList(defaultGenerateAndListParams, deps);
    let canonStep = result.steps.find(s => s.name === 'canon_check');
    expect((canonStep?.result as Record<string, unknown>)?.grade).toBe('S');

    // Score >= 80 < 90 → A
    deps.generateNFT.mockResolvedValue(mockNFT({ canonScore: 85 }));
    result = await generateAndList(defaultGenerateAndListParams, deps);
    canonStep = result.steps.find(s => s.name === 'canon_check');
    expect((canonStep?.result as Record<string, unknown>)?.grade).toBe('A');

    // Score >= 60 < 80 → B
    deps.generateNFT.mockResolvedValue(mockNFT({ canonScore: 70 }));
    result = await generateAndList(defaultGenerateAndListParams, deps);
    canonStep = result.steps.find(s => s.name === 'canon_check');
    expect((canonStep?.result as Record<string, unknown>)?.grade).toBe('B');
  });

  it('should fail when guardian rejects the NFT', async () => {
    deps.curateWithGuardian.mockResolvedValue(mockCuration({
      approved: false,
      curationNotes: 'Element alignment too weak',
    }));

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.status).toBe('failed');
    const curationStep = result.steps.find(s => s.name === 'guardian_curation');
    expect(curationStep?.error).toContain('declined');
    expect(curationStep?.error).toContain('Element alignment too weak');
    expect(deps.createListing).not.toHaveBeenCalled();
  });

  it('should fail when curation throws an error', async () => {
    deps.curateWithGuardian.mockRejectedValue(new Error('Guardian agent unreachable'));

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.status).toBe('failed');
    const curationStep = result.steps.find(s => s.name === 'guardian_curation');
    expect(curationStep?.status).toBe('failed');
    expect(curationStep?.error).toBe('Guardian agent unreachable');
  });

  it('should include IP registration step when registerIP is true', async () => {
    const params = { ...defaultGenerateAndListParams, registerIP: true };
    const result = await generateAndList(params, deps);

    expect(result.status).toBe('completed');
    const ipStep = result.steps.find(s => s.name === 'register_ip');
    expect(ipStep).toBeDefined();
    expect(ipStep?.status).toBe('completed');
    expect(deps.registerIP).toHaveBeenCalled();
  });

  it('should continue when IP registration fails (non-fatal)', async () => {
    deps.registerIP.mockRejectedValue(new Error('Story Protocol timeout'));
    const params = { ...defaultGenerateAndListParams, registerIP: true };

    const result = await generateAndList(params, deps);

    expect(result.status).toBe('completed');
    const ipStep = result.steps.find(s => s.name === 'register_ip');
    expect(ipStep?.status).toBe('failed');
    expect(ipStep?.error).toBe('Story Protocol timeout');
    // Listing should still succeed
    const listStep = result.steps.find(s => s.name === 'create_listing');
    expect(listStep?.status).toBe('completed');
  });

  it('should skip IP registration when registerIP is false', async () => {
    const result = await generateAndList(defaultGenerateAndListParams, deps);

    const ipStep = result.steps.find(s => s.name === 'register_ip');
    expect(ipStep).toBeUndefined();
    expect(deps.registerIP).not.toHaveBeenCalled();
  });

  it('should fail when listing creation throws an error', async () => {
    deps.createListing.mockRejectedValue(new Error('Marketplace contract paused'));

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.status).toBe('failed');
    const listStep = result.steps.find(s => s.name === 'create_listing');
    expect(listStep?.status).toBe('failed');
    expect(listStep?.error).toBe('Marketplace contract paused');
  });
});

// ==========================================================================
// purchaseAndDeliver
// ==========================================================================

describe('purchaseAndDeliver', () => {
  let deps: {
    ensureWallet: ReturnType<typeof vi.fn>;
    createCheckout: ReturnType<typeof vi.fn>;
    mintAndDeliver: ReturnType<typeof vi.fn>;
    recordRoyalty: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    deps = {
      ensureWallet: vi.fn().mockResolvedValue({ walletAddress: '0xWallet123', userId: 'user_001' }),
      createCheckout: vi.fn().mockResolvedValue({ sessionId: 'session_001', checkoutUrl: 'https://checkout.arcanea.ai/session_001' }),
      mintAndDeliver: vi.fn().mockResolvedValue(mockPurchaseResult()),
      recordRoyalty: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should complete full success flow with all steps', async () => {
    const result = await purchaseAndDeliver(defaultPurchaseParams, deps);

    expect(result.status).toBe('completed');
    expect(result.name).toBe('purchase_and_deliver');
    expect(result.steps).toHaveLength(4); // wallet, checkout, mint, royalty
    expect(deps.ensureWallet).toHaveBeenCalledWith('buyer@arcanea.ai', 'solana');
    expect(deps.createCheckout).toHaveBeenCalledWith('user_001', 'listing_001', 9999, 'card');
  });

  it('should fail when wallet creation fails', async () => {
    deps.ensureWallet.mockRejectedValue(new Error('Crossmint API error'));

    const result = await purchaseAndDeliver(defaultPurchaseParams, deps);

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].name).toBe('ensure_wallet');
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toBe('Crossmint API error');
    expect(deps.createCheckout).not.toHaveBeenCalled();
  });

  it('should fail when checkout creation fails', async () => {
    deps.createCheckout.mockRejectedValue(new Error('Payment provider unavailable'));

    const result = await purchaseAndDeliver(defaultPurchaseParams, deps);

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(2);
    const checkoutStep = result.steps.find(s => s.name === 'create_checkout');
    expect(checkoutStep?.status).toBe('failed');
    expect(checkoutStep?.error).toBe('Payment provider unavailable');
    expect(deps.mintAndDeliver).not.toHaveBeenCalled();
  });

  it('should fail when mint returns success: false', async () => {
    deps.mintAndDeliver.mockResolvedValue(mockPurchaseResult({
      success: false,
      error: 'Insufficient gas',
      txHash: undefined,
      tokenId: undefined,
    }));

    const result = await purchaseAndDeliver(defaultPurchaseParams, deps);

    expect(result.status).toBe('failed');
    const mintStep = result.steps.find(s => s.name === 'mint_and_deliver');
    expect(mintStep?.status).toBe('failed');
    expect(mintStep?.error).toBe('Insufficient gas');
    // Royalty should NOT be recorded when mint fails
    expect(deps.recordRoyalty).not.toHaveBeenCalled();
  });

  it('should fail when mint throws an error', async () => {
    deps.mintAndDeliver.mockRejectedValue(new Error('Network timeout'));

    const result = await purchaseAndDeliver(defaultPurchaseParams, deps);

    expect(result.status).toBe('failed');
    const mintStep = result.steps.find(s => s.name === 'mint_and_deliver');
    expect(mintStep?.status).toBe('failed');
    expect(mintStep?.error).toBe('Network timeout');
  });

  it('should still succeed when royalty recording fails (non-fatal)', async () => {
    deps.recordRoyalty.mockRejectedValue(new Error('IP registry down'));

    const result = await purchaseAndDeliver(defaultPurchaseParams, deps);

    expect(result.status).toBe('completed');
    const royaltyStep = result.steps.find(s => s.name === 'record_royalty');
    expect(royaltyStep?.status).toBe('failed');
    expect(royaltyStep?.error).toBe('IP registry down');
  });

  it('should skip royalty recording when recordRoyalty is not provided', async () => {
    const { recordRoyalty: _, ...depsWithoutRoyalty } = deps;

    const result = await purchaseAndDeliver(defaultPurchaseParams, depsWithoutRoyalty);

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(3); // wallet, checkout, mint — no royalty step
    const royaltyStep = result.steps.find(s => s.name === 'record_royalty');
    expect(royaltyStep).toBeUndefined();
  });

  it('should pass correct params to mintAndDeliver', async () => {
    await purchaseAndDeliver(defaultPurchaseParams, deps);

    expect(deps.mintAndDeliver).toHaveBeenCalledWith(
      'session_001',
      'user_001',
      'listing_001',
      '0xWallet123',
      'solana',
      'ipfs://QmMeta',
      'CollectionPubkey123',
    );
  });
});

// ==========================================================================
// collectionDrop
// ==========================================================================

describe('collectionDrop', () => {
  let deps: {
    generateBatch: ReturnType<typeof vi.fn>;
    curateCollection: ReturnType<typeof vi.fn>;
    batchList: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    deps = {
      generateBatch: vi.fn().mockResolvedValue(
        Array.from({ length: 10 }, (_, i) =>
          mockNFT({ canonScore: 80 + i, metadata: { ...mockNFT().metadata, name: `Fire Guardian #${i + 1}` } }),
        ),
      ),
      curateCollection: vi.fn().mockResolvedValue(mockCuration()),
      batchList: vi.fn().mockResolvedValue(
        Array.from({ length: 10 }, (_, i) =>
          mockListing({ listingId: `listing_${i + 1}` }),
        ),
      ),
    };
  });

  it('should complete full success flow', async () => {
    const result = await collectionDrop(defaultCollectionDropParams, deps);

    expect(result.status).toBe('completed');
    expect(result.name).toBe('collection_drop');
    expect(result.steps).toHaveLength(4); // generate, canon, curation, list
    expect(result.steps.every(s => s.status === 'completed')).toBe(true);
  });

  it('should call generateBatch with correct params', async () => {
    await collectionDrop(defaultCollectionDropParams, deps);

    expect(deps.generateBatch).toHaveBeenCalledWith('Fire', 'epic', 10);
  });

  it('should fail when batch generation throws', async () => {
    deps.generateBatch.mockRejectedValue(new Error('Rate limit exceeded'));

    const result = await collectionDrop(defaultCollectionDropParams, deps);

    expect(result.status).toBe('failed');
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toBe('Rate limit exceeded');
    expect(result.steps).toHaveLength(1);
  });

  it('should fail when ALL NFTs fail canon compliance', async () => {
    deps.generateBatch.mockResolvedValue(
      Array.from({ length: 5 }, () => mockNFT({ canonScore: 30 })),
    );

    const result = await collectionDrop(defaultCollectionDropParams, deps);

    expect(result.status).toBe('failed');
    const canonStep = result.steps.find(s => s.name === 'canon_filter');
    expect(canonStep?.error).toBe('All NFTs failed canon compliance');
    expect(deps.curateCollection).not.toHaveBeenCalled();
  });

  it('should filter out low-canon-score NFTs and proceed with passing ones', async () => {
    const mixed = [
      mockNFT({ canonScore: 90 }),
      mockNFT({ canonScore: 45 }),
      mockNFT({ canonScore: 75 }),
      mockNFT({ canonScore: 20 }),
      mockNFT({ canonScore: 85 }),
    ];
    deps.generateBatch.mockResolvedValue(mixed);

    const result = await collectionDrop(defaultCollectionDropParams, deps);

    expect(result.status).toBe('completed');
    const canonStep = result.steps.find(s => s.name === 'canon_filter');
    const canonResult = canonStep?.result as Record<string, number>;
    expect(canonResult.total).toBe(5);
    expect(canonResult.passed).toBe(3);
    expect(canonResult.rejected).toBe(2);
    // curateCollection should receive only the 3 passing NFTs
    expect(deps.curateCollection).toHaveBeenCalledWith(
      'Draconia',
      expect.arrayContaining([
        expect.objectContaining({ canonScore: 90 }),
        expect.objectContaining({ canonScore: 75 }),
        expect.objectContaining({ canonScore: 85 }),
      ]),
    );
  });

  it('should fail when guardian rejects the collection', async () => {
    deps.curateCollection.mockResolvedValue(mockCuration({
      approved: false,
      curationNotes: 'Collection lacks thematic coherence',
    }));

    const result = await collectionDrop(defaultCollectionDropParams, deps);

    expect(result.status).toBe('failed');
    const curationStep = result.steps.find(s => s.name === 'guardian_curation');
    expect(curationStep?.status).toBe('failed');
    expect(curationStep?.error).toBe('Collection lacks thematic coherence');
    expect(deps.batchList).not.toHaveBeenCalled();
  });

  it('should fail when curation throws an error', async () => {
    deps.curateCollection.mockRejectedValue(new Error('Agent crashed'));

    const result = await collectionDrop(defaultCollectionDropParams, deps);

    expect(result.status).toBe('failed');
    const curationStep = result.steps.find(s => s.name === 'guardian_curation');
    expect(curationStep?.status).toBe('failed');
    expect(curationStep?.error).toBe('Agent crashed');
  });

  it('should return partial status when batch listing fails', async () => {
    deps.batchList.mockRejectedValue(new Error('Marketplace congested'));

    const result = await collectionDrop(defaultCollectionDropParams, deps);

    expect(result.status).toBe('partial');
    const listStep = result.steps.find(s => s.name === 'batch_list');
    expect(listStep?.status).toBe('failed');
    expect(listStep?.error).toBe('Marketplace congested');
  });
});

// ==========================================================================
// Workflow Metadata & Timing
// ==========================================================================

describe('workflow metadata', () => {
  it('should generate a unique workflowId starting with wf_', async () => {
    const deps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT()),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.workflowId).toMatch(/^wf_\d+_[a-z0-9]+$/);
  });

  it('should generate different workflowIds for different runs', async () => {
    const deps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT()),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };

    const result1 = await generateAndList(defaultGenerateAndListParams, deps);
    const result2 = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result1.workflowId).not.toBe(result2.workflowId);
  });

  it('should track startedAt and completedAt on the workflow', async () => {
    const deps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT()),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };

    const before = new Date();
    const result = await generateAndList(defaultGenerateAndListParams, deps);
    const after = new Date();

    expect(result.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
  });

  it('should calculate totalDuration as difference between start and end', async () => {
    const deps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT()),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.totalDuration).toBe(result.completedAt.getTime() - result.startedAt.getTime());
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });

  it('should track startedAt and completedAt on each step', async () => {
    const deps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT()),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    for (const step of result.steps) {
      expect(step.startedAt).toBeInstanceOf(Date);
      expect(step.completedAt).toBeInstanceOf(Date);
      expect(step.completedAt!.getTime()).toBeGreaterThanOrEqual(step.startedAt!.getTime());
    }
  });

  it('should set correct step statuses on failure path', async () => {
    const deps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT({ canonScore: 30 })),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };

    const result = await generateAndList(defaultGenerateAndListParams, deps);

    expect(result.steps[0].status).toBe('completed'); // generate succeeded
    expect(result.steps[1].status).toBe('failed'); // canon failed
    expect(result.steps).toHaveLength(2); // stopped early
  });

  it('should set the workflow name correctly for each workflow type', async () => {
    const genDeps = {
      generateNFT: vi.fn().mockResolvedValue(mockNFT()),
      curateWithGuardian: vi.fn().mockResolvedValue(mockCuration()),
      createListing: vi.fn().mockResolvedValue(mockListing()),
    };
    const purchaseDeps = {
      ensureWallet: vi.fn().mockResolvedValue({ walletAddress: '0x1', userId: 'u1' }),
      createCheckout: vi.fn().mockResolvedValue({ sessionId: 's1', checkoutUrl: 'https://co' }),
      mintAndDeliver: vi.fn().mockResolvedValue(mockPurchaseResult()),
    };
    const dropDeps = {
      generateBatch: vi.fn().mockResolvedValue([mockNFT()]),
      curateCollection: vi.fn().mockResolvedValue(mockCuration()),
      batchList: vi.fn().mockResolvedValue([mockListing()]),
    };

    const r1 = await generateAndList(defaultGenerateAndListParams, genDeps);
    const r2 = await purchaseAndDeliver(defaultPurchaseParams, purchaseDeps);
    const r3 = await collectionDrop(defaultCollectionDropParams, dropDeps);

    expect(r1.name).toBe('generate_and_list');
    expect(r2.name).toBe('purchase_and_deliver');
    expect(r3.name).toBe('collection_drop');
  });
});
