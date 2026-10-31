# MonadierTradingVault Deployment Configuration

## Platform Fee Structure

| Chain | Chain ID | Fee | Why |
|-------|----------|-----|-----|
| **Base** | 8453 | **1.0%** | Lower gas, more volume incentive |
| Ethereum | 1 | 3.5% | High gas costs |
| Polygon | 137 | 3.5% | Standard fee |
| Arbitrum | 42161 | 3.5% | Standard fee |
| BSC | 56 | 3.5% | Standard fee |

**Fee flows to:** `0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c`

---

## Contract Parameters by Chain

### Ethereum Mainnet (Chain ID: 1)
```
USDC:           0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
BOT_ADDRESS:    [TO BE GENERATED - Secure wallet for bot]
UNISWAP_ROUTER: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D (Uniswap V2)
TREASURY:       0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c
WRAPPED_NATIVE: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 (WETH)
```

### BNB Chain (Chain ID: 56)
```
USDC:           0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
BOT_ADDRESS:    [TO BE GENERATED - Secure wallet for bot]
UNISWAP_ROUTER: 0x10ED43C718714eb63d5aA57B78B54704E256024E (PancakeSwap)
TREASURY:       0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c
WRAPPED_NATIVE: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (WBNB)
```

### Arbitrum (Chain ID: 42161)
```
USDC:           0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (Native USDC)
BOT_ADDRESS:    [TO BE GENERATED - Secure wallet for bot]
UNISWAP_ROUTER: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D (Uniswap V2)
TREASURY:       0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c
WRAPPED_NATIVE: 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1 (WETH)
```

### Base (Chain ID: 8453)
```
USDC:           0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (Native USDC)
BOT_ADDRESS:    [TO BE GENERATED - Secure wallet for bot]
UNISWAP_ROUTER: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24 (Uniswap V2)
TREASURY:       0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c
WRAPPED_NATIVE: 0x4200000000000000000000000000000000000006 (WETH)
```

### Polygon (Chain ID: 137)
```
USDC:           0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 (Native USDC)
BOT_ADDRESS:    [TO BE GENERATED - Secure wallet for bot]
UNISWAP_ROUTER: 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff (QuickSwap)
TREASURY:       0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c
WRAPPED_NATIVE: 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270 (WMATIC)
```

---

## Risk Level Configuration

| Level | Basis Points | Percentage | Description |
|-------|-------------|------------|-------------|
| Conservative | 100 | 1% | Very safe, small trades |
| Low | 500 | 5% | Default, balanced |
| Medium | 1500 | 15% | Moderate risk |
| High | 3000 | 30% | Aggressive |
| Maximum | 5000 | 50% | Maximum allowed |

---

## Security Checklist Before Deployment

### Pre-Deployment
- [ ] Generate BOT_ADDRESS using hardware wallet or AWS KMS
- [ ] Store bot private key in secure vault (never in code)
- [ ] Deploy to testnet first (Sepolia, BSC Testnet, etc.)
- [ ] Run integration tests with real DEX
- [ ] Verify contract on block explorer

### Post-Deployment
- [ ] Verify all immutable addresses are correct
- [ ] Test deposit/withdraw with small amount
- [ ] Test auto-trade enable/disable
- [ ] Test risk level changes
- [ ] Test emergency pause/unpause
- [ ] Monitor first few trades closely

---

## Bot Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  - Show vault balance vs wallet balance                         │
│  - Deposit/Withdraw UI                                          │
│  - Risk level slider (1-50%)                                    │
│  - Auto-trade toggle                                            │
│  - AI analysis display                                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND BOT SERVICE                          │
│  - Monitor users with autoTradeEnabled = true                   │
│  - Run AI analysis for each user's selected token               │
│  - Execute trades via smart contract                            │
│  - Rate limit: 1 trade per 30 seconds per user                  │
│  - Max trade: User's risk level % of balance                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SMART CONTRACT (On-Chain)                    │
│  - Holds user funds (USDC only)                                 │
│  - Verifies bot authorization                                   │
│  - Enforces risk limits                                         │
│  - Collects 0.5% fee to treasury                                │
│  - Executes swaps via Uniswap V2                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Gas Estimates (Approximate)

| Function | Gas (ETH) | Gas (L2) |
|----------|-----------|----------|
| deposit | ~80,000 | ~40,000 |
| withdraw | ~60,000 | ~30,000 |
| setAutoTrade | ~45,000 | ~22,000 |
| setRiskLevel | ~45,000 | ~22,000 |
| executeTrade | ~350,000 | ~175,000 |

**Recommendation:** Deploy on Base or Arbitrum for lowest gas costs.

---

## Frontend Integration Code

```typescript
// src/lib/vault.ts
import { parseUnits, formatUnits } from 'viem';

export const VAULT_ABI = [...]; // Import from compiled contract

export const VAULT_ADDRESSES: Record<number, `0x${string}`> = {
  1: '0x...', // Ethereum
  56: '0x...', // BNB
  42161: '0x...', // Arbitrum
  8453: '0x...', // Base
  137: '0x...', // Polygon
};

export async function depositToVault(amount: string, decimals: number = 6) {
  const amountWei = parseUnits(amount, decimals);
  // First approve USDC to vault
  // Then call vault.deposit(amountWei)
}

export async function withdrawFromVault(amount: string, decimals: number = 6) {
  const amountWei = parseUnits(amount, decimals);
  // Call vault.withdraw(amountWei)
}

export async function setAutoTrade(enabled: boolean) {
  // Call vault.setAutoTrade(enabled)
}

export async function setRiskLevel(percent: number) {
  // Convert percent to basis points
  const bps = percent * 100;
  // Call vault.setRiskLevel(bps)
}
```
