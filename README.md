# Arcanea Onchain

Private/testnet-first smart-contract workspace for Arcanea, Starlight, FrankX,
software-pack licenses, agent identity certificates, and programmable IP
experiments.

## Current Contracts

- `ClawSkillLicense.sol`: ERC-1155 software access licenses with pull-based
  split payouts and ERC-2981 royalty signaling.
- `AgentIdentityTBA.sol`: ERC-721 agent identity certificates with ERC-6551
  token-bound account creation.
- `StoryIPRegistry.sol`: minimal Story Protocol registration and license-term
  attachment wrapper for already-tokenized creative assets.

## Policy

No mainnet deployment until all are true:

1. Rights model documented.
2. Metadata schema locked.
3. Unit tests pass.
4. Admin and treasury wallets are multisig or otherwise explicitly approved.
5. Security review completed.
6. Legal review completed for any token that references IP, licensing, revenue,
   royalties, partner rights, or commercial use.

Use contracts for access, provenance, collection, and software-pack licensing.
Do not use contracts for fractional catalog ownership, investment products, or
royalty promises.

## Commands

```bash
npm run build
npm run test
npm run typecheck
```

