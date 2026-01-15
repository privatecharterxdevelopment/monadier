import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

const USER = '0xa7F2e98701896eDD6944b57f2F371938c577cdE5';
const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const POSITION_ABI = [{
  inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }],
  name: 'getPosition',
  outputs: [{
    components: [
      { name: 'isActive', type: 'bool' },
      { name: 'isLong', type: 'bool' },
      { name: 'token', type: 'address' },
      { name: 'collateral', type: 'uint256' },
      { name: 'size', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'stopLoss', type: 'uint256' },
      { name: 'takeProfit', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'requestKey', type: 'bytes32' },
      { name: 'highestPrice', type: 'uint256' },
      { name: 'lowestPrice', type: 'uint256' },
      { name: 'trailingSlBps', type: 'uint256' },
      { name: 'trailingActivated', type: 'bool' },
      { name: 'autoFeaturesEnabled', type: 'bool' }
    ],
    type: 'tuple'
  }],
  stateMutability: 'view',
  type: 'function'
}] as const;

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
  console.log('=== V8 CALLBACK BUG VAULT - RECOVERY ANALYSIS ===\n');

  // Check vault positions
  console.log('📊 VAULT\'S VIEW OF YOUR POSITIONS:\n');

  const wethPos = await client.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: POSITION_ABI,
    functionName: 'getPosition',
    args: [USER as `0x${string}`, WETH as `0x${string}`]
  });

  console.log('WETH Position (in vault):');
  console.log('  Active:', wethPos.isActive);
  console.log('  Collateral:', '$' + formatUnits(wethPos.collateral, 6));
  console.log('  Size:', '$' + formatUnits(wethPos.size, 30));
  console.log('  Is Long:', wethPos.isLong);
  console.log('  Timestamp:', new Date(Number(wethPos.timestamp) * 1000).toISOString());

  const wbtcPos = await client.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: POSITION_ABI,
    functionName: 'getPosition',
    args: [USER as `0x${string}`, WBTC as `0x${string}`]
  });

  console.log('\nWBTC Position (in vault):');
  console.log('  Active:', wbtcPos.isActive);
  console.log('  Collateral:', '$' + formatUnits(wbtcPos.collateral, 6));

  // Now check GMX directly - does GMX still have these positions?
  console.log('\n\n📊 GMX\'S ACTUAL POSITIONS (on-chain reality):\n');

  // WETH SHORT (isLong = false)
  const gmxWethShort = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WETH as `0x${string}`, false]
  });
  console.log('GMX WETH SHORT:');
  console.log('  Size:', '$' + formatUnits(gmxWethShort[0], 30));
  console.log('  Collateral:', '$' + formatUnits(gmxWethShort[1], 30));
  console.log('  GMX Position EXISTS:', gmxWethShort[0] > 0n);

  // WETH LONG
  const gmxWethLong = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WETH as `0x${string}`, true]
  });
  console.log('\nGMX WETH LONG:');
  console.log('  Size:', '$' + formatUnits(gmxWethLong[0], 30));
  console.log('  GMX Position EXISTS:', gmxWethLong[0] > 0n);

  // WBTC SHORT
  const gmxWbtcShort = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WBTC as `0x${string}`, false]
  });
  console.log('\nGMX WBTC SHORT:');
  console.log('  Size:', '$' + formatUnits(gmxWbtcShort[0], 30));
  console.log('  GMX Position EXISTS:', gmxWbtcShort[0] > 0n);

  // WBTC LONG
  const gmxWbtcLong = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WBTC as `0x${string}`, true]
  });
  console.log('\nGMX WBTC LONG:');
  console.log('  Size:', '$' + formatUnits(gmxWbtcLong[0], 30));
  console.log('  GMX Position EXISTS:', gmxWbtcLong[0] > 0n);

  // Summary
  console.log('\n\n=== DIAGNOSIS ===\n');

  const vaultThinksPosActive = wethPos.isActive || wbtcPos.isActive;
  const gmxHasRealPos = gmxWethShort[0] > 0n || gmxWethLong[0] > 0n || gmxWbtcShort[0] > 0n || gmxWbtcLong[0] > 0n;

  if (vaultThinksPosActive && !gmxHasRealPos) {
    console.log('✅ GHOST POSITIONS DETECTED!');
    console.log('   Vault thinks positions are active, but GMX closed them.');
    console.log('   → Use cancelStuckPosition() or reconcile() to clear them');
  } else if (vaultThinksPosActive && gmxHasRealPos) {
    console.log('⚠️  REAL POSITIONS EXIST ON GMX');
    console.log('   These need to be closed via GMX first');
  } else {
    console.log('✅ No stuck positions');
  }

  // Check position timeout
  const POSITION_TIMEOUT = 2 * 60 * 60; // 2 hours
  const now = Math.floor(Date.now() / 1000);

  if (wethPos.isActive) {
    const age = now - Number(wethPos.timestamp);
    console.log(`\nWETH Position age: ${Math.floor(age / 3600)} hours`);
    console.log(`Can cancel: ${age > POSITION_TIMEOUT ? 'YES ✅' : 'NO (wait ' + Math.ceil((POSITION_TIMEOUT - age) / 60) + ' min)'}`);
  }
}

main().catch(console.error);
