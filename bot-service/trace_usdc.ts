import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

const VAULT = '0x7dE97f35887b2623dCad2ebA68197f58F7607854' as const;
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A' as const;
const GMX_ROUTER = '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064' as const;
const GMX_POS_ROUTER = '0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868' as const;

const client = createPublicClient({ chain: arbitrum, transport: http('https://arb1.arbitrum.io/rpc') });

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

async function trace() {
  const startBlock = 290000000n;
  const latestBlock = await client.getBlockNumber();

  console.log('=== ALL USDC TRANSFERS INVOLVING VAULT ===');
  console.log('(chronological order)');
  console.log('');

  const [inbound, outbound] = await Promise.all([
    client.getLogs({
      address: USDC,
      event: transferEvent,
      args: { to: VAULT },
      fromBlock: startBlock,
      toBlock: latestBlock
    }),
    client.getLogs({
      address: USDC,
      event: transferEvent,
      args: { from: VAULT },
      fromBlock: startBlock,
      toBlock: latestBlock
    })
  ]);

  const allTransfers = [
    ...inbound.map(l => ({ ...l, direction: 'IN' as const })),
    ...outbound.map(l => ({ ...l, direction: 'OUT' as const }))
  ].sort((a, b) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)));

  let runningBalance = 0n;

  for (const log of allTransfers) {
    const amount = log.args.value ?? 0n;
    const from = log.args.from ?? '';
    const to = log.args.to ?? '';

    if (log.direction === 'IN') {
      runningBalance += amount;
    } else {
      runningBalance -= amount;
    }

    const block = await client.getBlock({ blockNumber: log.blockNumber! });
    const date = new Date(Number(block.timestamp) * 1000).toISOString().slice(0, 19);

    let counterparty = '';
    const addr = log.direction === 'IN' ? from : to;
    if (addr.toLowerCase() === GMX_VAULT.toLowerCase()) counterparty = 'GMX_VAULT';
    else if (addr.toLowerCase() === GMX_ROUTER.toLowerCase()) counterparty = 'GMX_ROUTER';
    else if (addr.toLowerCase() === GMX_POS_ROUTER.toLowerCase()) counterparty = 'GMX_POS_ROUTER';
    else if (addr.toLowerCase() === '0x7d4805026aa980e25631bd3d700025129a8f7b57') counterparty = 'USER_7d48';
    else counterparty = addr.slice(0, 10) + '...';

    console.log(
      date,
      '|',
      log.direction === 'IN' ? ' IN' : 'OUT',
      '|',
      (log.direction === 'IN' ? '+' : '-') + formatUnits(amount, 6).padStart(12),
      'USDC |',
      counterparty.padEnd(14),
      '| Balance:', formatUnits(runningBalance, 6).padStart(10),
      '| TX:', (log.transactionHash ?? '').slice(0, 12) + '...'
    );
  }

  console.log('');
  console.log('=== SUMMARY ===');

  let totalFromUsers = 0n;
  let totalToUsers = 0n;
  let totalToGmx = 0n;
  let totalFromGmx = 0n;

  for (const log of allTransfers) {
    const amount = log.args.value ?? 0n;
    const from = log.args.from ?? '';
    const to = log.args.to ?? '';
    const addr = log.direction === 'IN' ? from : to;
    const isGmx = [GMX_VAULT, GMX_ROUTER, GMX_POS_ROUTER].some(g => addr.toLowerCase() === g.toLowerCase());

    if (log.direction === 'IN' && !isGmx) totalFromUsers += amount;
    if (log.direction === 'OUT' && !isGmx) totalToUsers += amount;
    if (log.direction === 'OUT' && isGmx) totalToGmx += amount;
    if (log.direction === 'IN' && isGmx) totalFromGmx += amount;
  }

  console.log('From users (deposits):    +' + formatUnits(totalFromUsers, 6) + ' USDC');
  console.log('To users (withdrawals):   -' + formatUnits(totalToUsers, 6) + ' USDC');
  console.log('To GMX (position opens):  -' + formatUnits(totalToGmx, 6) + ' USDC');
  console.log('From GMX (position close):+' + formatUnits(totalFromGmx, 6) + ' USDC');
  console.log('');
  console.log('Net from GMX: ' + formatUnits(totalFromGmx - totalToGmx, 6) + ' USDC (negative = trading losses)');
  console.log('Final vault balance: ' + formatUnits(runningBalance, 6) + ' USDC');

  // 2. Check PositionClosed events
  console.log('');
  console.log('=== POSITION CLOSED EVENTS (what contract THINKS happened) ===');
  const posClosedEvent = parseAbiItem('event PositionClosed(address indexed user, address indexed token, int256 pnl, string reason)');
  const closedEvents = await client.getLogs({
    address: VAULT,
    event: posClosedEvent,
    fromBlock: startBlock,
    toBlock: latestBlock
  });

  let totalCreditedPnl = 0n;
  for (const log of closedEvents) {
    const block = await client.getBlock({ blockNumber: log.blockNumber! });
    const date = new Date(Number(block.timestamp) * 1000).toISOString().slice(0, 19);
    const pnl = log.args.pnl ?? 0n;
    console.log(date, '| P/L:', formatUnits(pnl, 6).padStart(12), 'USDC |', log.args.reason);
    totalCreditedPnl += pnl;
  }
  console.log('Total P/L credited by contract:', formatUnits(totalCreditedPnl, 6), 'USDC');

  console.log('');
  console.log('=== THE DISCREPANCY ===');
  const actualGmxPnl = totalFromGmx - totalToGmx;
  console.log('Actual GMX P/L (USDC in - out):', formatUnits(actualGmxPnl, 6), 'USDC');
  console.log('Contract P/L (what it credited):', formatUnits(totalCreditedPnl, 6), 'USDC');
  console.log('DISCREPANCY:', formatUnits(totalCreditedPnl - actualGmxPnl, 6), 'USDC');
  console.log('(positive = contract credited MORE than GMX actually returned = PHANTOM PROFIT)');
}

trace().catch(e => console.error('ERROR:', e));
