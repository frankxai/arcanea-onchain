# arcanea-onchain — Agent Instructions

This repo has no deeper `CLAUDE.md` yet, so this file is the primary agent entry point.

## Repo Role

`arcanea-onchain` contains Arcanea on-chain primitives. Treat contract, wallet, minting, token, and signing behavior as high-risk.

## Work Pattern

1. Inspect package scripts, contract layout, and deployment docs before editing.
2. Never change contract/deployment behavior without explicit verification.
3. Never log or commit private keys, seeds, RPC secrets, or wallet credentials.
4. Do not touch unrelated dirty/untracked files.

## Commands

```bash
pnpm test
pnpm build
git status
```

Use testnets and dry-runs for any deployment-adjacent workflow.

