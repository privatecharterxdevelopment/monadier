import { createPublicClient, http, formatEther } from 'viem';
import { arbitrum } from 'viem/chains';

const BOT = '0xC9a6D02a04e3B2E8d3941615EfcBA67593F46b8E';

const client = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

async function main() {
  const balance = await client.getBalance({ address: BOT as `0x${string}` });
  console.log('Bot ETH balance:', formatEther(balance), 'ETH');
}

main();
