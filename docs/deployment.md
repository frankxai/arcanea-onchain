# Deployment Guide

> Deployment and operations guide for Arcanea On-Chain.

## Environments

| Environment | Solana Cluster | EVM Network | Purpose |
|------------|----------------|-------------|---------|
| Local | localhost | Anvil | Development and testing |
| Devnet | Solana Devnet | Base Sepolia | Staging and integration |
| Mainnet | Solana Mainnet | Base Mainnet | Production |

## Deployment Steps

### Solana Programs

```bash
# Build programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet (requires funded wallet)
anchor deploy --provider.cluster mainnet
```

### EVM Contracts

```bash
# Build contracts
forge build

# Deploy to Base Sepolia
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast

# Deploy to Base Mainnet
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
```

*Full deployment runbook coming in Phase 1.*
