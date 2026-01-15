import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

const V7_VAULT = '0x9879792a47725d5b18633e1395BC4a7A06c750df';
const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const GMX_POSITION_ABI = [{
  inputs: [
    { name: '_account', type: 'address' },
    { name: '_collateralToken', type: 'address' },
    { name: '_indexToken', type: 'address' },
    { name: '_isLong', type: 'bool' }
  ],
  name: 'getPosition',
  outputs: [
    { name: 'size', type: 'uint256' },
    { name: 'collateral', type: 'uint256' },
    { name: 'averagePrice', type: 'uint256' },
    { name: 'entryFundingRate', type: 'uint256' },
    { name: 'reserveAmount', type: 'uint256' },
    { name: 'realisedPnl', type: 'int256' },
    { name: 'lastIncreasedTime', type: 'uint256' }
  ],
  stateMutability: 'view',
  type: 'function'
}] as const;

async function main() {
  console.log('=== CHECKING V7 VAULT POSITIONS ON GMX ===\n');
  console.log('V7 Vault:', V7_VAULT);

  // Check all possible positions
  const positions = [
    { token: WETH, name: 'WETH', isLong: true },
    { token: WETH, name: 'WETH', isLong: false },
    { token: WBTC, name: 'WBTC', isLong: true },
    { token: WBTC, name: 'WBTC', isLong: false },
  ];

  let totalCollateral = 0n;

  for (const pos of positions) {
    const result = await client.readContract({
      address: GMX_VAULT as `0x${string}`,
      abi: GMX_POSITION_ABI,
      functionName: 'getPosition',
      args: [V7_VAULT as `0x${string}`, USDC as `0x${string}`, pos.token as `0x${string}`, pos.isLong]
    });

    const size = result[0];
    const collateral = result[1];

    if (size > 0n || collateral > 0n) {
      console.log(`\n🔥 ${pos.name} ${pos.isLong ? 'LONG' : 'SHORT'} - ACTIVE!`);
      console.log(`   Size: $${formatUnits(size, 30)}`);
      console.log(`   Collateral: $${formatUnits(collateral, 30)}`);
      totalCollateral += collateral;
    } else {
      console.log(`${pos.name} ${pos.isLong ? 'LONG' : 'SHORT'}: none`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('Total collateral stuck in GMX:', '$' + formatUnits(totalCollateral, 30));

  if (totalCollateral > 0n) {
    console.log('\n⚠️  There ARE funds stuck in GMX positions!');
    console.log('   Need to close these positions to recover the funds.');
  } else {
    console.log('\n❌ No active GMX positions found for V7 vault.');
    console.log('   Funds may have been liquidated or already returned.');
  }
}

main().catch(console.error);
