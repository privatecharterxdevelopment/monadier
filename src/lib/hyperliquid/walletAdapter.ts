import type { AbstractViemJsonRpcAccount } from '@nktkas/hyperliquid/signing';
import type { WalletClient } from 'viem';

export function walletClientToHlWallet(client: WalletClient): AbstractViemJsonRpcAccount {
  const account = client.account;
  if (!account) {
    throw new Error('Wallet not connected');
  }

  return {
    async getAddresses() {
      return [account.address];
    },
    async getChainId() {
      if (client.chain?.id) return client.chain.id;
      const id = await client.getChainId();
      return id;
    },
    async signTypedData(params) {
      return client.signTypedData({
        account,
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };
}
