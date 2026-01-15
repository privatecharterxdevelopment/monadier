import { createPublicClient, createWalletClient, http, formatEther, parseEther, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

const OWNER_KEY = '0xcdc1456522d684d0791e51e05cd86c18e5dfcdac7484e59eaa0742d2f9291df7' as `0x${string}`;
const BOT_KEY = '0x535c83df1a89592c14e553f411ff6e9e9c05bd8629035bddbefc59e4f504827f' as `0x${string}`;

const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const STUCK_USER = '0x7D4805026aA980E25631BD3d700025129A8f7B57';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

const ownerAccount = privateKeyToAccount(OWNER_KEY);
const botAccount = privateKeyToAccount(BOT_KEY);

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const ownerWallet = createWalletClient({
  account: ownerAccount,
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const botWallet = createWalletClient({
  account: botAccount,
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const VAULT_ABI = [
  { inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], name: 'cancelStuckPosition', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

async function main() {
  console.log('=== FUND BOT AND RECOVER OTHER USER ===\n');

  // Check owner ETH balance
  const ownerEth = await publicClient.getBalance({ address: ownerAccount.address });
  console.log('Owner ETH:', formatEther(ownerEth));

  // Check bot ETH balance
  const botEth = await publicClient.getBalance({ address: botAccount.address });
  console.log('Bot ETH:', formatEther(botEth));

  if (ownerEth < parseEther('0.001')) {
    console.log('\n❌ Owner needs more ETH to fund bot!');
    return;
  }

  // Send 0.001 ETH to bot
  console.log('\n🔄 Sending 0.001 ETH to bot...');
  try {
    const hash1 = await ownerWallet.sendTransaction({
      to: botAccount.address,
      value: parseEther('0.001')
    });
    console.log('   TX:', hash1);
    await publicClient.waitForTransactionReceipt({ hash: hash1 });
    console.log('   ✅ ETH sent to bot');
  } catch (e: any) {
    console.log('   ❌ Failed:', e.shortMessage || e.message);
    return;
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // Now bot cancels the stuck position
  console.log('\n🔄 Bot cancelling stuck WBTC position...');

  const balanceBefore = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'balances',
    args: [STUCK_USER as `0x${string}`]
  });
  console.log('   User balance before:', '$' + formatUnits(balanceBefore, 6));

  try {
    const hash2 = await botWallet.writeContract({
      address: V8_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'cancelStuckPosition',
      args: [STUCK_USER as `0x${string}`, WBTC as `0x${string}`]
    });
    console.log('   TX:', hash2);
    await publicClient.waitForTransactionReceipt({ hash: hash2 });
    console.log('   ✅ Position cancelled!');

    const balanceAfter = await publicClient.readContract({
      address: V8_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'balances',
      args: [STUCK_USER as `0x${string}`]
    });
    console.log('\n   User balance AFTER:', '$' + formatUnits(balanceAfter, 6));
    console.log('   Refunded:', '$' + formatUnits(balanceAfter - balanceBefore, 6));

  } catch (e: any) {
    console.log('   ❌ Failed:', e.shortMessage || e.message);
  }
}

main().catch(console.error);
