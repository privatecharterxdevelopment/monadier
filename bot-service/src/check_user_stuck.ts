import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

const USER = '0xa7F2e98701896eDD6944b57f2F371938c577cdE5';

// The vault with the $126 stuck
const V8_CALLBACK_BUG = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const V7_VAULT = '0x9879792a47725d5b18633e1395BC4a7A06c750df';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const FULL_ABI = [
  // Balance
  { inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  // TVL and fees
  { inputs: [], name: 'tvl', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'fees', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  // Owner
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  // Bot
  { inputs: [], name: 'bot', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  // Health status
  { inputs: [], name: 'getHealthStatus', outputs: [
    { name: 'realBalance', type: 'uint256' },
    { name: 'totalValueLocked', type: 'uint256' },
    { name: 'accumulatedFees', type: 'uint256' },
    { name: 'isSolvent', type: 'bool' },
    { name: 'surplus', type: 'int256' }
  ], stateMutability: 'view', type: 'function' },
  // Settings
  { inputs: [{ name: 'user', type: 'address' }], name: 'getSettings', outputs: [{
    components: [
      { name: 'autoTradeEnabled', type: 'bool' },
      { name: 'riskBps', type: 'uint256' },
      { name: 'maxLeverage', type: 'uint256' },
      { name: 'stopLossBps', type: 'uint256' },
      { name: 'takeProfitBps', type: 'uint256' }
    ],
    type: 'tuple'
  }], stateMutability: 'view', type: 'function' },
  // Position
  { inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], name: 'getPosition', outputs: [{
    components: [
      { name: 'isActive', type: 'bool' },
      { name: 'isLong', type: 'bool' },
      { name: 'token', type: 'address' },
      { name: 'collateral', type: 'uint256' },
      { name: 'size', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'stopLoss', type: 'uint256' },
      { name: 'takeProfit', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'requestKey', type: 'bytes32' },
      { name: 'highestPrice', type: 'uint256' },
      { name: 'lowestPrice', type: 'uint256' },
      { name: 'trailingSlBps', type: 'uint256' },
      { name: 'trailingActivated', type: 'bool' },
      { name: 'autoFeaturesEnabled', type: 'bool' }
    ],
    type: 'tuple'
  }], stateMutability: 'view', type: 'function' },
  // Check for admin functions
  { inputs: [{ name: 'user', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'adminCreditBalance', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  // Withdrawable
  { inputs: [{ name: 'user', type: 'address' }], name: 'getWithdrawable', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

async function checkVault(name: string, address: `0x${string}`) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📦 ${name}`);
  console.log(`   Address: ${address}`);
  console.log('='.repeat(50));

  try {
    // User balance
    const balance = await client.readContract({
      address,
      abi: FULL_ABI,
      functionName: 'balances',
      args: [USER as `0x${string}`]
    });
    console.log(`\n👤 YOUR BALANCE: $${formatUnits(balance, 6)}`);

    // TVL
    try {
      const tvl = await client.readContract({ address, abi: FULL_ABI, functionName: 'tvl' });
      console.log(`📊 Total TVL: $${formatUnits(tvl, 6)}`);
    } catch {}

    // Fees
    try {
      const fees = await client.readContract({ address, abi: FULL_ABI, functionName: 'fees' });
      console.log(`💸 Accumulated Fees: $${formatUnits(fees, 6)}`);
    } catch {}

    // Owner
    try {
      const owner = await client.readContract({ address, abi: FULL_ABI, functionName: 'owner' });
      console.log(`👑 Owner: ${owner}`);
    } catch {}

    // Bot
    try {
      const bot = await client.readContract({ address, abi: FULL_ABI, functionName: 'bot' });
      console.log(`🤖 Bot: ${bot}`);
    } catch {}

    // Withdrawable
    try {
      const withdrawable = await client.readContract({
        address,
        abi: FULL_ABI,
        functionName: 'getWithdrawable',
        args: [USER as `0x${string}`]
      });
      console.log(`💰 Withdrawable: $${formatUnits(withdrawable, 6)}`);
    } catch {
      console.log(`💰 Withdrawable: (function not available)`);
    }

    // Check positions
    console.log(`\n📈 Checking positions...`);
    try {
      const wethPos = await client.readContract({
        address,
        abi: FULL_ABI,
        functionName: 'getPosition',
        args: [USER as `0x${string}`, WETH as `0x${string}`]
      });
      if (wethPos.isActive) {
        console.log(`   WETH Position ACTIVE!`);
        console.log(`   - Collateral: $${formatUnits(wethPos.collateral, 6)}`);
        console.log(`   - Size: $${formatUnits(wethPos.size, 30)}`);
        console.log(`   - Leverage: ${wethPos.leverage}x`);
        console.log(`   - Is Long: ${wethPos.isLong}`);
      } else {
        console.log(`   WETH: No active position`);
      }
    } catch {
      console.log(`   WETH: Could not check`);
    }

    try {
      const wbtcPos = await client.readContract({
        address,
        abi: FULL_ABI,
        functionName: 'getPosition',
        args: [USER as `0x${string}`, WBTC as `0x${string}`]
      });
      if (wbtcPos.isActive) {
        console.log(`   WBTC Position ACTIVE!`);
        console.log(`   - Collateral: $${formatUnits(wbtcPos.collateral, 6)}`);
      } else {
        console.log(`   WBTC: No active position`);
      }
    } catch {
      console.log(`   WBTC: Could not check`);
    }

    // Health status
    try {
      const health = await client.readContract({ address, abi: FULL_ABI, functionName: 'getHealthStatus' });
      console.log(`\n🏥 Health Status:`);
      console.log(`   Real Balance: $${formatUnits(health[0], 6)}`);
      console.log(`   TVL: $${formatUnits(health[1], 6)}`);
      console.log(`   Fees: $${formatUnits(health[2], 6)}`);
      console.log(`   Solvent: ${health[3]}`);
      console.log(`   Surplus: $${formatUnits(health[4], 6)}`);
    } catch {}

  } catch (e: any) {
    console.log(`❌ Error: ${e.message?.slice(0, 100)}`);
  }
}

async function main() {
  console.log(`\n🔍 CHECKING STUCK FUNDS FOR: ${USER}\n`);

  await checkVault('V8 (callback bug) - $126 STUCK', V8_CALLBACK_BUG as `0x${string}`);
  await checkVault('V7 - $0.39 STUCK', V7_VAULT as `0x${string}`);

  console.log('\n\n✅ DONE - Check above for your stuck balances');
}

main().catch(console.error);
