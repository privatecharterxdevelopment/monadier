import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const OLD_CONTRACT = '0x712B3A0cFD00674a15c5D235e998F71709112675';
const CLAUDIO_WALLET = '0x9f0b84a794c13aeece5254fdccca951816dd5d8a';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const ABI = parseAbi([
  'function transfer(address to, uint256 amount) external',
  'function balances(address) view returns (uint256)',
  'function owner() view returns (address)',
]);

async function rescueClaudio() {
  const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY as `0x${string}`);
  
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc')
  });
  
  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc')
  });

  // Check owner
  const owner = await publicClient.readContract({
    address: OLD_CONTRACT,
    abi: ABI,
    functionName: 'owner'
  });
  console.log('Contract Owner:', owner);
  console.log('Your Wallet:', account.address);
  
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.log('ERROR: You are not the owner!');
    return;
  }

  // Check Claudio's balance in contract
  const balance = await publicClient.readContract({
    address: OLD_CONTRACT,
    abi: ABI,
    functionName: 'balances',
    args: [CLAUDIO_WALLET]
  });
  console.log('Claudio balance in contract:', Number(balance) / 1e6, 'USDC');

  // Try to call transfer to send USDC to Claudio
  console.log('\nAttempting to transfer 100 USDC to Claudio...');
  
  try {
    const hash = await walletClient.writeContract({
      address: OLD_CONTRACT,
      abi: ABI,
      functionName: 'transfer',
      args: [CLAUDIO_WALLET, BigInt(100000000)] // 100 USDC
    });
    console.log('TX Hash:', hash);
    console.log('Waiting for confirmation...');
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Status:', receipt.status);
  } catch (e: any) {
    console.log('Transfer failed:', e.shortMessage || e.message);
    console.log('\nThe contract might not have a transfer function for owner.');
    console.log('Claudio needs to withdraw himself.');
  }
}

rescueClaudio();
