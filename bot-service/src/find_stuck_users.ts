import { createPublicClient, http, formatUnits, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';

const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const VAULT_ABI = [
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

async function main() {
  console.log('=== SCANNING V8 CALLBACK BUG VAULT FOR STUCK USERS ===\n');
  console.log('Vault:', V8_VAULT);

  // Get Deposit events to find all users
  const depositEvent = parseAbiItem('event Deposit(address indexed user, uint256 amount)');

  const logs = await client.getLogs({
    address: V8_VAULT as `0x${string}`,
    event: depositEvent,
    fromBlock: 0n,
    toBlock: 'latest'
  });

  console.log(`\nFound ${logs.length} deposit events\n`);

  // Get unique users
  const users = [...new Set(logs.map(log => log.args.user as string))];
  console.log(`Unique depositors: ${users.length}\n`);

  console.log('=== CHECKING EACH USER ===\n');

  const stuckUsers: any[] = [];

  for (const user of users) {
    try {
      const balance = await client.readContract({
        address: V8_VAULT as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'balances',
        args: [user as `0x${string}`]
      });

      if (balance > 0n) {
        // Check withdrawable
        let withdrawable = balance;
        try {
          withdrawable = await client.readContract({
            address: V8_VAULT as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'getWithdrawable',
            args: [user as `0x${string}`]
          });
        } catch {}

        // Check stuck positions
        let stuckWeth = false;
        let stuckWbtc = false;
        let wethCollateral = 0n;
        let wbtcCollateral = 0n;

        try {
          const wethPos = await client.readContract({
            address: V8_VAULT as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'getPosition',
            args: [user as `0x${string}`, WETH as `0x${string}`]
          });
          stuckWeth = wethPos.isActive;
          wethCollateral = wethPos.collateral;
        } catch {}

        try {
          const wbtcPos = await client.readContract({
            address: V8_VAULT as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'getPosition',
            args: [user as `0x${string}`, WBTC as `0x${string}`]
          });
          stuckWbtc = wbtcPos.isActive;
          wbtcCollateral = wbtcPos.collateral;
        } catch {}

        const totalStuck = balance + wethCollateral + wbtcCollateral;

        stuckUsers.push({
          user,
          balance,
          withdrawable,
          stuckWeth,
          wethCollateral,
          stuckWbtc,
          wbtcCollateral,
          totalStuck
        });

        console.log(`👤 ${user}`);
        console.log(`   Balance: $${formatUnits(balance, 6)}`);
        console.log(`   Withdrawable: $${formatUnits(withdrawable, 6)}`);
        if (stuckWeth) console.log(`   ⚠️  WETH Position STUCK: $${formatUnits(wethCollateral, 6)}`);
        if (stuckWbtc) console.log(`   ⚠️  WBTC Position STUCK: $${formatUnits(wbtcCollateral, 6)}`);
        console.log(`   💰 TOTAL STUCK: $${formatUnits(totalStuck, 6)}`);
        console.log('');
      }
    } catch (e) {
      // Skip errors
    }
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`Users with stuck funds: ${stuckUsers.length}`);

  const totalStuckAll = stuckUsers.reduce((sum, u) => sum + u.totalStuck, 0n);
  console.log(`Total stuck: $${formatUnits(totalStuckAll, 6)}`);

  console.log('\n=== USERS NEEDING RECOVERY ===\n');
  for (const u of stuckUsers.sort((a, b) => Number(b.totalStuck - a.totalStuck))) {
    console.log(`${u.user}: $${formatUnits(u.totalStuck, 6)}${u.stuckWeth || u.stuckWbtc ? ' (has stuck positions)' : ''}`);
  }
}

main().catch(console.error);
