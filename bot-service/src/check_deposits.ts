import { createPublicClient, http, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';

const V7_VAULT = '0x9879792a47725d5b18633e1395BC4a7A06c750df';
const USER = '0xa7f2e98701896edd6944b57f2f371938c577cde5';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function main() {
  console.log('=== DEPOSIT HISTORY ===\n');

  // Get all USDC transfers FROM user TO vault (deposits)
  const deposits = await client.getLogs({
    address: USDC as `0x${string}`,
    event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
    args: {
      from: USER as `0x${string}`,
      to: V7_VAULT as `0x${string}`
    },
    fromBlock: BigInt(280000000),
    toBlock: 'latest'
  });

  console.log('Found ' + deposits.length + ' deposits:\n');

  let totalDeposited = 0;
  for (const log of deposits) {
    const args = log.args as any;
    const amount = Number(args.value) / 1e6;
    totalDeposited += amount;
    console.log('Block ' + log.blockNumber + ': +$' + amount.toFixed(2) + ' deposited');
  }

  console.log('\n=== TOTAL DEPOSITED: $' + totalDeposited.toFixed(2) + ' ===');
  console.log('=== CURRENT BALANCE: $53.40 ===');
  console.log('=== REAL P/L: $' + (53.40 - totalDeposited).toFixed(2) + ' ===');
}

main().catch(console.error);
