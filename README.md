<div align="center">

<img src="https://github.com/frankxai/arcanea-onchain/releases/download/v0.1.0-assets/01-onchain-hero.png" alt="Arcanea On-Chain" width="100%"/>

<br/>

# Arcanea On-Chain

### Ownership infrastructure for the age of creation.

<br/>

[![arcanea.ai](https://img.shields.io/badge/arcanea.ai-live-0d1117?style=for-the-badge&labelColor=0d1117&color=7fffd4)](https://arcanea.ai)
[![Solana](https://img.shields.io/badge/Solana-primary-0d1117?style=for-the-badge&logo=solana&logoColor=white&color=9966ff)](https://solana.com)
[![Base L2](https://img.shields.io/badge/Base-L2-0d1117?style=for-the-badge&logo=ethereum&logoColor=white&color=78a6ff)](https://base.org)
[![ElizaOS](https://img.shields.io/badge/ElizaOS-agents-0d1117?style=for-the-badge&color=ffd700)](https://github.com/elizaOS/eliza)
[![Story Protocol](https://img.shields.io/badge/Story_Protocol-IP-0d1117?style=for-the-badge&color=ff6b6b)](https://story.foundation)
[![MIT](https://img.shields.io/badge/MIT-0d1117?style=for-the-badge)](./LICENSE)

<br/>

[**Architecture**](#architecture) &nbsp;&middot;&nbsp; [**NFT Tiers**](#nft-tier-architecture) &nbsp;&middot;&nbsp; [**Guardian Agents**](#guardian-agents) &nbsp;&middot;&nbsp; [**Contracts**](#smart-contracts) &nbsp;&middot;&nbsp; [**Ecosystem**](#ecosystem) &nbsp;&middot;&nbsp; [**Quick Start**](#quick-start)

</div>

<br/>

---

<br/>

## The Thesis

The creative economy is structurally broken. Creators generate billions in value and own almost none of it. Platforms extract, algorithms dictate, and the relationship between creator and audience is mediated by corporations that optimize for engagement, not sovereignty.

**Arcanea On-Chain is the ownership layer of [Arcanea](https://github.com/frankxai/Arcanea)** &mdash; the infrastructure that makes creator sovereignty real through cryptographic proof. Every creation becomes a permanent on-chain asset. Every derivative generates automatic royalties. Every Guardian agent operates autonomously on behalf of creators, not platforms.

This is not "adding blockchain to a project." This is the architectural guarantee that what creators imagine, they own &mdash; permanently, provably, and profitably.

> *"The antidote to a terrible future is imagining a good one. On-chain, that imagination becomes permanent, ownable, and sovereign."*

<br/>

### What This Enables

| Capability | What It Does |
|:-----------|:-------------|
| **Permanent Ownership** | Every creation is an on-chain asset the creator controls forever. No platform can delete, demonetize, or suppress it |
| **AI Art Generation** | Guardian agents generate, refine, and evolve art aligned with Arcanea's visual language &mdash; AI serves the creator, not the platform |
| **Programmable Royalties** | Story Protocol IP registration ensures creators earn from every derivative, remix, and adaptation &mdash; automatically, in perpetuity |
| **Frictionless Onboarding** | Crossmint integration: credit cards, Apple Pay, email wallets. No seed phrases, no friction |
| **Autonomous Agents** | ElizaOS-powered Guardians curate collections, manage auctions, distribute rewards, and evolve with the community |
| **Multi-Chain Reach** | Solana for high-speed minting and compressed NFTs. Base for EVM ecosystem access and broader collector reach |

<br/>

---

<br/>

## Architecture

Dual-chain architecture with five specialized packages, each handling a distinct layer of the creator ownership stack.

```
                         ┌──────────────────────────────┐
                         │      ARCANEA ON-CHAIN        │
                         └──────────────┬───────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
     ┌────────┴────────┐      ┌────────┴────────┐      ┌────────┴────────┐
     │    NFT Engine    │      │    Guardian      │      │   Marketplace   │
     │                  │      │     Agents       │      │                 │
     │  AI Art Gen      │      │  ElizaOS 10x     │      │  Thirdweb V5    │
     │  Metadata Pipe   │      │  Autonomous Ops  │      │  Auction Engine │
     │  Arweave Store   │      │  On-Chain Actions │      │  Creator Shops  │
     └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
              │                         │                         │
     ┌────────┴────────┐      ┌────────┴────────┐               │
     │   IP Registry    │      │   Onboarding    │               │
     │                  │      │                 │               │
     │  Story Protocol  │      │  Crossmint      │               │
     │  PIL Licensing   │      │  Fiat Ramps     │               │
     │  Derivative Tree │      │  Email Wallets  │               │
     └────────┬────────┘      └────────┬────────┘               │
              │                         │                         │
              └─────────────────────────┼─────────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
     ┌────────┴────────┐                              ┌──────────┴──────────┐
     │  Solana Programs │                              │  EVM Contracts      │
     │                  │                              │       (Base)        │
     │  Metaplex Core   │                              │  ERC-721C           │
     │  Bubblegum v2    │                              │  MarketplaceV3      │
     │  Guardian Vaults │                              │  RoyaltyEngine      │
     │  Rewards Dist    │                              │  CrossChain Bridge  │
     └─────────────────┘                              └─────────────────────┘
```

<br/>

### Why Dual-Chain

| Decision | Chain | Rationale |
|:---------|:------|:----------|
| **Primary: Mass Operations** | Solana | Bubblegum v2 compressed NFTs: mint 1M items for ~$2,000. Metaplex Core: enforced royalties, plugin system. 400ms finality. ElizaOS native integration |
| **Secondary: Premium + EVM** | Base (Ethereum L2) | Coinbase ecosystem for mainstream reach. ERC-721C enforced royalties. OnchainKit React components. Sub-$0.05 transactions |
| **IP Layer** | Story Protocol | Purpose-built L1 for programmable IP ($140M funded). Derivative tree maps to lore hierarchy. Automated royalty flow via PIL |

<br/>

---

<br/>

<p align="center">
  <img src="https://github.com/frankxai/arcanea-onchain/releases/download/v0.1.0-assets/02-nft-tiers.png" alt="NFT Tier Architecture" width="100%">
</p>

## NFT Tier Architecture

Five tiers from legendary 1/1 auctions to mass-distributed compressed fragments. Each tier maps to a distinct chain, standard, and economic model.

| Tier | Name | Supply | Chain | Standard | Transfer | Price Range |
|:----:|:-----|:------:|:------|:---------|:---------|:------------|
| **Legendary** | Guardian Portraits, Unique 1/1s | 10&ndash;50 | Base | ERC-721C | Transferable | 0.5+ ETH |
| **Epic** | Godbeast Companions | 1K&ndash;10K | Solana | Metaplex Core | Transferable | 0.1&ndash;0.5 SOL |
| **Rare** | Element Stones, Complete Scrolls | 5K&ndash;25K | Solana | Bubblegum v2 | Transferable | 0.01&ndash;0.1 SOL |
| **Common** | Academy Badges, Certifications | Unlimited | Solana | Bubblegum v2 | Soulbound | Free |
| **Fragment** | Lore Fragments | 100K+ | Solana | Bubblegum v2 | Transferable | Free airdrops |

<br/>

**Collection Details:**

- **Guardian Portraits** &mdash; 10 unique 1/1s of the Arcanean Guardians. AI-generated via Gemini 3 Pro with full lore-consistent prompting. Elements expressed through materials and ambient lighting. Auctioned on Base via Manifold
- **Godbeast Companions** &mdash; 10 collections of 1,000 each (10K total). Dynamic traits that evolve with the owner's Gate progression. Rarity tiers: Common (60%), Rare (25%), Epic (10%), Legendary (5%)
- **Element Stones** &mdash; 5,000 per element (25K total). Combinable: collect all 5 to unlock a Synthesis Stone. Compressed NFTs via Bubblegum v2
- **Academy Badges** &mdash; Unlimited soulbound tokens. Awarded for completing learning modules, attending events, making contributions. Non-transferable to prevent farming
- **Lore Fragments** &mdash; 100K+ compressed collectibles across 17 categories matching the Library collections. Combine 10 fragments from the same collection to forge a Complete Scroll (Rare tier)

<br/>

---

<br/>

<p align="center">
  <img src="https://github.com/frankxai/arcanea-onchain/releases/download/v0.1.0-assets/03-guardian-council.png" alt="Guardian Council" width="100%">
</p>

## Guardian Agents

Ten autonomous AI agents built on [ElizaOS](https://github.com/elizaOS/eliza), each mapped to one of Arcanea's Ten Gates. Every Guardian has a distinct personality, domain expertise, and marketplace behavior &mdash; they don't just respond to prompts, they **operate on-chain** autonomously.

| Guardian | Gate | Element | Frequency | Marketplace Behavior |
|:---------|:-----|:--------|:---------:|:---------------------|
| **Lyssandria** | Foundation | Earth | 396 Hz | Conservative pricing, stable long-term listings |
| **Leyla** | Flow | Water | 417 Hz | Dynamic pricing, promotes emerging creators |
| **Draconia** | Fire | Fire | 528 Hz | Aggressive auctions, competitive bidding wars |
| **Maylinn** | Heart | Water | 639 Hz | Community-focused, group purchases and bundles |
| **Alera** | Voice | Wind | 741 Hz | Verified authenticity, truth-scored metadata |
| **Lyria** | Sight | Void | 852 Hz | Predictive curation, trend-setting drops |
| **Aiyami** | Crown | Spirit | 963 Hz | Premium-only, ceremonial release events |
| **Elara** | Shift | Wind | 1111 Hz | Cross-category discovery, bridging niches |
| **Ino** | Unity | Spirit | 963 Hz | Collaborative collections, partnership bundles |
| **Shinkami** | Source | Void/Spirit | 1111 Hz | Final quality gate, legendary releases only |

<br/>

**Agent Capabilities:**

- **Curation** &mdash; Each Guardian curates items within their elemental domain, applying distinct aesthetic and quality filters
- **Auction Management** &mdash; Draconia runs fire-element auctions with escalating urgency. Aiyami manages ceremonial drops with tiered access
- **Reward Distribution** &mdash; Guardian Vaults (on-chain treasuries) managed by agents with multisig oversight
- **Dynamic NFTs** &mdash; Guardian art evolves based on community interaction and agent decisions
- **Social Presence** &mdash; Each Guardian maintains accounts on X, Discord, and Farcaster for community engagement
- **Inter-Agent Coordination** &mdash; Guardian Council governance: 7/10 quorum + community delegates for ecosystem decisions

<br/>

---

<br/>

## Smart Contracts

### Solana Programs (Anchor)

| Program | Purpose | Standard |
|:--------|:--------|:---------|
| `guardian-nft` | Metaplex Core collection for Guardian and Godbeast NFTs | Metaplex Core |
| `academy-badge` | Compressed soulbound badges for achievements | Bubblegum v2 |
| `guardian-vault` | Agent-managed on-chain treasuries | Custom Anchor |
| `rewards` | Creator reward distribution system | Custom Anchor |

### EVM Contracts (Foundry, Base L2)

| Contract | Purpose | Standard |
|:---------|:--------|:---------|
| `ArcaneanCollection.sol` | NFT collection with enforced royalties | ERC-721C (Limit Break) |
| `ArcaneanMarketplace.sol` | Marketplace with English and Dutch auctions | Thirdweb MarketplaceV3 |
| `RoyaltyEngine.sol` | Programmable royalty splits across derivative trees | Custom |
| `CrossChainBridge.sol` | Solana &harr; Base asset bridge | Wormhole adapter |

<br/>

---

<br/>

## Tech Stack

| Layer | Technology | Purpose |
|:------|:-----------|:--------|
| **AI Agents** | [ElizaOS](https://github.com/elizaOS/eliza) | Autonomous Guardian agents with memory, planning, and on-chain actions |
| **NFT (Solana)** | [Metaplex Core](https://developers.metaplex.com/core) | Next-gen NFT standard &mdash; single account, plugins, enforced royalties |
| **Compressed NFTs** | [Bubblegum v2](https://developers.metaplex.com/bubblegum) | Mint millions of NFTs at near-zero cost via state compression |
| **Marketplace** | [Thirdweb](https://thirdweb.com) | MarketplaceV3 contracts, auction engine, multi-chain SDK |
| **IP & Licensing** | [Story Protocol](https://story.foundation) | On-chain IP registration, programmable licensing, royalty distribution |
| **Onboarding** | [Crossmint](https://crossmint.com) | Credit card minting, email wallets, zero-crypto onboarding |
| **Chain (Speed)** | [Solana](https://solana.com) | High-throughput, low-cost transactions for mass minting and agent operations |
| **Chain (EVM)** | [Base](https://base.org) | Ethereum L2 for premium collections and broad EVM collector reach |
| **Indexing** | [Helius DAS](https://helius.dev) + [The Graph](https://thegraph.com) | Real-time NFT indexing, metadata resolution, analytics |
| **Storage** | [Arweave](https://arweave.org) via [Irys](https://irys.xyz) | Permanent, decentralized storage for art and metadata |
| **AI Art** | Gemini 3 Pro via [Arcanea AI](https://github.com/frankxai/Arcanea) | Lore-consistent generation &mdash; elements through materials and ambient, never labels |
| **Build** | [Turborepo](https://turbo.build) + [pnpm](https://pnpm.io) | Monorepo orchestration across 5 packages |

<br/>

---

<br/>

## Ecosystem

Arcanea On-Chain is the ownership layer in a three-repository architecture. Each repository handles a distinct concern &mdash; intelligence, platform, and ownership &mdash; connected through shared canon, design system, and AI infrastructure.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          ARCANEA ECOSYSTEM                              │
│                                                                         │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│   │                  │    │                  │    │                  │  │
│   │     Arcanea      │───▶│  arcanea.ai      │───▶│ arcanea-onchain  │  │
│   │   Intelligence   │    │    Platform       │    │   Ownership      │  │
│   │                  │    │                  │    │                  │  │
│   │  65+ Skills      │    │  Web Application │    │  NFT Engine      │  │
│   │  40+ Agents      │    │  AI Companions   │    │  Guardian Agents │  │
│   │  200K+ Words     │    │  Library Access  │    │  Marketplace     │  │
│   │  10 Guardians    │    │  Creator Tools   │    │  IP Registry     │  │
│   │  Canon & Lore    │    │  Design System   │    │  Smart Contracts │  │
│   │                  │    │                  │    │                  │  │
│   └──────────────────┘    └──────────────────┘    └──────────────────┘  │
│         Monorepo               Next.js 16            Solana + Base      │
│                                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

| Repository | Role | Stack |
|:-----------|:-----|:------|
| [**Arcanea**](https://github.com/frankxai/Arcanea) | Intelligence layer &mdash; skills, agents, canon, lore, Library of 200K+ words | Monorepo, Claude Code, MCP |
| [**arcanea.ai**](https://arcanea.ai) | Platform layer &mdash; web application, AI companions, creator tools | Next.js 16, React 19, Vercel AI SDK 6 |
| [**arcanea-onchain**](https://github.com/frankxai/arcanea-onchain) | Ownership layer &mdash; NFTs, agents, marketplace, IP, smart contracts | Solana, Base, ElizaOS, Thirdweb |

<br/>

---

<br/>

## Roadmap

### Phase 1: Foundation &mdash; Q1&ndash;Q2 2026

> IP registration, Solana infrastructure, AI art pipeline, fiat onboarding

- [ ] Story Protocol IP registration for Lumina, Nero, 10 Guardians, 10 Godbeasts, 7 Houses, 5 Elements
- [ ] Deploy Metaplex Core collection for Guardian NFTs with enforced royalties
- [ ] Build AI art generation pipeline (Gemini 3 Pro + Arcanea style transfer)
- [ ] Implement Arcanean metadata standard (Element, Gate, Rank, House attributes)
- [ ] Crossmint integration for credit card minting and email wallets
- [ ] Compressed NFT minting via Bubblegum v2 for Academy Badges
- [ ] Fork ElizaOS to `arcanea-eliza` with 10 Guardian character files
- [ ] CI/CD with Anchor tests and Foundry tests

### Phase 2: Marketplace & Collections &mdash; Q3 2026

> First NFT drops, dual-chain marketplace, dynamic evolution system

- [ ] Thirdweb MarketplaceV3 deployment on Base (English + Dutch auctions)
- [ ] Metaplex Auction House deployment on Solana
- [ ] Launch Legendary tier: 10 Guardian Portrait 1/1 auctions
- [ ] Launch Epic tier: 10K Godbeast Companion collection with dynamic traits
- [ ] Launch Rare tier: 25K Element Stones (combinable across elements)
- [ ] Dynamic NFT system: art evolves from Apprentice to Luminor as creators progress
- [ ] Creator derivative flow via Story Protocol (automatic royalty inheritance)
- [ ] Cross-chain bridge (Solana &harr; Base) via Wormhole

### Phase 3: Autonomous Agents & Governance &mdash; Q4 2026&ndash;Q1 2027

> Full agent autonomy, creator tokens, DAO governance

- [ ] Guardian marketplace autonomy: each agent curates and prices within their domain
- [ ] Guardian Vaults: on-chain treasuries managed by AI agents with multisig
- [ ] Inter-agent coordination protocol for Guardian Council governance
- [ ] Creator token system on Base (bonding curves, revenue sharing)
- [ ] Creator DAO: token-gated governance with Guardian Council voting (7/10 quorum)
- [ ] Agent-to-agent marketplace: Guardians negotiate and trade on behalf of creators
- [ ] Publish `arcanea-nft-generation` and `arcanea-guardian-agent` skills to skills.sh

<br/>

---

<br/>

## Quick Start

### Prerequisites

| Tool | Version | Install |
|:-----|:--------|:--------|
| Node.js | >= 20 | [nodejs.org](https://nodejs.org) |
| pnpm | >= 9 | `npm i -g pnpm` |
| Rust | latest | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Solana CLI | stable | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| Anchor | >= 0.31 | `cargo install --git https://github.com/coral-xyz/anchor anchor-cli` |
| Foundry | latest | `curl -L https://foundry.paradigm.xyz \| bash` |

### Installation

```bash
git clone https://github.com/frankxai/arcanea-onchain.git
cd arcanea-onchain
pnpm install
cp .env.example .env
pnpm build
```

### Run Tests

```bash
# All packages
pnpm test

# Solana programs
cd contracts/solana && anchor test

# EVM contracts
cd contracts/evm && forge test
```

### Environment

```env
# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=

# Crossmint
CROSSMINT_API_KEY=
CROSSMINT_PROJECT_ID=

# Story Protocol
STORY_PROTOCOL_API_KEY=

# AI Generation
GOOGLE_AI_API_KEY=

# Base (EVM)
BASE_RPC_URL=https://mainnet.base.org

# Storage
IRYS_WALLET_KEY=
```

<br/>

---

<br/>

## Directory Structure

```
arcanea-onchain/
├── packages/
│   ├── nft-engine/            # AI art generation + metadata pipeline
│   ├── guardian-agents/       # ElizaOS-based autonomous Guardian agents
│   ├── marketplace/           # Thirdweb marketplace + auction contracts
│   ├── ip-registry/           # Story Protocol IP registration
│   └── onboarding/            # Crossmint fiat-to-NFT integration
│
├── contracts/
│   ├── solana/                # Anchor programs (guardian-nft, academy-badge, guardian-vault, rewards)
│   └── evm/                   # Foundry contracts (ArcaneanCollection, Marketplace, Royalty, Bridge)
│
├── docs/                      # Architecture, metadata standard, deployment guides
├── .github/workflows/         # CI/CD (lint, Anchor tests, Foundry tests)
├── turbo.json                 # Turborepo configuration
├── pnpm-workspace.yaml        # pnpm workspace definition
└── package.json
```

<br/>

---

<br/>

## Contributing

Arcanea On-Chain is MIT-licensed and open to contributions from creators, blockchain developers, and AI engineers.

1. **Fork** the repository
2. **Branch** from `main` (`git checkout -b feature/guardian-auction-engine`)
3. **Build** with strict TypeScript, Anchor for Solana, Foundry for EVM
4. **Test** &mdash; all PRs must pass CI (Anchor tests + Foundry tests)
5. **Submit** a PR with clear description of what and why

<br/>

---

<br/>

<div align="center">

**[Arcanea](https://github.com/frankxai/Arcanea)** &nbsp;&middot;&nbsp; **[arcanea.ai](https://arcanea.ai)** &nbsp;&middot;&nbsp; **[arcanea-onchain](https://github.com/frankxai/arcanea-onchain)**

<br/>

*"What creators imagine should belong to them &mdash; permanently, provably, and profitably."*

<br/>

[![MIT License](https://img.shields.io/badge/License-MIT-0d1117?style=flat-square&labelColor=0d1117&color=7fffd4)](./LICENSE)

</div>
