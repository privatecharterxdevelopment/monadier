import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

const OWNER_KEY = process.env.RECOVERY_PRIVATE_KEY as `0x${string}`;
const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const STUCK_USER = '0x7D4805026aA980E25631BD3d700025129A8f7B57';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

if (!OWNER_KEY) {
  console.error('Set RECOVERY_PRIVATE_KEY');
  process.exit(1);
}

const account = privateKeyToAccount(OWNER_KEY);

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const walletClient = createWalletClient({
  account,
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const VAULT_ABI = [
  { inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], name: 'cancelStuckPosition', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], name: 'getPosition', outputs: [{
    components: [
      { name: 'isActive', type: 'bool' },
      { name: 'collateral', type: 'uint256' },
    ],
    type: 'tuple'
  }], stateMutability: 'view', type: 'function' },
] as const;

async function main() {
  console.log('=== RECOVER OTHER USER\'S STUCK WBTC POSITION ===\n');
  console.log('Owner:', account.address);
  console.log('Stuck user:', STUCK_USER);
  console.log('Token: WBTC');

  // Check position
  const pos = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getPosition',
    args: [STUCK_USER as `0x${string}`, WBTC as `0x${string}`]
  });
  console.log('\n📈 WBTC Position:');
  console.log('   Active:', pos.isActive);
  console.log('   Collateral:', '$' + formatUnits(pos.collateral, 6));

  if (!pos.isActive) {
    console.log('\n❌ Position not active, nothing to cancel');
    return;
  }

  // Check user balance before
  const balanceBefore = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'balances',
    args: [STUCK_USER as `0x${string}`]
  });
  console.log('\n💰 User balance BEFORE:', '$' + formatUnits(balanceBefore, 6));

  // Cancel the stuck position
  console.log('\n🔄 Cancelling stuck WBTC position...');
  try {
    const hash = await walletClient.writeContract({
      address: V8_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'cancelStuckPosition',
      args: [STUCK_USER as `0x${string}`, WBTC as `0x${string}`]
    });
    console.log('   TX:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('   ✅ Done! Gas:', receipt.gasUsed.toString());

    // Check balance after
    const balanceAfter = await publicClient.readContract({
      address: V8_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'balances',
      args: [STUCK_USER as `0x${string}`]
    });
    console.log('\n💰 User balance AFTER:', '$' + formatUnits(balanceAfter, 6));
    console.log('   Refunded:', '$' + formatUnits(balanceAfter - balanceBefore, 6));

    console.log('\n✅ User can now withdraw via the Legacy Vault button on dashboard!');

  } catch (e: any) {
    console.log('   ❌ Failed:', e.shortMessage || e.message);
  }
}

main().catch(console.error);
