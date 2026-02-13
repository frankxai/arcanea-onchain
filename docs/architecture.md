# Architecture

> System architecture deep-dive for Arcanea On-Chain.

## Overview

Arcanea On-Chain is a multi-chain, multi-layer system that connects AI-powered creation with permanent on-chain ownership.

### Layers

1. **Application Layer** — TypeScript packages (nft-engine, guardian-agents, marketplace, ip-registry, onboarding)
2. **Contract Layer** — Solana programs (Anchor) + EVM contracts (Foundry) on Base
3. **Infrastructure Layer** — Helius DAS indexing, Arweave storage, Wormhole bridging
4. **Agent Layer** — ElizaOS autonomous agents with on-chain capabilities

## Data Flow

```
Creator Input → NFT Engine (AI Generation) → Metadata + Art
    ↓
Arweave/Irys (Permanent Storage)
    ↓
Metaplex Core / ERC-721C (On-Chain Minting)
    ↓
Story Protocol (IP Registration)
    ↓
Marketplace (Listings / Auctions)
    ↓
Guardian Agents (Curation / Distribution)
```

*Full architecture documentation coming in Phase 1.*
