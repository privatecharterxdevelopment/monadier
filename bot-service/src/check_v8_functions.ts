import { createPublicClient, http } from 'viem';
import { arbitrum } from 'viem/chains';

const V8_VAULT = '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

// Try calling various functions to see which exist
const FUNCTIONS_TO_TRY = [
  { name: 'adminCreditBalance', sig: 'adminCreditBalance(address,uint256)' },
  { name: 'adminReduceTVL', sig: 'adminReduceTVL(uint256)' },
  { name: 'recoverStuckTokens', sig: 'recoverStuckTokens(address)' },
  { name: 'cancelStuckPosition', sig: 'cancelStuckPosition(address,address)' },
  { name: 'handleCancelledPosition', sig: 'handleCancelledPosition(address,address,uint256)' },
  { name: 'finalizeClose', sig: 'finalizeClose(address,address,uint256,string)' },
];

async function main() {
  console.log('=== CHECKING V8 VAULT FUNCTIONS ===\n');
  console.log('Vault:', V8_VAULT);

  // Get bytecode
  const code = await client.getCode({ address: V8_VAULT as `0x${string}` });
  console.log('\nBytecode length:', code?.length || 0);

  // We can't easily check function selectors without the ABI
  // But we know this is an older vault that might not have adminCreditBalance

  console.log('\nThis vault version might not have adminCreditBalance()');
  console.log('Alternative approaches:');
  console.log('1. Use handleCancelledPosition() to refund the user');
  console.log('2. Use finalizeClose() to credit the position close');
  console.log('3. The user\'s positions might still be "active" in vault state');
}

main().catch(console.error);
