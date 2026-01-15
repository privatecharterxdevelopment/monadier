import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const VAULT_ABI = [
  { inputs: [], name: 'tvl', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'fees', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'treasury', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getHealthStatus', outputs: [
    { name: 'realBalance', type: 'uint256' },
    { name: 'totalValueLocked', type: 'uint256' },
    { name: 'accumulatedFees', type: 'uint256' },
    { name: 'isSolvent', type: 'bool' },
    { name: 'surplus', type: 'int256' }
  ], stateMutability: 'view', type: 'function' },
] as const;

const ERC20_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }
] as const;

async function main() {
  console.log('=== V8 CALLBACK BUG VAULT - FULL ANALYSIS ===\n');

  // Contract USDC balance
  const contractUSDC = await client.readContract({
    address: USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [V8_VAULT as `0x${string}`]
  });
  console.log('💰 Contract USDC Balance: $' + formatUnits(contractUSDC, 6));

  // TVL
  const tvl = await client.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'tvl'
  });
  console.log('📊 TVL (user deposits): $' + formatUnits(tvl, 6));

  // Fees
  const fees = await client.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'fees'
  });
  console.log('💸 Accumulated Fees: $' + formatUnits(fees, 6));

  // Health
  const health = await client.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getHealthStatus'
  });
  console.log('\n🏥 Health Status:');
  console.log('   Real Balance: $' + formatUnits(health[0], 6));
  console.log('   TVL: $' + formatUnits(health[1], 6));
  console.log('   Fees: $' + formatUnits(health[2], 6));
  console.log('   Solvent: ' + health[3]);
  console.log('   Surplus: $' + formatUnits(health[4], 6));

  // Owner & Treasury
  const owner = await client.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'owner'
  });
  const treasury = await client.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'treasury'
  });
  console.log('\n👑 Owner: ' + owner);
  console.log('🏦 Treasury: ' + treasury);

  // Calculate where $76 is
  console.log('\n=== BREAKDOWN ===');
  const expectedTotal = tvl + fees;
  console.log('TVL + Fees = $' + formatUnits(expectedTotal, 6));
  console.log('Contract has = $' + formatUnits(contractUSDC, 6));

  const surplus = contractUSDC - expectedTotal;
  if (surplus > 0n) {
    console.log('\n✅ SURPLUS: $' + formatUnits(surplus, 6));
    console.log('   This surplus can be recovered by owner via recoverStuckTokens()');
  } else {
    console.log('\n❌ DEFICIT: $' + formatUnits(-surplus, 6));
  }

  // The real question: where did the ~$76 come from?
  console.log('\n=== WHERE IS THE $76? ===');
  console.log('TVL shows $' + formatUnits(tvl, 6) + ' in user balances');
  console.log('But contract has $' + formatUnits(contractUSDC, 6));
  console.log('');
  console.log('The extra funds ($' + formatUnits(contractUSDC - tvl, 6) + ') are likely:');
  console.log('1. Accumulated platform fees ($' + formatUnits(fees, 6) + ')');
  console.log('2. Returned GMX collateral that was never credited to users');
}

main().catch(console.error);
