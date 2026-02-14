/**
 * @arcanea/nft-engine — Integration Workflows
 *
 * End-to-end workflows that orchestrate across all Arcanea on-chain packages:
 * NFT generation → Guardian curation → Marketplace listing → Fiat purchase → Mint & deliver
 */

// NOTE: These imports are typed references since the packages aren't installed as dependencies.
// In production, these would be proper package imports. For now, we use duck-typing interfaces.

// --- Shared Types ---

export type Element = 'Fire' | 'Water' | 'Earth' | 'Wind' | 'Void';
export type Chain = 'solana' | 'base';
export type AuctionType = 'english' | 'dutch';
export type NFTTier = 'legendary' | 'epic' | 'rare' | 'common' | 'fragment';

// --- Workflow Interfaces (duck-typed for cross-package integration) ---

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  properties?: Record<string, unknown>;
}

export interface GeneratedNFT {
  metadata: NFTMetadata;
  imageUri: string;
  metadataUri: string;
  tier: NFTTier;
  element: Element;
  guardianName?: string;
  canonScore: number;
}

export interface GuardianCuration {
  guardianName: string;
  approved: boolean;
  suggestedPrice: bigint;
  auctionType: AuctionType;
  auctionDuration: number; // seconds
  curationNotes: string;
  confidence: number; // 0-1
}

export interface ListingResult {
  listingId: string;
  chain: Chain;
  price: bigint;
  currency: string;
  auctionType: AuctionType;
  startTime: Date;
  endTime: Date;
}

export interface PurchaseResult {
  success: boolean;
  sessionId: string;
  buyerWallet: string;
  txHash?: string;
  tokenId?: string;
  error?: string;
}

// --- Workflow Step Results ---

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

export interface WorkflowResult {
  workflowId: string;
  name: string;
  status: 'completed' | 'failed' | 'partial';
  steps: WorkflowStep[];
  startedAt: Date;
  completedAt: Date;
  totalDuration: number; // ms
}

// --- Workflow: Generate & List ---

/**
 * Full pipeline: Generate NFT art → Validate canon → Get Guardian curation → List on marketplace
 *
 * Steps:
 * 1. Generate NFT metadata and art (nft-engine)
 * 2. Check canon compliance (nft-engine quality/canon-checker)
 * 3. Get Guardian curation decision (guardian-agents)
 * 4. Register IP if applicable (ip-registry)
 * 5. List on marketplace with Guardian-recommended params (marketplace)
 */
export interface GenerateAndListParams {
  /** The creator's user ID. */
  creatorId: string;
  /** Target element for the NFT. */
  element: Element;
  /** Target tier. */
  tier: NFTTier;
  /** Guardian to handle curation (name). */
  curatingGuardian: string;
  /** Which chain to list on. */
  chain: Chain;
  /** Optional custom prompt for art generation. */
  customPrompt?: string;
  /** Whether to register IP on Story Protocol. */
  registerIP?: boolean;
}

export async function generateAndList(
  params: GenerateAndListParams,
  dependencies: {
    generateNFT: (element: Element, tier: NFTTier, prompt?: string) => Promise<GeneratedNFT>;
    curateWithGuardian: (guardianName: string, nft: GeneratedNFT) => Promise<GuardianCuration>;
    registerIP?: (metadata: NFTMetadata) => Promise<{ assetId: string; licenseId: string }>;
    createListing: (nft: GeneratedNFT, curation: GuardianCuration, chain: Chain) => Promise<ListingResult>;
  },
): Promise<WorkflowResult> {
  const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const steps: WorkflowStep[] = [];
  const startedAt = new Date();

  // Step 1: Generate NFT
  const generateStep: WorkflowStep = { name: 'generate_nft', status: 'running', startedAt: new Date() };
  steps.push(generateStep);

  let nft: GeneratedNFT;
  try {
    nft = await dependencies.generateNFT(params.element, params.tier, params.customPrompt);
    generateStep.status = 'completed';
    generateStep.completedAt = new Date();
    generateStep.result = { name: nft.metadata.name, canonScore: nft.canonScore };
  } catch (error) {
    generateStep.status = 'failed';
    generateStep.completedAt = new Date();
    generateStep.error = error instanceof Error ? error.message : 'Generation failed';
    return buildResult(workflowId, 'generate_and_list', 'failed', steps, startedAt);
  }

  // Step 2: Canon compliance check
  const canonStep: WorkflowStep = { name: 'canon_check', status: 'running', startedAt: new Date() };
  steps.push(canonStep);

  if (nft.canonScore < 60) {
    canonStep.status = 'failed';
    canonStep.completedAt = new Date();
    canonStep.error = `Canon score ${nft.canonScore} is below minimum threshold (60)`;
    return buildResult(workflowId, 'generate_and_list', 'failed', steps, startedAt);
  }
  canonStep.status = 'completed';
  canonStep.completedAt = new Date();
  canonStep.result = { score: nft.canonScore, grade: nft.canonScore >= 90 ? 'S' : nft.canonScore >= 80 ? 'A' : 'B' };

  // Step 3: Guardian curation
  const curationStep: WorkflowStep = { name: 'guardian_curation', status: 'running', startedAt: new Date() };
  steps.push(curationStep);

  let curation: GuardianCuration;
  try {
    curation = await dependencies.curateWithGuardian(params.curatingGuardian, nft);
    curationStep.status = 'completed';
    curationStep.completedAt = new Date();
    curationStep.result = { guardian: curation.guardianName, approved: curation.approved, suggestedPrice: curation.suggestedPrice.toString() };
  } catch (error) {
    curationStep.status = 'failed';
    curationStep.completedAt = new Date();
    curationStep.error = error instanceof Error ? error.message : 'Curation failed';
    return buildResult(workflowId, 'generate_and_list', 'failed', steps, startedAt);
  }

  if (!curation.approved) {
    curationStep.error = `Guardian ${curation.guardianName} declined: ${curation.curationNotes}`;
    return buildResult(workflowId, 'generate_and_list', 'failed', steps, startedAt);
  }

  // Step 4: IP Registration (optional)
  if (params.registerIP && dependencies.registerIP) {
    const ipStep: WorkflowStep = { name: 'register_ip', status: 'running', startedAt: new Date() };
    steps.push(ipStep);

    try {
      const ipResult = await dependencies.registerIP(nft.metadata);
      ipStep.status = 'completed';
      ipStep.completedAt = new Date();
      ipStep.result = ipResult;
    } catch (error) {
      ipStep.status = 'failed';
      ipStep.completedAt = new Date();
      ipStep.error = error instanceof Error ? error.message : 'IP registration failed';
      // IP registration failure is non-fatal — continue with listing
    }
  }

  // Step 5: Create marketplace listing
  const listStep: WorkflowStep = { name: 'create_listing', status: 'running', startedAt: new Date() };
  steps.push(listStep);

  try {
    const listing = await dependencies.createListing(nft, curation, params.chain);
    listStep.status = 'completed';
    listStep.completedAt = new Date();
    listStep.result = listing;
  } catch (error) {
    listStep.status = 'failed';
    listStep.completedAt = new Date();
    listStep.error = error instanceof Error ? error.message : 'Listing failed';
    return buildResult(workflowId, 'generate_and_list', 'failed', steps, startedAt);
  }

  return buildResult(workflowId, 'generate_and_list', 'completed', steps, startedAt);
}

// --- Workflow: Purchase & Deliver ---

/**
 * Full purchase pipeline: Buyer pays fiat → Create wallet if needed → Mint NFT → Deliver
 *
 * Steps:
 * 1. Create or retrieve buyer's custodial wallet (onboarding)
 * 2. Create checkout session with price breakdown (onboarding)
 * 3. Process payment (simulated for non-fiat flows)
 * 4. Mint NFT to buyer's wallet (onboarding mint pipeline)
 * 5. Record royalty split (ip-registry)
 */
export interface PurchaseAndDeliverParams {
  buyerEmail: string;
  listingId: string;
  chain: Chain;
  paymentMethod: 'card' | 'apple_pay' | 'google_pay';
  metadataUri: string;
  collectionAddress: string;
  priceCents: number;
}

export async function purchaseAndDeliver(
  params: PurchaseAndDeliverParams,
  dependencies: {
    ensureWallet: (email: string, chain: Chain) => Promise<{ walletAddress: string; userId: string }>;
    createCheckout: (userId: string, listingId: string, priceCents: number, method: string) => Promise<{ sessionId: string; checkoutUrl: string }>;
    mintAndDeliver: (sessionId: string, userId: string, nftId: string, walletAddress: string, chain: Chain, metadataUri: string, collectionAddress: string) => Promise<PurchaseResult>;
    recordRoyalty?: (listingId: string, amount: number) => Promise<void>;
  },
): Promise<WorkflowResult> {
  const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const steps: WorkflowStep[] = [];
  const startedAt = new Date();

  // Step 1: Ensure buyer wallet
  const walletStep: WorkflowStep = { name: 'ensure_wallet', status: 'running', startedAt: new Date() };
  steps.push(walletStep);

  let wallet: { walletAddress: string; userId: string };
  try {
    wallet = await dependencies.ensureWallet(params.buyerEmail, params.chain);
    walletStep.status = 'completed';
    walletStep.completedAt = new Date();
    walletStep.result = { walletAddress: wallet.walletAddress };
  } catch (error) {
    walletStep.status = 'failed';
    walletStep.completedAt = new Date();
    walletStep.error = error instanceof Error ? error.message : 'Wallet creation failed';
    return buildResult(workflowId, 'purchase_and_deliver', 'failed', steps, startedAt);
  }

  // Step 2: Create checkout
  const checkoutStep: WorkflowStep = { name: 'create_checkout', status: 'running', startedAt: new Date() };
  steps.push(checkoutStep);

  let checkout: { sessionId: string; checkoutUrl: string };
  try {
    checkout = await dependencies.createCheckout(wallet.userId, params.listingId, params.priceCents, params.paymentMethod);
    checkoutStep.status = 'completed';
    checkoutStep.completedAt = new Date();
    checkoutStep.result = checkout;
  } catch (error) {
    checkoutStep.status = 'failed';
    checkoutStep.completedAt = new Date();
    checkoutStep.error = error instanceof Error ? error.message : 'Checkout failed';
    return buildResult(workflowId, 'purchase_and_deliver', 'failed', steps, startedAt);
  }

  // Step 3: Mint & deliver
  const mintStep: WorkflowStep = { name: 'mint_and_deliver', status: 'running', startedAt: new Date() };
  steps.push(mintStep);

  let mintResult: PurchaseResult;
  try {
    mintResult = await dependencies.mintAndDeliver(
      checkout.sessionId, wallet.userId, params.listingId,
      wallet.walletAddress, params.chain, params.metadataUri, params.collectionAddress,
    );
    mintStep.status = mintResult.success ? 'completed' : 'failed';
    mintStep.completedAt = new Date();
    mintStep.result = mintResult;
    if (!mintResult.success) {
      mintStep.error = mintResult.error;
    }
  } catch (error) {
    mintStep.status = 'failed';
    mintStep.completedAt = new Date();
    mintStep.error = error instanceof Error ? error.message : 'Mint failed';
    return buildResult(workflowId, 'purchase_and_deliver', 'failed', steps, startedAt);
  }

  // Step 4: Record royalty (optional, non-fatal)
  if (dependencies.recordRoyalty && mintResult.success) {
    const royaltyStep: WorkflowStep = { name: 'record_royalty', status: 'running', startedAt: new Date() };
    steps.push(royaltyStep);

    try {
      await dependencies.recordRoyalty(params.listingId, params.priceCents);
      royaltyStep.status = 'completed';
      royaltyStep.completedAt = new Date();
    } catch (error) {
      royaltyStep.status = 'failed';
      royaltyStep.completedAt = new Date();
      royaltyStep.error = error instanceof Error ? error.message : 'Royalty recording failed';
      // Non-fatal
    }
  }

  const finalStatus = mintResult.success ? 'completed' : 'failed';
  return buildResult(workflowId, 'purchase_and_deliver', finalStatus, steps, startedAt);
}

// --- Workflow: Collection Drop ---

/**
 * Batch collection drop workflow for launching a new collection.
 *
 * Steps:
 * 1. Generate batch of NFTs with consistent collection metadata
 * 2. Canon-check all metadata
 * 3. Guardian curates the collection
 * 4. Register collection IP
 * 5. Batch list on marketplace
 */
export interface CollectionDropParams {
  collectionName: string;
  element: Element;
  tier: NFTTier;
  count: number;
  curatingGuardian: string;
  chain: Chain;
  registerIP?: boolean;
}

export async function collectionDrop(
  params: CollectionDropParams,
  dependencies: {
    generateBatch: (element: Element, tier: NFTTier, count: number) => Promise<GeneratedNFT[]>;
    curateCollection: (guardianName: string, nfts: GeneratedNFT[]) => Promise<GuardianCuration>;
    batchList: (nfts: GeneratedNFT[], curation: GuardianCuration, chain: Chain) => Promise<ListingResult[]>;
  },
): Promise<WorkflowResult> {
  const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const steps: WorkflowStep[] = [];
  const startedAt = new Date();

  // Step 1: Batch generate
  const genStep: WorkflowStep = { name: 'batch_generate', status: 'running', startedAt: new Date() };
  steps.push(genStep);

  let nfts: GeneratedNFT[];
  try {
    nfts = await dependencies.generateBatch(params.element, params.tier, params.count);
    genStep.status = 'completed';
    genStep.completedAt = new Date();
    genStep.result = { count: nfts.length };
  } catch (error) {
    genStep.status = 'failed';
    genStep.completedAt = new Date();
    genStep.error = error instanceof Error ? error.message : 'Batch generation failed';
    return buildResult(workflowId, 'collection_drop', 'failed', steps, startedAt);
  }

  // Step 2: Canon filter
  const canonStep: WorkflowStep = { name: 'canon_filter', status: 'running', startedAt: new Date() };
  steps.push(canonStep);

  const passedNfts = nfts.filter(n => n.canonScore >= 60);
  canonStep.status = 'completed';
  canonStep.completedAt = new Date();
  canonStep.result = { total: nfts.length, passed: passedNfts.length, rejected: nfts.length - passedNfts.length };

  if (passedNfts.length === 0) {
    canonStep.error = 'All NFTs failed canon compliance';
    return buildResult(workflowId, 'collection_drop', 'failed', steps, startedAt);
  }

  // Step 3: Guardian curation
  const curationStep: WorkflowStep = { name: 'guardian_curation', status: 'running', startedAt: new Date() };
  steps.push(curationStep);

  let curation: GuardianCuration;
  try {
    curation = await dependencies.curateCollection(params.curatingGuardian, passedNfts);
    curationStep.status = curation.approved ? 'completed' : 'failed';
    curationStep.completedAt = new Date();
    curationStep.result = { approved: curation.approved, notes: curation.curationNotes };
    if (!curation.approved) {
      curationStep.error = curation.curationNotes;
      return buildResult(workflowId, 'collection_drop', 'failed', steps, startedAt);
    }
  } catch (error) {
    curationStep.status = 'failed';
    curationStep.completedAt = new Date();
    curationStep.error = error instanceof Error ? error.message : 'Curation failed';
    return buildResult(workflowId, 'collection_drop', 'failed', steps, startedAt);
  }

  // Step 4: Batch list
  const listStep: WorkflowStep = { name: 'batch_list', status: 'running', startedAt: new Date() };
  steps.push(listStep);

  try {
    const listings = await dependencies.batchList(passedNfts, curation, params.chain);
    listStep.status = 'completed';
    listStep.completedAt = new Date();
    listStep.result = { count: listings.length };
  } catch (error) {
    listStep.status = 'failed';
    listStep.completedAt = new Date();
    listStep.error = error instanceof Error ? error.message : 'Batch listing failed';
    return buildResult(workflowId, 'collection_drop', 'partial', steps, startedAt);
  }

  return buildResult(workflowId, 'collection_drop', 'completed', steps, startedAt);
}

// --- Helper ---

function buildResult(
  workflowId: string,
  name: string,
  status: WorkflowResult['status'],
  steps: WorkflowStep[],
  startedAt: Date,
): WorkflowResult {
  const completedAt = new Date();
  return {
    workflowId,
    name,
    status,
    steps,
    startedAt,
    completedAt,
    totalDuration: completedAt.getTime() - startedAt.getTime(),
  };
}
