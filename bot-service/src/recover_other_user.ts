import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

// CONFIG
const OWNER_KEY = process.env.RECOVERY_PRIVATE_KEY as `0x${string}`;
const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const STUCK_USER = '0x7D4805026aA980E25631BD3d700025129A8f7B57';

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
  { inputs: [{ name: 'user', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'adminCreditBalance', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'tvl', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'amount', type: 'uint256' }], name: 'adminReduceTVL', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const;

const USDC_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }
] as const;

const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function main() {
  console.log('=== RECOVER STUCK FUNDS FOR OTHER USER ===\n');
  console.log('Owner wallet:', account.address);
  console.log('Stuck user:', STUCK_USER);
  console.log('Vault:', V8_VAULT);

  // Check contract USDC
  const contractUSDC = await publicClient.readContract({
    address: USDC as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [V8_VAULT as `0x${string}`]
  });
  console.log('\n💰 Contract USDC: $' + formatUnits(contractUSDC, 6));

  // Check user's current balance
  const userBalance = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'balances',
    args: [STUCK_USER as `0x${string}`]
  });
  console.log('👤 User current balance: $' + formatUnits(userBalance, 6));

  // Check TVL
  const tvl = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'tvl'
  });
  console.log('📊 TVL: $' + formatUnits(tvl, 6));

  // The user deposited $76 and should get most of it back
  // Contract has $76, TVL claims $76 but user balance is only $0.04
  // We need to credit them the difference

  // Amount to credit = their original deposit ($76) - current balance - any fees
  // Since they had positions that closed, let's credit them what's available
  // Safe amount: contract balance - other user balances - fees

  // Your balance: ~$0.12
  // Fees: ~$1.80
  // So user can get: $76.38 - $0.12 - $1.80 = ~$74.46

  const YOUR_BALANCE = 119651n; // $0.119651
  const FEES = 1808758n; // $1.808758
  const amountToCredit = contractUSDC - YOUR_BALANCE - FEES - userBalance;

  console.log('\n📝 CALCULATION:');
  console.log('   Contract USDC: $' + formatUnits(contractUSDC, 6));
  console.log('   - Your balance: $' + formatUnits(YOUR_BALANCE, 6));
  console.log('   - Fees: $' + formatUnits(FEES, 6));
  console.log('   - User current balance: $' + formatUnits(userBalance, 6));
  console.log('   = Amount to credit: $' + formatUnits(amountToCredit, 6));

  console.log('\n⚠️  This will credit $' + formatUnits(amountToCredit, 6) + ' to user ' + STUCK_USER);
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(r => setTimeout(r, 5000));

  // Credit the user
  console.log('🔄 Crediting user...');
  try {
    const hash = await walletClient.writeContract({
      address: V8_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'adminCreditBalance',
      args: [STUCK_USER as `0x${string}`, amountToCredit]
    });
    console.log('   TX: ' + hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('   ✅ Done! Gas: ' + receipt.gasUsed.toString());

    // Check new balance
    const newBalance = await publicClient.readContract({
      address: V8_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'balances',
      args: [STUCK_USER as `0x${string}`]
    });
    console.log('\n👤 User NEW balance: $' + formatUnits(newBalance, 6));
    console.log('\n✅ User can now withdraw their funds via the dashboard!');

  } catch (e: any) {
    console.log('   ❌ Failed: ' + (e.shortMessage || e.message));
  }
}

main().catch(console.error);
