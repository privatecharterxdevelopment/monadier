import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const VAULT_ADDRESS = '0x7dE97f35887b2623dCad2ebA68197f58F7607854' as const;
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;
const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A' as const;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function checkUser() {
  // Find onlinewave12 wallet address
  const { data: user } = await supabase
    .from('profiles')
    .select('wallet_address, username')
    .ilike('username', '%onlinewave%')
    .single();

  if (!user) {
    console.log('User "onlinewave12" not found in profiles');

    // Try to find by checking all users with vault balance
    const { data: allSettings } = await supabase
      .from('vault_settings')
      .select('wallet_address, auto_trade_enabled')
      .eq('chain_id', 42161);

    console.log('\nAll vault_settings entries:', allSettings?.length);
    return;
  }

  const wallet = user.wallet_address as `0x${string}`;
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              ONLINEWAVE12 COMPLETE AUDIT                      ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('Wallet:', wallet);
  console.log('');

  // Check vault balance (on-chain)
  const balance = await client.readContract({
    address: VAULT_ADDRESS,
    abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balances',
    args: [wallet]
  });
  console.log('📊 VAULT BALANCE (on-chain):', formatUnits(balance, 6), 'USDC');

  // Check ETH position in VAULT
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

  const ethPos = await client.readContract({
    address: VAULT_ADDRESS,
    abi: positionAbi,
    functionName: 'positions',
    args: [wallet, WETH]
  });

  console.log('');
  console.log('📈 ETH POSITION (VAULT CONTRACT):');
  console.log('   isActive:', ethPos[0]);
  if (ethPos[0]) {
    console.log('   isLong:', ethPos[1]);
    console.log('   collateral:', formatUnits(ethPos[3], 6), 'USDC');
    console.log('   leverage:', ethPos[5].toString() + 'x');
    console.log('   entryPrice: $' + (Number(ethPos[6]) / 1e30).toFixed(2));
  }

  // Check BTC position in VAULT
  const btcPos = await client.readContract({
    address: VAULT_ADDRESS,
    abi: positionAbi,
    functionName: 'positions',
    args: [wallet, WBTC]
  });

  console.log('');
  console.log('📈 BTC POSITION (VAULT CONTRACT):');
  console.log('   isActive:', btcPos[0]);
  if (btcPos[0]) {
    console.log('   isLong:', btcPos[1]);
    console.log('   collateral:', formatUnits(btcPos[3], 6), 'USDC');
    console.log('   leverage:', btcPos[5].toString() + 'x');
    console.log('   entryPrice: $' + (Number(btcPos[6]) / 1e30).toFixed(2));
  }

  // Check GMX position (actual perp exchange)
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

  // Check GMX for vault's position (since vault is the account on GMX)
  if (ethPos[0]) {
    const gmxEthPos = await client.readContract({
      address: GMX_VAULT,
      abi: gmxAbi,
      functionName: 'getPosition',
      args: [VAULT_ADDRESS, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', WETH, ethPos[1]]
    });
    console.log('');
    console.log('🔗 GMX ETH POSITION (actual exchange):');
    console.log('   size:', formatUnits(gmxEthPos[0], 30), 'USD');
    console.log('   collateral:', formatUnits(gmxEthPos[1], 30), 'USD');
    if (gmxEthPos[0] === 0n) {
      console.log('   ⚠️  GMX POSITION IS CLOSED! But vault still shows active!');
    }
  }

  if (btcPos[0]) {
    const gmxBtcPos = await client.readContract({
      address: GMX_VAULT,
      abi: gmxAbi,
      functionName: 'getPosition',
      args: [VAULT_ADDRESS, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', WBTC, btcPos[1]]
    });
    console.log('');
    console.log('🔗 GMX BTC POSITION (actual exchange):');
    console.log('   size:', formatUnits(gmxBtcPos[0], 30), 'USD');
    console.log('   collateral:', formatUnits(gmxBtcPos[1], 30), 'USD');
    if (gmxBtcPos[0] === 0n) {
      console.log('   ⚠️  GMX POSITION IS CLOSED! But vault still shows active!');
    }
  }

  // Check database
  const { data: dbPositions } = await supabase
    .from('positions')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('');
  console.log('💾 DATABASE POSITIONS:');
  if (dbPositions && dbPositions.length > 0) {
    for (const p of dbPositions) {
      console.log('   ' + p.token_symbol + ' | status: ' + p.status + ' | entry: $' + p.entry_price);
    }
  } else {
    console.log('   No positions in database');
  }

  // Check vault settings
  const { data: settings } = await supabase
    .from('vault_settings')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .single();

  console.log('');
  console.log('⚙️  VAULT SETTINGS:');
  if (settings) {
    console.log('   auto_trade_enabled:', settings.auto_trade_enabled);
    console.log('   risk_level_bps:', settings.risk_level_bps);
  } else {
    console.log('   No settings found');
  }

  console.log('');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // DIAGNOSIS
  console.log('');
  console.log('🔍 DIAGNOSIS:');
  if (balance === 0n && (ethPos[0] || btcPos[0])) {
    console.log('   ❌ STUCK POSITION: Balance is 0 but position exists');
    console.log('   → User should call userInstantClose(token) to recover funds');
  } else if (balance > 0n) {
    console.log('   ✅ User has balance, can withdraw');
  } else {
    console.log('   ℹ️  No balance and no positions');
  }
}

checkUser().catch(console.error);
