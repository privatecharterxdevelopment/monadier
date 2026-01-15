import { createPublicClient, http, formatUnits, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';

const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function main() {
  console.log('=== CHECKING ALL VAULT EVENTS ===\n');

  // Get all Deposit events
  const depositEvent = parseAbiItem('event Deposit(address indexed user, uint256 amount)');
  const deposits = await client.getLogs({
    address: V8_VAULT as `0x${string}`,
    event: depositEvent,
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('📥 DEPOSITS:');
  let totalDeposited = 0n;
  for (const log of deposits) {
    const amount = log.args.amount as bigint;
    totalDeposited += amount;
    console.log(`   ${log.args.user}: $${formatUnits(amount, 6)}`);
  }
  console.log(`   TOTAL DEPOSITED: $${formatUnits(totalDeposited, 6)}\n`);

  // Get all Withdraw events
  const withdrawEvent = parseAbiItem('event Withdraw(address indexed user, uint256 amount)');
  const withdraws = await client.getLogs({
    address: V8_VAULT as `0x${string}`,
    event: withdrawEvent,
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('📤 WITHDRAWS:');
  let totalWithdrawn = 0n;
  for (const log of withdraws) {
    const amount = log.args.amount as bigint;
    totalWithdrawn += amount;
    console.log(`   ${log.args.user}: $${formatUnits(amount, 6)}`);
  }
  console.log(`   TOTAL WITHDRAWN: $${formatUnits(totalWithdrawn, 6)}\n`);

  // Get PositionOpened events
  const posOpenEvent = parseAbiItem('event PositionOpened(address indexed user, address indexed token, bool isLong, uint256 collateral, uint256 leverage)');
  const posOpened = await client.getLogs({
    address: V8_VAULT as `0x${string}`,
    event: posOpenEvent,
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('📈 POSITIONS OPENED:');
  let totalCollateralUsed = 0n;
  for (const log of posOpened) {
    const collateral = log.args.collateral as bigint;
    totalCollateralUsed += collateral;
    console.log(`   ${log.args.user}: $${formatUnits(collateral, 6)} @ ${log.args.leverage}x (${log.args.isLong ? 'LONG' : 'SHORT'})`);
  }
  console.log(`   TOTAL COLLATERAL USED: $${formatUnits(totalCollateralUsed, 6)}\n`);

  // Get PositionClosed events
  const posCloseEvent = parseAbiItem('event PositionClosed(address indexed user, address indexed token, int256 pnl, string reason)');
  const posClosed = await client.getLogs({
    address: V8_VAULT as `0x${string}`,
    event: posCloseEvent,
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('📉 POSITIONS CLOSED:');
  for (const log of posClosed) {
    const pnl = log.args.pnl as bigint;
    console.log(`   ${log.args.user}: PnL $${formatUnits(pnl, 6)} (${log.args.reason})`);
  }
  console.log('');

  // Get PositionCancelled events
  const posCancelEvent = parseAbiItem('event PositionCancelled(address indexed user, address indexed token, uint256 refundAmount)');
  const posCancelled = await client.getLogs({
    address: V8_VAULT as `0x${string}`,
    event: posCancelEvent,
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('🚫 POSITIONS CANCELLED (refunded):');
  let totalRefunded = 0n;
  for (const log of posCancelled) {
    const refund = log.args.refundAmount as bigint;
    totalRefunded += refund;
    console.log(`   ${log.args.user}: $${formatUnits(refund, 6)}`);
  }
  console.log(`   TOTAL REFUNDED: $${formatUnits(totalRefunded, 6)}\n`);

  // Get USDC transfers TO the vault (returns from GMX)
  const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
  const transfers = await client.getLogs({
    address: USDC as `0x${string}`,
    event: transferEvent,
    args: {
      to: V8_VAULT as `0x${string}`
    },
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log('💵 USDC TRANSFERS TO VAULT:');
  let totalTransfersIn = 0n;
  for (const log of transfers) {
    const value = log.args.value as bigint;
    totalTransfersIn += value;
    console.log(`   From ${(log.args.from as string).slice(0, 10)}...: $${formatUnits(value, 6)}`);
  }
  console.log(`   TOTAL USDC RECEIVED: $${formatUnits(totalTransfersIn, 6)}\n`);

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Total Deposited: $${formatUnits(totalDeposited, 6)}`);
  console.log(`Total Withdrawn: $${formatUnits(totalWithdrawn, 6)}`);
  console.log(`Total USDC Transfers In: $${formatUnits(totalTransfersIn, 6)}`);
  console.log(`Net: $${formatUnits(totalDeposited - totalWithdrawn, 6)} (deposits - withdrawals)`);
}

main().catch(console.error);
