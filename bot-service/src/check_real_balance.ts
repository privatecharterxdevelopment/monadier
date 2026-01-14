import { createPublicClient, http } from 'viem';
import { arbitrum } from 'viem/chains';

const V7_VAULT = '0xFA38c191134A6a3382794BE6144D24c3e6D8a4C3';  // V8 Vault
const USER = '0xa7f2e98701896edd6944b57f2f371938c577cde5';

const VAULT_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'totalDeposited',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getSettings',  // V8: getSettings (not getUserSettings)
    outputs: [{
      components: [
        { name: 'autoTradeEnabled', type: 'bool' },
        { name: 'riskBps', type: 'uint256' },       // V8: riskBps
        { name: 'maxLeverage', type: 'uint256' },   // V8: maxLeverage
        { name: 'stopLossBps', type: 'uint256' },   // V8: stopLossBps
        { name: 'takeProfitBps', type: 'uint256' }  // V8: takeProfitBps
      ],
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function main() {
  console.log('=== REAL BLOCKCHAIN DATA ===\n');
  console.log('User: ' + USER);
  console.log('V7 Vault: ' + V7_VAULT + '\n');

  // Get balance
  const balance = await client.readContract({
    address: V7_VAULT as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'balances',
    args: [USER as `0x${string}`]
  });

  console.log('Current Balance: $' + (Number(balance) / 1e6).toFixed(6));

  // Try to get total deposited
  try {
    const deposited = await client.readContract({
      address: V7_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'totalDeposited',
      args: [USER as `0x${string}`]
    });
    const depositNum = Number(deposited) / 1e6;
    const balanceNum = Number(balance) / 1e6;
    console.log('Total Deposited: $' + depositNum.toFixed(6));
    console.log('\n=== REAL P/L: $' + (balanceNum - depositNum).toFixed(6) + ' ===');
  } catch (e: any) {
    console.log('totalDeposited not available: ' + e.message?.slice(0, 50));
  }

  // Get settings (V8: getSettings)
  try {
    const settings = await client.readContract({
      address: V7_VAULT as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'getSettings',  // V8: getSettings (not getUserSettings)
      args: [USER as `0x${string}`]
    });
    console.log('\nSettings:', settings);
  } catch (e) {
    console.log('Could not get settings');
  }
}

main().catch(console.error);
