import { createPublicClient, http, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';

const GMX_ADMIN = '0xB4d2603B2494103C90B2c607261DD85484b49eF0';
const GMX_POSITION_ROUTER = '0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868';
const USER = '0xa7f2e98701896edd6944b57f2f371938c577cde5';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function checkRecovery() {
  console.log('=== GMX RECOVERY MONITOR ===');
  console.log('Checking for recovery...\n');
  
  // Check user USDC balance
  const userUsdcBefore = await client.readContract({
    address: USDC,
    abi: [{ inputs: [{ name: '', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balanceOf',
    args: [USER]
  });
  
  // Check GMX Router balance
  const gmxBalance = await client.readContract({
    address: USDC,
    abi: [{ inputs: [{ name: '', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balanceOf',
    args: [GMX_POSITION_ROUTER]
  });
  
  console.log('User USDC balance:', (Number(userUsdcBefore) / 1e6).toFixed(2));
  console.log('GMX Router USDC (stuck):', (Number(gmxBalance) / 1e6).toFixed(2));
  
  // Check for recent USDC transfers TO user from GMX
  const recentTransfers = await client.getLogs({
    address: USDC,
    event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
    args: { from: GMX_POSITION_ROUTER, to: USER },
    fromBlock: BigInt((await client.getBlockNumber()) - BigInt(10000)),
    toBlock: 'latest'
  });
  
  if (recentTransfers.length > 0) {
    console.log('\n🎉 RECOVERY DETECTED! Found transfers from GMX to user:');
    for (const tx of recentTransfers) {
      console.log('  TX:', tx.transactionHash);
      console.log('  Amount: $' + (Number((tx.args as any).value) / 1e6).toFixed(2));
    }
  } else {
    console.log('\n⏳ No recovery yet. Waiting for GMX Admin...');
    console.log('');
    console.log('Our messages to admin:');
    console.log('TX1: https://arbiscan.io/tx/0x4e988f5541d41d45cf605a3b76d5deb7c7e6cc068d035bd0d5faa9789e746bc6');
    console.log('TX2: https://arbiscan.io/tx/0x95730910943cd16398609fe6ae5eddd5daeb56f838d76a795279364e4bb97ab0');
  }
  
  // Check admin recent activity
  console.log('\n=== Admin Activity ===');
  const adminNonce = await client.getTransactionCount({ address: GMX_ADMIN });
  console.log('Admin TX count:', adminNonce);
}

checkRecovery().catch(console.error);
