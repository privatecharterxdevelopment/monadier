/**
 * Call reconcile() to fix the stuck position
 * This credits the user their collateral back
 */

const { createPublicClient, createWalletClient, http, formatUnits } = require('viem');
const { arbitrum } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const V10_VAULT = '0x85d076665f60676511aB4A7bD40D7d415b7296ea';
const USER = '0x7d4805026aa980e25631bd3d700025129a8f7b57';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

// Need a private key to send the transaction - use the bot wallet or any wallet with ETH
const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY;

if (!BOT_PRIVATE_KEY) {
  console.log('ERROR: Set BOT_PRIVATE_KEY environment variable');
  console.log('');
  console.log('Run: BOT_PRIVATE_KEY=0x... node call_reconcile.cjs');
  console.log('');
  console.log('Or have the user call reconcile() themselves via Arbiscan:');
  console.log('1. Go to https://arbiscan.io/address/' + V10_VAULT + '#writeContract');
  console.log('2. Connect wallet');
  console.log('3. Find reconcile() function');
  console.log('4. Enter:');
  console.log('   user: ' + USER);
  console.log('   token: ' + WETH);
  console.log('5. Click Write');
  process.exit(1);
}

const ABI = [
  { inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], name: 'reconcile', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
];

async function main() {
  const account = privateKeyToAccount(BOT_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc')
  });

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc')
  });

  // Check balance before
  const balanceBefore = await publicClient.readContract({
    address: V10_VAULT,
    abi: ABI,
    functionName: 'balances',
    args: [USER]
  });
  console.log('User balance BEFORE reconcile: $' + formatUnits(balanceBefore, 6));

  console.log('\nCalling reconcile(' + USER + ', ' + WETH + ')...');

  const hash = await walletClient.writeContract({
    address: V10_VAULT,
    abi: ABI,
    functionName: 'reconcile',
    args: [USER, WETH],
    gas: 500000n
  });

  console.log('Tx hash:', hash);
  console.log('Waiting for confirmation...');

  await publicClient.waitForTransactionReceipt({ hash });

  // Check balance after
  const balanceAfter = await publicClient.readContract({
    address: V10_VAULT,
    abi: ABI,
    functionName: 'balances',
    args: [USER]
  });
  console.log('\nUser balance AFTER reconcile: $' + formatUnits(balanceAfter, 6));
  console.log('Credited: $' + formatUnits(balanceAfter - balanceBefore, 6));
}

main().catch(console.error);
