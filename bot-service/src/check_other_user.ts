import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const USER = '0x7D4805026aA980E25631BD3d700025129A8f7B57';
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
  ],
  stateMutability: 'view',
  type: 'function'
}] as const;

async function main() {
  console.log('=== CHECKING OTHER USER\'S POSITIONS ===\n');
  console.log('User:', USER);
  console.log('Vault:', V8_VAULT);

  // Check WETH position in vault
  console.log('\n📊 VAULT\'S VIEW:');
  try {
    const wethPos = await client.readContract({
      address: V8_VAULT as `0x${string}`,
      abi: POSITION_ABI,
      functionName: 'getPosition',
      args: [USER as `0x${string}`, WETH as `0x${string}`]
    });
    console.log('WETH Position:');
    console.log('  Active:', wethPos.isActive);
    console.log('  Collateral:', '$' + formatUnits(wethPos.collateral, 6));
    console.log('  Is Long:', wethPos.isLong);
    if (wethPos.timestamp > 0n) {
      console.log('  Timestamp:', new Date(Number(wethPos.timestamp) * 1000).toISOString());
    }
  } catch (e) {
    console.log('WETH: Could not read position');
  }

  try {
    const wbtcPos = await client.readContract({
      address: V8_VAULT as `0x${string}`,
      abi: POSITION_ABI,
      functionName: 'getPosition',
      args: [USER as `0x${string}`, WBTC as `0x${string}`]
    });
    console.log('\nWBTC Position:');
    console.log('  Active:', wbtcPos.isActive);
    console.log('  Collateral:', '$' + formatUnits(wbtcPos.collateral, 6));
    console.log('  Is Long:', wbtcPos.isLong);
    if (wbtcPos.timestamp > 0n) {
      console.log('  Timestamp:', new Date(Number(wbtcPos.timestamp) * 1000).toISOString());
    }
  } catch (e) {
    console.log('WBTC: Could not read position');
  }

  // Check GMX actual positions
  console.log('\n📊 GMX ACTUAL:');

  const gmxWethLong = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WETH as `0x${string}`, true]
  });
  console.log('GMX WETH LONG:', gmxWethLong[0] > 0n ? 'EXISTS' : 'none');

  const gmxWethShort = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WETH as `0x${string}`, false]
  });
  console.log('GMX WETH SHORT:', gmxWethShort[0] > 0n ? 'EXISTS' : 'none');

  const gmxWbtcLong = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WBTC as `0x${string}`, true]
  });
  console.log('GMX WBTC LONG:', gmxWbtcLong[0] > 0n ? 'EXISTS' : 'none');

  const gmxWbtcShort = await client.readContract({
    address: GMX_VAULT as `0x${string}`,
    abi: GMX_POSITION_ABI,
    functionName: 'getPosition',
    args: [V8_VAULT as `0x${string}`, USDC as `0x${string}`, WBTC as `0x${string}`, false]
  });
  console.log('GMX WBTC SHORT:', gmxWbtcShort[0] > 0n ? 'EXISTS' : 'none');

  console.log('\n=== DIAGNOSIS ===');
  console.log('If vault shows positions as "active" but GMX shows "none",');
  console.log('we can use cancelStuckPosition() to refund the collateral.');
}

main().catch(console.error);
