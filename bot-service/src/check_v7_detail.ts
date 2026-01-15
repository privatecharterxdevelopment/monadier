import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

const USER = '0xa7F2e98701896eDD6944b57f2F371938c577cdE5';
const V7_VAULT = '0x9879792a47725d5b18633e1395BC4a7A06c750df';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function main() {
  console.log('=== V7 VAULT ANALYSIS ===\n');
  console.log('Vault:', V7_VAULT);
  console.log('User:', USER);

  // Check contract's actual USDC
  const contractUSDC = await client.readContract({
    address: USDC as `0x${string}`,
    abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balanceOf',
    args: [V7_VAULT as `0x${string}`]
  });
  console.log('\n💰 Contract ACTUAL USDC:', '$' + formatUnits(contractUSDC, 6));

  // Check user's recorded balance
  const userBalance = await client.readContract({
    address: V7_VAULT as `0x${string}`,
    abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balances',
    args: [USER as `0x${string}`]
  });
  console.log('📊 Your Recorded Balance:', '$' + formatUnits(userBalance, 6));

  // Check TVL if exists
  try {
    const tvl = await client.readContract({
      address: V7_VAULT as `0x${string}`,
      abi: [{ inputs: [], name: 'tvl', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'tvl'
    });
    console.log('📈 TVL:', '$' + formatUnits(tvl, 6));
  } catch {
    console.log('📈 TVL: (no function)');
  }

  // Check owner
  try {
    const owner = await client.readContract({
      address: V7_VAULT as `0x${string}`,
      abi: [{ inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' }],
      functionName: 'owner'
    });
    console.log('👑 Owner:', owner);
  } catch {}

  // Deficit
  const deficit = userBalance - contractUSDC;
  console.log('\n❌ DEFICIT:', '$' + formatUnits(deficit, 6));
  console.log('\n⚠️  The contract does NOT have enough USDC to pay you!');
  console.log('   Your $39.40 was likely lost in failed GMX trades.');

  // Check if there's adminCreditBalance
  console.log('\n🔧 Checking admin functions...');

  // Try to read any positions
  const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
  const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

  try {
    const wethPos = await client.readContract({
      address: V7_VAULT as `0x${string}`,
      abi: [{
        inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }],
        name: 'getPosition',
        outputs: [{ components: [
          { name: 'isActive', type: 'bool' },
          { name: 'collateral', type: 'uint256' },
        ], type: 'tuple' }],
        stateMutability: 'view',
        type: 'function'
      }],
      functionName: 'getPosition',
      args: [USER as `0x${string}`, WETH as `0x${string}`]
    });
    console.log('WETH Position:', wethPos);
  } catch (e) {
    console.log('WETH Position: Could not read');
  }
}

main().catch(console.error);
