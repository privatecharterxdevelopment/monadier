/**
 * Fix user position - reconcile on-chain state with database
 *
 * Problem: Database says position is closed, but on-chain it's still open
 * Solution: Call reconcile() or update database to match on-chain state
 */

const { createPublicClient, createWalletClient, http, formatUnits, parseAbiItem } = require('viem');
const { arbitrum } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const V11_VAULT = '0x7dE97f35887b2623dCad2ebA68197f58F7607854';
const USER = '0x7d4805026aa980e25631bd3d700025129a8f7b57';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

const ABI = [
  { inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], name: 'positions', outputs: [
    { name: 'isActive', type: 'bool' }, { name: 'isLong', type: 'bool' }, { name: 'token', type: 'address' },
    { name: 'collateral', type: 'uint256' }, { name: 'size', type: 'uint256' }, { name: 'leverage', type: 'uint256' },
    { name: 'entryPrice', type: 'uint256' }, { name: 'stopLoss', type: 'uint256' }, { name: 'takeProfit', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' }
  ], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], name: 'reconcile', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'tvl', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
];

async function main() {
  const client = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc')
  });

  console.log('=== DIAGNOSIS ===\n');

  // Check on-chain state
  const balance = await client.readContract({ address: V11_VAULT, abi: ABI, functionName: 'balances', args: [USER] });
  const position = await client.readContract({ address: V11_VAULT, abi: ABI, functionName: 'positions', args: [USER, WETH] });
  const tvl = await client.readContract({ address: V11_VAULT, abi: ABI, functionName: 'tvl' });

  console.log('On-Chain State:');
  console.log('  User Balance: $' + formatUnits(balance, 6));
  console.log('  Position Active:', position[0]);
  console.log('  Position Collateral: $' + formatUnits(position[3], 6));
  console.log('  Position Direction:', position[1] ? 'LONG' : 'SHORT');
  console.log('  Entry Price: $' + formatUnits(position[6], 30));
  console.log('  Vault TVL: $' + formatUnits(tvl, 6));

  console.log('\nDatabase State:');
  console.log('  Position status: CLOSED (according to your query)');

  console.log('\n=== PROBLEM ===');
  console.log('Database says position is CLOSED but on-chain it is STILL ACTIVE');
  console.log('User has $' + formatUnits(position[3], 6) + ' locked in the position');

  console.log('\n=== SOLUTIONS ===');
  console.log('\n1. USER SELF-FIX (Recommended):');
  console.log('   User connects wallet and clicks "Close Position" button in the UI');
  console.log('   This calls userInstantClose() which credits them their collateral');

  console.log('\n2. ADMIN FIX - Call reconcile():');
  console.log('   Anyone can call reconcile(user, token) to sync the position');
  console.log('   This requires the GMX position to actually be closed on GMX side');

  console.log('\n3. DATABASE FIX:');
  console.log('   Update database to reflect on-chain state:');
  console.log(`
   UPDATE positions
   SET status = 'open',
       closed_at = NULL,
       close_reason = NULL,
       exit_price = NULL,
       exit_amount = NULL
   WHERE wallet_address = '${USER.toLowerCase()}'
     AND chain_id = 42161
     AND token_symbol = 'WETH'
     AND status = 'closed'
   ORDER BY created_at DESC
   LIMIT 1;
  `);

  console.log('\n=== CHECKING GMX POSITION ===');

  // Check if there's actually a position on GMX
  const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A';
  const gmxAbi = [{
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
  }];

  const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

  // Check SHORT position (collateral=USDC, index=WETH, isLong=false)
  try {
    const gmxPos = await client.readContract({
      address: GMX_VAULT,
      abi: gmxAbi,
      functionName: 'getPosition',
      args: [V11_VAULT, USDC, WETH, false] // SHORT: USDC collateral, WETH index
    });

    console.log('\nGMX SHORT Position for Vault:');
    console.log('  Size: $' + formatUnits(gmxPos[0], 30));
    console.log('  Collateral: $' + formatUnits(gmxPos[1], 30));

    if (gmxPos[0] === 0n) {
      console.log('\n  GMX position is CLOSED - vault can call reconcile() to credit user');
    } else {
      console.log('\n  GMX position is STILL OPEN - need to close via GMX first');
    }
  } catch (e) {
    console.log('Error checking GMX:', e.message);
  }
}

main().catch(console.error);
