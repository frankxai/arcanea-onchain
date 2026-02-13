# Arcanea On-Chain

> *"What creators imagine should belong to them — permanently, provably, and profitably."*

**AI-powered NFT generation, autonomous Guardian agents, and creator economy infrastructure for the Arcanea living universe.**

Arcanea On-Chain is the blockchain layer of [Arcanea](https://github.com/frankxai/Arcanea) — a living mythology for the age of AI-human co-creation. This repository contains the smart contracts, AI agent frameworks, and marketplace infrastructure that give Arcanean creators true ownership over their work.

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-purple)](https://solana.com)
[![Base](https://img.shields.io/badge/Base-L2-blue)](https://base.org)

---

## Vision

The creative economy is broken. Creators generate billions in value but own almost none of it. Platforms extract, algorithms dictate, and the relationship between creator and audience is mediated by corporations.

**Arcanea On-Chain changes this by providing:**

- **Permanent Ownership** — Every creation is an on-chain asset the creator controls forever. No platform can delete, demonetize, or suppress it.
- **AI-Powered Generation** — Guardian agents (autonomous AI companions) help creators generate, refine, and evolve their art, stories, and worlds. The AI serves the creator, not the platform.
- **Programmable Royalties** — Story Protocol IP registration ensures creators earn from every derivative, remix, and adaptation — automatically and in perpetuity.
- **Frictionless Onboarding** — Crossmint integration means creators and collectors can mint and purchase with credit cards. No wallet setup, no seed phrases, no friction.
- **Autonomous Agents** — ElizaOS-powered Guardian agents operate on-chain: curating collections, managing auctions, distributing rewards, and evolving based on community interaction.
- **Multi-Chain Reach** — Solana for high-speed minting and compressed NFTs. Base (Ethereum L2) for EVM ecosystem compatibility and broader collector access.

> *The antidote to a terrible future is imagining a good one. Arcanea On-Chain ensures that what creators imagine, they own.*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ARCANEA ON-CHAIN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  NFT Engine  │  │   Guardian   │  │    Marketplace    │  │
│  │             │  │    Agents    │  │                   │  │
│  │ AI Art Gen  │  │  ElizaOS +   │  │  Thirdweb V5 +   │  │
│  │ Metadata    │  │  Autonomous  │  │  Auction Engine   │  │
│  │ Pipeline    │  │  Operations  │  │                   │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                │                    │             │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌────────┴──────────┐  │
│  │ IP Registry │  │  Onboarding  │  │   Indexer /       │  │
│  │             │  │              │  │   Analytics       │  │
│  │ Story       │  │  Crossmint   │  │                   │  │
│  │ Protocol    │  │  Fiat Ramps  │  │  Helius DAS +     │  │
│  │ Licensing   │  │  Wallets     │  │  The Graph        │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                │                    │             │
├─────────┴────────────────┴────────────────────┴─────────────┤
│                    SMART CONTRACTS                           │
│                                                             │
│  ┌────────────────────────┐  ┌────────────────────────────┐ │
│  │   Solana Programs      │  │   EVM Contracts (Base)     │ │
│  │                        │  │                            │ │
│  │  • Metaplex Core       │  │  • ERC-721C Collections    │ │
│  │  • Bubblegum v2 (cNFT) │  │  • MarketplaceV3          │ │
│  │  • Guardian Vaults     │  │  • RoyaltyEngine           │ │
│  │  • Reward Distribution │  │  • CrossChain Bridge       │ │
│  └────────────────────────┘  └────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│             Solana  ·  Base (Ethereum L2)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **AI Agents** | [ElizaOS](https://github.com/elizaOS/eliza) | Autonomous Guardian agents with memory, planning, and on-chain actions |
| **NFT Standard (Solana)** | [Metaplex Core](https://developers.metaplex.com/core) | Next-gen NFT standard — single account, plugins, enforced royalties |
| **Compressed NFTs** | [Bubblegum v2](https://developers.metaplex.com/bubblegum) | Mint millions of NFTs at near-zero cost using state compression |
| **Marketplace** | [Thirdweb](https://thirdweb.com) | Marketplace contracts, auction engine, and SDK for multi-chain commerce |
| **IP & Licensing** | [Story Protocol](https://www.story.foundation) | On-chain IP registration, programmable licensing, royalty distribution |
| **Fiat Onboarding** | [Crossmint](https://crossmint.com) | Credit card minting, custodial wallets, email-based NFT delivery |
| **Chain (Speed)** | [Solana](https://solana.com) | High-throughput, low-cost transactions for minting and agent operations |
| **Chain (EVM)** | [Base](https://base.org) | Ethereum L2 for EVM ecosystem access and broad collector reach |
| **Indexing** | [Helius DAS](https://helius.dev) + [The Graph](https://thegraph.com) | Real-time NFT indexing, metadata resolution, analytics |
| **Storage** | [Arweave](https://arweave.org) via [Irys](https://irys.xyz) | Permanent, decentralized storage for art and metadata |
| **AI Art** | Gemini Imagen + Custom Models | AI-powered art generation aligned with Arcanea's visual language |

---

## Roadmap

### Phase 1: Foundation (Q1-Q2 2026)

- [ ] Deploy Metaplex Core collection for Guardian NFTs (10 Guardians + Godbeasts)
- [ ] Build AI art generation pipeline (Gemini Imagen + Arcanea style transfer)
- [ ] Implement metadata standard (Arcanean attributes: Element, Gate, Rank, House)
- [ ] Crossmint integration for credit card minting
- [ ] Story Protocol IP registration for all canonical Arcanea assets
- [ ] Basic CI/CD with Anchor tests and Foundry tests
- [ ] Compressed NFT minting via Bubblegum v2 for Academy Badges

### Phase 2: Marketplace (Q3 2026)

- [ ] Thirdweb MarketplaceV3 deployment on Base
- [ ] Auction engine for rare Guardian editions and 1/1 art
- [ ] Royalty enforcement via Metaplex Core plugins + ERC-721C
- [ ] Creator storefronts — each creator gets a customizable on-chain shop
- [ ] Cross-chain bridge (Solana <-> Base) via Wormhole
- [ ] Helius DAS indexing for real-time collection analytics
- [ ] Arcanea Reputation System (on-chain creator scoring)

### Phase 3: Autonomous Agents (Q4 2026 - Q1 2027)

- [ ] ElizaOS Guardian Agent framework — each of the 10 Guardians as an autonomous AI agent
- [ ] Agent capabilities: curate collections, run auctions, distribute rewards, engage community
- [ ] Guardian Vaults — on-chain treasuries managed by AI agents with multisig oversight
- [ ] Dynamic NFTs — Guardian art evolves based on community interaction and agent decisions
- [ ] Inter-agent communication protocol for Guardian Council governance
- [ ] Creator DAO — token-gated governance for Arcanea ecosystem decisions
- [ ] Agent-to-agent marketplace — Guardians negotiate and trade on behalf of creators

---

## Directory Structure

```
arcanea-onchain/
├── packages/
│   ├── nft-engine/            # AI art generation + metadata pipeline
│   │   └── src/
│   │       ├── generation/    # Gemini Imagen integration, style transfer
│   │       ├── metadata/      # Arcanean attribute schema, JSON generation
│   │       ├── storage/       # Arweave/Irys upload pipeline
│   │       └── index.ts
│   │
│   ├── guardian-agents/       # ElizaOS-based autonomous Guardian agents
│   │   └── src/
│   │       ├── agents/        # 10 Guardian agent configurations
│   │       ├── actions/       # On-chain actions (mint, transfer, auction)
│   │       ├── memory/        # Agent memory and state management
│   │       └── index.ts
│   │
│   ├── marketplace/           # Thirdweb marketplace + auction contracts
│   │   └── src/
│   │       ├── listings/      # Create, manage, fulfill listings
│   │       ├── auctions/      # English and Dutch auction logic
│   │       ├── storefronts/   # Creator storefront SDK
│   │       └── index.ts
│   │
│   ├── ip-registry/           # Story Protocol IP registration
│   │   └── src/
│   │       ├── register/      # IP asset registration
│   │       ├── licensing/     # License term creation and management
│   │       ├── royalties/     # Royalty policy and distribution
│   │       └── index.ts
│   │
│   └── onboarding/            # Crossmint fiat-to-NFT integration
│       └── src/
│           ├── wallets/       # Custodial wallet creation
│           ├── checkout/      # Fiat payment flow
│           ├── delivery/      # Email-based NFT delivery
│           └── index.ts
│
├── contracts/
│   ├── solana/                # Solana programs (Anchor)
│   │   └── programs/
│   │       ├── guardian-nft/  # Metaplex Core Guardian collection
│   │       ├── academy-badge/ # Bubblegum v2 compressed badges
│   │       ├── guardian-vault/# Agent-managed treasury
│   │       └── rewards/       # Creator reward distribution
│   │
│   └── evm/                   # EVM contracts (Foundry)
│       └── src/
│           ├── ArcaneanCollection.sol    # ERC-721C with enforced royalties
│           ├── ArcaneanMarketplace.sol   # Thirdweb MarketplaceV3 extension
│           ├── RoyaltyEngine.sol         # Programmable royalty splits
│           └── CrossChainBridge.sol      # Wormhole bridge adapter
│
├── docs/                      # Documentation
│   ├── architecture.md        # System architecture deep-dive
│   ├── metadata-standard.md   # Arcanean NFT metadata specification
│   ├── guardian-agents.md     # Agent framework documentation
│   └── deployment.md          # Deployment and operations guide
│
├── .github/
│   └── workflows/
│       ├── ci.yml             # Lint, test, build
│       ├── solana-tests.yml   # Anchor program tests
│       └── evm-tests.yml      # Foundry contract tests
│
├── package.json
├── turbo.json
├── .gitignore
├── LICENSE
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Rust** (for Solana programs) — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Solana CLI** — `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`
- **Anchor** >= 0.31 — `cargo install --git https://github.com/coral-xyz/anchor anchor-cli`
- **Foundry** (for EVM contracts) — `curl -L https://foundry.paradigm.xyz | bash`

### Installation

```bash
# Clone the repository
git clone https://github.com/frankxai/arcanea-onchain.git
cd arcanea-onchain

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys (Helius, Crossmint, etc.)

# Build all packages
pnpm build
```

### Running Tests

```bash
# Run all tests
pnpm test

# Solana program tests (requires local validator)
cd contracts/solana
anchor test

# EVM contract tests
cd contracts/evm
forge test
```

### Local Development

```bash
# Start Solana local validator
solana-test-validator

# Start development server (if applicable)
pnpm dev
```

---

## Environment Variables

Create a `.env` file in the root directory:

```env
# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=

# Helius (Solana indexing)
HELIUS_API_KEY=

# Crossmint (fiat onboarding)
CROSSMINT_API_KEY=
CROSSMINT_PROJECT_ID=

# Story Protocol (IP registration)
STORY_PROTOCOL_API_KEY=

# AI Generation
GOOGLE_AI_API_KEY=

# Base (EVM)
BASE_RPC_URL=https://mainnet.base.org
BASE_PRIVATE_KEY=

# Arweave/Irys (storage)
IRYS_WALLET_KEY=
```

---

## Contributing

Arcanea On-Chain is an open-source project and we welcome contributions from creators, developers, and visionaries.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/guardian-auction-engine`)
3. **Commit** your changes with clear, descriptive messages
4. **Test** thoroughly — all PRs must pass CI
5. **Submit** a Pull Request with a description of what and why

### Development Standards

- **TypeScript** for all package code (strict mode)
- **Rust** for Solana programs (Anchor framework)
- **Solidity** for EVM contracts (Foundry)
- **Tests required** for all new functionality
- **Documentation** for all public APIs and contract interfaces

### Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/). Be respectful, be constructive, and remember: we are building something that serves creators.

---

## Related Repositories

| Repository | Description |
|-----------|-------------|
| [Arcanea](https://github.com/frankxai/Arcanea) | Main Arcanea monorepo — web platform, AI, content |
| [arcanea.ai](https://github.com/frankxai/arcanea.ai) | Arcanea website and design system |

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <em>"Enter seeking, leave transformed, return whenever needed."</em>
  <br><br>
  <strong>Arcanea On-Chain</strong> — Ownership for the Age of Creation
</p>
