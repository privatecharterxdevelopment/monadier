import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const GMX_POSITION_ROUTER = '0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868';
const GMX_ROUTER = '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USER_WALLET = '0xa7f2e98701896edd6944b57f2f371938c577cde5';

// Amount to recover
const RECOVERY_AMOUNT = parseUnits('35.61', 6);

const GMX_POSITION_ROUTER_ABI = [
  {
    inputs: [],
    name: 'minExecutionFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: '_path', type: 'address[]' },
      { name: '_indexToken', type: 'address' },
      { name: '_amountIn', type: 'uint256' },
      { name: '_minOut', type: 'uint256' },
      { name: '_sizeDelta', type: 'uint256' },
      { name: '_isLong', type: 'bool' },
      { name: '_acceptablePrice', type: 'uint256' },
      { name: '_executionFee', type: 'uint256' },
      { name: '_referralCode', type: 'bytes32' },
      { name: '_callbackTarget', type: 'address' }
    ],
    name: 'createIncreasePosition',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: '_key', type: 'bytes32' },
      { name: '_executionFeeReceiver', type: 'address' }
    ],
    name: 'cancelIncreasePosition',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

const GMX_ROUTER_ABI = [
  {
    inputs: [{ name: '_plugin', type: 'address' }],
    name: 'approvePlugin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

async function main() {
  const botPrivateKey = process.env.BOT_PRIVATE_KEY;
  if (!botPrivateKey) {
    throw new Error('BOT_PRIVATE_KEY not set');
  }

  const account = privateKeyToAccount(botPrivateKey as `0x${string}`);
  console.log('Bot address:', account.address);

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc')
  });

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc')
  });

  // Check GMX Router USDC balance
  const gmxUsdcBalance = await publicClient.readContract({
    address: USDC,
    abi: [{ inputs: [{ name: '', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balanceOf',
    args: [GMX_POSITION_ROUTER]
  });
  console.log('GMX Router USDC balance: $' + (Number(gmxUsdcBalance) / 1e6).toFixed(2));

  // Get min execution fee
  const minExecutionFee = await publicClient.readContract({
    address: GMX_POSITION_ROUTER,
    abi: GMX_POSITION_ROUTER_ABI,
    functionName: 'minExecutionFee'
  });
  console.log('Min execution fee:', (Number(minExecutionFee) / 1e18).toFixed(6), 'ETH');

  // Check bot ETH balance
  const botEthBalance = await publicClient.getBalance({ address: account.address });
  console.log('Bot ETH balance:', (Number(botEthBalance) / 1e18).toFixed(6), 'ETH');

  if (botEthBalance < minExecutionFee) {
    console.log('ERROR: Bot needs more ETH for execution fee!');
    return;
  }

  console.log('\n=== ATTEMPTING RECOVERY ===\n');

  // First, approve GMX plugin (if not already)
  console.log('1. Approving GMX Position Router plugin...');
  try {
    const approveHash = await walletClient.writeContract({
      address: GMX_ROUTER,
      abi: GMX_ROUTER_ABI,
      functionName: 'approvePlugin',
      args: [GMX_POSITION_ROUTER]
    });
    console.log('   Approve TX:', approveHash);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log('   ✓ Plugin approved');
  } catch (e: any) {
    console.log('   Plugin already approved or error:', e.message?.slice(0, 50));
  }

  // Create position request with impossible price (will fail execution, then we cancel)
  // For a LONG, set acceptablePrice to $1 (way below market)
  // This ensures the position won't actually execute
  const impossiblePrice = parseUnits('1', 30); // $1 with 30 decimals (GMX format)
  const minSizeDelta = parseUnits('100', 30); // $100 position size (minimum)

  console.log('2. Creating position request to claim stuck funds...');
  console.log('   Amount: $35.61 USDC');
  console.log('   Acceptable price: $1 (impossible, will fail)');

  try {
    const createHash = await walletClient.writeContract({
      address: GMX_POSITION_ROUTER,
      abi: GMX_POSITION_ROUTER_ABI,
      functionName: 'createIncreasePosition',
      args: [
        [USDC], // path
        WETH, // indexToken
        RECOVERY_AMOUNT, // amountIn - THE STUCK FUNDS
        0n, // minOut
        minSizeDelta, // sizeDelta
        true, // isLong
        impossiblePrice, // acceptablePrice - impossibly low so it won't execute
        minExecutionFee, // executionFee
        '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`, // referralCode
        '0x0000000000000000000000000000000000000000' as `0x${string}` // callbackTarget
      ],
      value: minExecutionFee
    });
    
    console.log('   Create TX:', createHash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
    console.log('   ✓ Position request created!');
    
    // Extract the request key from logs
    // TODO: Parse logs to get the key for cancellation
    
    console.log('\n3. Position created. Keeper will fail to execute due to price.');
    console.log('   After timeout, can cancel to recover funds.');
    console.log('   Or funds may auto-refund on failed execution.');
    
  } catch (e: any) {
    console.log('   ERROR:', e.shortMessage || e.message);
  }
}

main().catch(console.error);
