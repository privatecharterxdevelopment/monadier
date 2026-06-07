import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import type { WalletClient } from 'viem';
import { walletClientToHlWallet } from './walletAdapter';

const transport = new HttpTransport();

export function createHlExchangeClient(walletClient: WalletClient): ExchangeClient {
  return new ExchangeClient({
    transport,
    wallet: walletClientToHlWallet(walletClient),
  });
}
