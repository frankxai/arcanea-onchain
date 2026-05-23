# arcanea-onchain — Codex Instructions

Read `AGENTS.md`, `CLAUDE.md`, and `.agent-harness.json` first.

This repo touches wallet, contract, chain, and signing behavior. Treat changes as security-sensitive.

## Guardrails

1. Never expose, generate, log, or commit seed phrases, private keys, API keys, signing payload secrets, or wallet credentials.
2. Do not change contract addresses, chain IDs, signing domains, ABI assumptions, or transaction flows without explicit verification.
3. Prefer typed validation and dry-run/testnet paths for transaction code.
4. Flag any operation that could move funds, mint assets, grant approvals, or change contract ownership.
5. Validate with `pnpm test` when dependencies are installed.

