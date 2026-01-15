import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

// ============ CONFIG ============
const USER = '0xa7F2e98701896eDD6944b57f2F371938c577cdE5';
const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

// Your private key - KEEP SECRET!
const PRIVATE_KEY = process.env.RECOVERY_PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error('❌ Set RECOVERY_PRIVATE_KEY environment variable');
  console.log('\nRun with:');
  console.log('RECOVERY_PRIVATE_KEY=0x... npx ts-node src/recover_v8_funds.ts');
  process.exit(1);
}

// ============ ABI ============
const VAULT_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }],
    name: 'cancelStuckPosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }],
    name: 'getPosition',
    outputs: [{
      components: [
        { name: 'isActive', type: 'bool' },
        { name: 'collateral', type: 'uint256' },
      ],
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getWithdrawable',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// ============ SETUP ============
const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const walletClient = createWalletClient({
  account,
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

// ============ MAIN ============
async function main() {
  console.log('=== V8 VAULT RECOVERY SCRIPT ===\n');
  console.log('Wallet:', account.address);
  console.log('Vault:', V8_VAULT);

  // Verify wallet matches
  if (account.address.toLowerCase() !== USER.toLowerCase()) {
    console.error(`\n❌ Wrong wallet! Expected ${USER}`);
    process.exit(1);
  }

  // Check initial balance
  const initialBalance = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'balances',
    args: [USER as `0x${string}`]
  });
  console.log('\n📊 Initial balance:', '$' + formatUnits(initialBalance, 6));

  // Check WETH position
  const wethPos = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getPosition',
    args: [USER as `0x${string}`, WETH as `0x${string}`]
  });

  // Check WBTC position
  const wbtcPos = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getPosition',
    args: [USER as `0x${string}`, WBTC as `0x${string}`]
  });

  console.log('\n📈 WETH Position active:', wethPos.isActive, '- Collateral:', '$' + formatUnits(wethPos.collateral, 6));
  console.log('📈 WBTC Position active:', wbtcPos.isActive, '- Collateral:', '$' + formatUnits(wbtcPos.collateral, 6));

  // Step 1: Cancel WETH stuck position
  if (wethPos.isActive) {
    console.log('\n🔄 Step 1: Cancelling stuck WETH position...');
    try {
      const hash1 = await walletClient.writeContract({
        address: V8_VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'cancelStuckPosition',
        args: [USER as `0x${string}`, WETH as `0x${string}`]
      });
      console.log('   TX:', hash1);
      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
      console.log('   ✅ WETH position cancelled! Gas:', receipt1.gasUsed.toString());
    } catch (e: any) {
      console.log('   ❌ Failed:', e.shortMessage || e.message);
    }
  } else {
    console.log('\n✅ WETH position already cleared');
  }

  // Step 2: Cancel WBTC stuck position
  if (wbtcPos.isActive) {
    console.log('\n🔄 Step 2: Cancelling stuck WBTC position...');
    try {
      const hash2 = await walletClient.writeContract({
        address: V8_VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'cancelStuckPosition',
        args: [USER as `0x${string}`, WBTC as `0x${string}`]
      });
      console.log('   TX:', hash2);
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
      console.log('   ✅ WBTC position cancelled! Gas:', receipt2.gasUsed.toString());
    } catch (e: any) {
      console.log('   ❌ Failed:', e.shortMessage || e.message);
    }
  } else {
    console.log('\n✅ WBTC position already cleared');
  }

  // Check new balance
  const newBalance = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'balances',
    args: [USER as `0x${string}`]
  });
  console.log('\n📊 New balance after cancellations:', '$' + formatUnits(newBalance, 6));

  // Step 3: Withdraw everything
  if (newBalance > 0n) {
    console.log('\n🔄 Step 3: Withdrawing full balance...');

    // Check withdrawable first
    let withdrawable = newBalance;
    try {
      withdrawable = await publicClient.readContract({
        address: V8_VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'getWithdrawable',
        args: [USER as `0x${string}`]
      });
      console.log('   Withdrawable:', '$' + formatUnits(withdrawable, 6));
    } catch {
      console.log('   Using full balance as withdrawable');
    }

    if (withdrawable > 0n) {
      try {
        const hash3 = await walletClient.writeContract({
          address: V8_VAULT as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'withdraw',
          args: [withdrawable]
        });
        console.log('   TX:', hash3);
        const receipt3 = await publicClient.waitForTransactionReceipt({ hash: hash3 });
        console.log('   ✅ Withdrawn! Gas:', receipt3.gasUsed.toString());
      } catch (e: any) {
        console.log('   ❌ Withdraw failed:', e.shortMessage || e.message);
      }
    }
  }

  // Final balance check
  const finalBalance = await publicClient.readContract({
    address: V8_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'balances',
    args: [USER as `0x${string}`]
  });
  console.log('\n\n=== RECOVERY COMPLETE ===');
  console.log('Final vault balance:', '$' + formatUnits(finalBalance, 6));
  console.log('\n💰 Check your wallet for the USDC!');
}

main().catch(console.error);
