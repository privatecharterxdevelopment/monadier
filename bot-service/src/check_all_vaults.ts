import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

// All known Arbitrum vault addresses
const VAULTS = [
  { name: 'V8.3 (Current)', address: '0x4F86688216D560456a594d0C4b8E279dAd464D70' },
  { name: 'V8 (callback bug)', address: '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6' },
  { name: 'V8 Legacy (GMX fix)', address: '0xFA38c191134A6a3382794BE6144D24c3e6D8a4C3' },
  { name: 'V7', address: '0x9879792a47725d5b18633e1395BC4a7A06c750df' },
  { name: 'V7 Original', address: '0x712B3A0cFD00674a15c5D235e998F71709112675' },
] as const;

// USDC address on Arbitrum
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const BALANCE_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const HEALTH_ABI = [
  {
    inputs: [],
    name: 'getHealthStatus',
    outputs: [
      { name: 'realBalance', type: 'uint256' },
      { name: 'totalValueLocked', type: 'uint256' },
      { name: 'accumulatedFees', type: 'uint256' },
      { name: 'isSolvent', type: 'bool' },
      { name: 'surplus', type: 'int256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'tvl',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'fees',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function main() {
  console.log('=== CHECKING ALL ARBITRUM VAULTS ===\n');

  // Check each vault's USDC balance and TVL
  for (const vault of VAULTS) {
    console.log(`\n📦 ${vault.name}`);
    console.log(`   Address: ${vault.address}`);

    try {
      // Get contract's actual USDC balance
      const usdcBalance = await client.readContract({
        address: USDC as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [vault.address as `0x${string}`]
      });
      console.log(`   💰 Contract USDC: $${formatUnits(usdcBalance, 6)}`);

      // Try to get TVL
      try {
        const tvl = await client.readContract({
          address: vault.address as `0x${string}`,
          abi: HEALTH_ABI,
          functionName: 'tvl'
        });
        console.log(`   📊 TVL: $${formatUnits(tvl, 6)}`);
      } catch {
        // Try getHealthStatus
        try {
          const health = await client.readContract({
            address: vault.address as `0x${string}`,
            abi: HEALTH_ABI,
            functionName: 'getHealthStatus'
          });
          console.log(`   📊 TVL: $${formatUnits(health[1], 6)}`);
          console.log(`   💸 Fees: $${formatUnits(health[2], 6)}`);
          console.log(`   ✅ Solvent: ${health[3]}`);
          console.log(`   📈 Surplus: $${formatUnits(health[4], 6)}`);
        } catch {
          console.log(`   📊 TVL: (no tvl function)`);
        }
      }

      // Check if contract has any USDC stuck
      if (usdcBalance > 0n) {
        console.log(`   ⚠️  HAS FUNDS: $${formatUnits(usdcBalance, 6)} USDC in contract`);
      }

    } catch (e: any) {
      console.log(`   ❌ Error: ${e.message?.slice(0, 60) || 'Unknown error'}`);
    }
  }

  // Now check user balances - need a wallet address
  // Check a few known addresses from the codebase
  const WALLETS_TO_CHECK = [
    '0xa7f2e98701896edd6944b57f2f371938c577cde5', // From check_real_balance.ts
    '0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c', // Treasury
  ];

  console.log('\n\n=== CHECKING USER BALANCES ===');

  for (const wallet of WALLETS_TO_CHECK) {
    console.log(`\n👤 Wallet: ${wallet}`);

    for (const vault of VAULTS) {
      try {
        const balance = await client.readContract({
          address: vault.address as `0x${string}`,
          abi: BALANCE_ABI,
          functionName: 'balances',
          args: [wallet as `0x${string}`]
        });

        if (balance > 0n) {
          console.log(`   💰 ${vault.name}: $${formatUnits(balance, 6)} STUCK!`);
        }
      } catch {
        // Vault might not have balances function
      }
    }
  }

  console.log('\n\n=== DONE ===');
}

main().catch(console.error);
