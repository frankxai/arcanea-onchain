<p align="center">
  <strong>⟡ Arcanea On-Chain</strong><br/>
  <em>Blockchain IP & Creator Economy Infrastructure</em>
</p>

<p align="center">
  <a href="https://arcanea.ai">arcanea.ai</a> · <a href="https://github.com/frankxai/Arcanea">Monorepo</a> · <a href="https://github.com/frankxai/Starlight-Intelligence-System">SIS</a> · <a href="https://github.com/frankxai/arcanea-realm">Arcanea Realm</a>
</p>

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
| [**Starlight Intelligence System**](https://github.com/frankxai/Starlight-Intelligence-System) | Persistent context & memory layer for AI agents |
| [**Arcanea On-Chain**](https://github.com/frankxai/arcanea-onchain) | Blockchain IP & creator economy infrastructure (this repo) |

---

## Contributing

This project is in early architecture phase. If you're interested in the intersection of AI, creator tools, and blockchain infrastructure, open an issue or reach out.

---

## License

[MIT](LICENSE) — Build freely. Create boldly. Own what you make.

---

<p align="center">
  <em>Part of the <a href="https://arcanea.ai">Arcanea</a> universe — a living mythology for the age of AI-human co-creation.</em>
</p>
