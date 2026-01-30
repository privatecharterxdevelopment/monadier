import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const VAULT_ADDRESS = '0x7dE97f35887b2623dCad2ebA68197f58F7607854' as const;
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;
const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A' as const;
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

const positionAbi = [{
  inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }],
  name: 'positions',
  outputs: [
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
  stateMutability: 'view',
  type: 'function'
}] as const;

const gmxAbi = [{
  inputs: [
    { name: '_account', type: 'address' },
    { name: '_collateralToken', type: 'address' },
    { name: '_indexToken', type: 'address' },
    { name: '_isLong', type: 'bool' }
  ],
  name: 'getPosition',
  outputs: [
    { name: 'size', type: 'uint256' },
    { name: 'collateral', type: 'uint256' },
    { name: 'averagePrice', type: 'uint256' },
    { name: 'entryFundingRate', type: 'uint256' },
    { name: 'reserveAmount', type: 'uint256' },
    { name: 'realisedPnl', type: 'int256' },
    { name: 'lastIncreasedTime', type: 'uint256' }
  ],
  stateMutability: 'view',
  type: 'function'
}] as const;

async function checkAllUsers() {
  // Get all wallets from vault_settings
  const { data: settings } = await supabase
    .from('vault_settings')
    .select('wallet_address')
    .eq('chain_id', 42161);

  const wallets = settings?.map(s => s.wallet_address) || [];

  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    COMPLETE USER AUDIT - V11 VAULT                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════╣');
  console.log('');

  for (const wallet of wallets) {
    const addr = wallet as `0x${string}`;

    // Get vault balance
    const balance = await client.readContract({
      address: VAULT_ADDRESS,
      abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'balances',
      args: [addr]
    });

    // Get positions
    const ethPos = await client.readContract({
      address: VAULT_ADDRESS,
      abi: positionAbi,
      functionName: 'positions',
      args: [addr, WETH]
    });

    const btcPos = await client.readContract({
      address: VAULT_ADDRESS,
      abi: positionAbi,
      functionName: 'positions',
      args: [addr, WBTC]
    });

    const balanceNum = parseFloat(formatUnits(balance, 6));
    const hasEthPos = ethPos[0];
    const hasBtcPos = btcPos[0];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('WALLET:', wallet);
    console.log('  Balance: $' + balanceNum.toFixed(2));
    console.log('  ETH Position: ' + (hasEthPos ? 'ACTIVE' : 'none'));
    console.log('  BTC Position: ' + (hasBtcPos ? 'ACTIVE' : 'none'));

    // If has position, check GMX state
    if (hasEthPos) {
      const ethCollateral = parseFloat(formatUnits(ethPos[3], 6));
      console.log('    └─ ETH Collateral: $' + ethCollateral.toFixed(2) + ', Leverage: ' + ethPos[5].toString() + 'x');

      // Check GMX
      const gmxPos = await client.readContract({
        address: GMX_VAULT,
        abi: gmxAbi,
        functionName: 'getPosition',
        args: [VAULT_ADDRESS, USDC, WETH, ethPos[1]]
      });

      if (gmxPos[0] === 0n) {
        console.log('    └─ ⚠️  GMX CLOSED but vault shows active! ORPHANED!');
      } else {
        console.log('    └─ GMX Size: $' + (Number(gmxPos[0]) / 1e30).toFixed(2));
      }
    }

    if (hasBtcPos) {
      const btcCollateral = parseFloat(formatUnits(btcPos[3], 6));
      console.log('    └─ BTC Collateral: $' + btcCollateral.toFixed(2) + ', Leverage: ' + btcPos[5].toString() + 'x');

      // Check GMX
      const gmxPos = await client.readContract({
        address: GMX_VAULT,
        abi: gmxAbi,
        functionName: 'getPosition',
        args: [VAULT_ADDRESS, USDC, WBTC, btcPos[1]]
      });

      if (gmxPos[0] === 0n) {
        console.log('    └─ ⚠️  GMX CLOSED but vault shows active! ORPHANED!');
      } else {
        console.log('    └─ GMX Size: $' + (Number(gmxPos[0]) / 1e30).toFixed(2));
      }
    }

    // Diagnosis
    if (balanceNum === 0 && (hasEthPos || hasBtcPos)) {
      console.log('  ❌ STUCK: Balance 0 but has position');
    } else if (balanceNum > 0 && !hasEthPos && !hasBtcPos) {
      console.log('  ✅ OK: Has balance, no position');
    } else if (balanceNum > 0 && (hasEthPos || hasBtcPos)) {
      console.log('  ✅ OK: Has balance + active position');
    } else {
      console.log('  ℹ️  Empty account');
    }
  }

  console.log('');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
}

checkAllUsers().catch(console.error);
