<p align="center">
  <strong>⟡ Arcanea On-Chain</strong><br/>
  <em>Blockchain IP &amp; Creator Economy Infrastructure</em>
</p>

<p align="center">
  <a href="https://arcanea.ai">arcanea.ai</a> · <a href="https://github.com/frankxai/Arcanea">Monorepo</a> · <a href="https://github.com/frankxai/Starlight-Intelligence-System">SIS</a> · <a href="https://github.com/frankxai/arcanea-realm">Arcanea Realm</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square&logo=opensourceinitiative" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/status-architecture--phase-orange?style=flat-square" alt="Architecture Phase" />
  <a href="https://arcanea.ai"><img src="https://img.shields.io/badge/Arcanea-Ecosystem-7fffd4?style=flat-square" alt="Arcanea Ecosystem" /></a>
</p>

---

![Arcanea On-Chain Web3 Hero](.github/assets/arcanea-onchain-web3-hero.jpg)

> Premium web3 cosmic hero (Guardian sovereignty + Metaplex NFT + Story IP chains) per ARCANEA_VISUAL_ECOSYSTEM + full VISUAL_DOCTRINE (Starlight Corps grammar) + TASTE 7 gates + DESIGN tokens (teal/gold/void). God-mode 2026-06-16.

## Quick Start

The project is currently in the architecture and research phase — no production packages are published yet. To explore the planned structure:

```bash
git clone https://github.com/frankxai/arcanea-onchain.git
cd arcanea-onchain
pnpm install
```

Browse the `docs/` directory for architecture documents and the `contracts/` directory for planned smart contract interfaces. Implementation begins once `@arcanea/core` reaches stable release.

When the SDK is available:

```typescript
import { ArcaneaVault } from '@arcanea/onchain';

// Mint a creative work as a compressed NFT
const vault = new ArcaneaVault({ network: 'mainnet-beta' });
await vault.mint({
  title: 'My Creative Work',
  creator: walletAddress,
  element: 'fire',
  gate: 'Voice',
  licenseType: 'cc-by-sa',
});
```

---

## Vision

**Arcanea On-Chain** is the blockchain infrastructure layer for the [Arcanea](https://arcanea.ai) creator ecosystem. It brings creator identity, intellectual property protection, and creative works ownership on-chain — ensuring that what creators build is *theirs*, permanently and verifiably.

> *"Creator sovereignty is not a feature. It is a right."*

---

## Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **AI Agents** | [ElizaOS](https://github.com/elizaOS/eliza) | Autonomous on-chain agents for creator workflows |
| **NFT Infrastructure** | [Metaplex Core](https://developers.metaplex.com/) + Bubblegum v2 | Compressed NFTs for creative works at scale |
| **Developer SDK** | [Thirdweb](https://thirdweb.com/) | Wallet, auth, and smart contract deployment |
| **IP Protection** | [Story Protocol](https://www.story.foundation/) | Programmable IP licensing and royalty enforcement |
| **Fiat On-Ramp** | [Crossmint](https://crossmint.com/) | Credit card minting, custodial wallets for onboarding |
| **L2 Settlement** | [Base](https://base.org/) | Low-cost EVM chain for high-throughput operations |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Arcanea Platform               │
│            (arcanea.ai / Apps)              │
├─────────────────────────────────────────────┤
│           @arcanea/onchain SDK              │
│  Creator Identity · IP Registry · Minting   │
├──────────┬──────────┬───────────────────────┤
│ Metaplex │  Story   │   ElizaOS Agents      │
│  Core    │ Protocol │  (Autonomous Ops)     │
├──────────┴──────────┴───────────────────────┤
│        Solana  ·  Base L2  ·  IPFS          │
└─────────────────────────────────────────────┘
```

---

## Planned Capabilities

### Creator Identity
- On-chain creator profiles linked to Arcanea accounts
- Verifiable creative history and reputation
- Cross-platform identity portability

### Creative Works as NFTs
- Compressed NFTs via Bubblegum v2 (millions of works at negligible cost)
- Rich metadata aligned with Arcanea's Five Elements and Ten Gates taxonomy
- Collection-level grouping by Academy House, Element, or Guardian

### IP Protection & Licensing
- Story Protocol integration for programmable IP
- Automated licensing terms embedded in NFT metadata
- Royalty splits and revenue sharing on-chain
- Derivative work tracking and attribution chains

### AI Agent Operations
- ElizaOS agents managing creator portfolios
- Automated minting, listing, and IP registration
- Guardian-aligned agent personalities (aligned with Arcanea lore)

### Accessible Onboarding
- Crossmint for credit card purchases (no crypto wallet required)
- Custodial wallets for new users, self-custody migration path
- Thirdweb embedded wallets and auth

---

## Project Status

> **Architecture & Strategy Phase** — No production code yet.

This repository currently contains research, architecture documents, and strategic planning for the on-chain layer. Implementation will begin once the core Arcanea platform SDK (`@arcanea/core`, `@arcanea/mcp`) reaches stable release.

### Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **0 — Research** | Stack evaluation, protocol analysis | Complete |
| **1 — SDK** | `@arcanea/onchain` package, smart contracts | Planned |
| **2 — Identity** | On-chain creator profiles, wallet linking | Planned |
| **3 — Minting** | Compressed NFT pipeline, metadata schema | Planned |
| **4 — IP Layer** | Story Protocol integration, licensing | Planned |
| **5 — Agents** | ElizaOS autonomous operations | Planned |

---

## Arcanea Ecosystem

| Repository | Purpose |
|-----------|---------|
| [**Arcanea**](https://github.com/frankxai/Arcanea) | Monorepo — core SDK, CLI, MCP server, platform |
| [**Arcanea Realm**](https://github.com/frankxai/arcanea-realm) | Standalone AI CLI (OpenCode fork with Guardian intelligence) |
| [**Arcanea Vault**](https://github.com/frankxai/arcanea-vault) | Chrome extension — export AI conversations, images, and prompts from any platform |
| [**Starlight Intelligence System**](https://github.com/frankxai/Starlight-Intelligence-System) | Persistent context and memory layer for AI agents |
| [**Arcanea On-Chain**](https://github.com/frankxai/arcanea-onchain) | Blockchain IP and creator economy infrastructure (this repo) |

The on-chain layer is designed to work alongside the rest of the ecosystem:

- **Arcanea Vault** captures creative works from AI tools — Arcanea On-Chain mints them as permanent, ownable NFTs
- **Arcanea Realm** generates creative content — On-Chain provides IP registration for that output
- **Arcanea platform** (arcanea.ai) surfaces creator portfolios — On-Chain makes those portfolios verifiable and tradeable

## Visual Ecosystem

See root monorepo [.github/ARCANEA_VISUAL_ECOSYSTEM.md](https://github.com/frankxai/arcanea/blob/main/.github/ARCANEA_VISUAL_ECOSYSTEM.md) and plan for full god-mode assets (heroes, web3 previews, ecosystem map). All per DESIGN/TASTE/VISUAL_DOCTRINE.

## Contributing

This project is in early architecture phase. If you're interested in the intersection of AI, creator tools, and blockchain infrastructure, open an issue or reach out.

## License

[MIT](LICENSE) — Build freely. Create boldly. Own what you make.

---

<p align="center">
  <em>Part of the <a href="https://arcanea.ai">Arcanea</a> universe — a living mythology for the age of AI-human co-creation.</em>
</p>
