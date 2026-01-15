import { createPublicClient, http, formatUnits, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';

const V7_VAULT = '0x9879792a47725d5b18633e1395BC4a7A06c750df';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USER = '0xa7F2e98701896eDD6944b57f2F371938c577cdE5';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function main() {
  console.log('=== TRACING V7 VAULT FUND FLOW ===\n');
  console.log('V7 Vault:', V7_VAULT);
  console.log('User:', USER);

  // Get all USDC transfers TO the vault
  const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

  const transfersIn = await client.getLogs({
    address: USDC as `0x${string}`,
    event: transferEvent,
    args: { to: V7_VAULT as `0x${string}` },
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('\n📥 USDC IN (to vault):');
  let totalIn = 0n;
  for (const log of transfersIn) {
    const value = log.args.value as bigint;
    totalIn += value;
    const from = log.args.from as string;
    console.log(`   ${from.slice(0,10)}... → $${formatUnits(value, 6)}`);
  }
  console.log(`   TOTAL IN: $${formatUnits(totalIn, 6)}`);

  // Get all USDC transfers FROM the vault
  const transfersOut = await client.getLogs({
    address: USDC as `0x${string}`,
    event: transferEvent,
    args: { from: V7_VAULT as `0x${string}` },
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('\n📤 USDC OUT (from vault):');
  let totalOut = 0n;
  for (const log of transfersOut) {
    const value = log.args.value as bigint;
    totalOut += value;
    const to = log.args.to as string;
    console.log(`   → ${to.slice(0,10)}... $${formatUnits(value, 6)}`);
  }
  console.log(`   TOTAL OUT: $${formatUnits(totalOut, 6)}`);

  console.log('\n=== BALANCE ===');
  console.log(`In:  $${formatUnits(totalIn, 6)}`);
  console.log(`Out: $${formatUnits(totalOut, 6)}`);
  console.log(`Net: $${formatUnits(totalIn - totalOut, 6)}`);

  // Current contract balance
  const currentBalance = await client.readContract({
    address: USDC as `0x${string}`,
    abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balanceOf',
    args: [V7_VAULT as `0x${string}`]
  });
  console.log(`\nCurrent contract USDC: $${formatUnits(currentBalance, 6)}`);

  if (totalIn - totalOut !== currentBalance) {
    console.log('⚠️  Mismatch! Some funds unaccounted for.');
  }
}

main().catch(console.error);
