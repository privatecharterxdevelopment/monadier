import type { AbstractViemJsonRpcAccount } from '@nktkas/hyperliquid/signing';
import type { WalletClient } from 'viem';

/** HL L1 actions always use chainId 1337 in EIP-712 — not the wallet's active chain. */
const HL_L1_DOMAIN_CHAIN_ID = 1337;

function buildTypedDataPayload(params: {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  return {
    domain: params.domain,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...params.types,
    },
    primaryType: params.primaryType,
    message: params.message,
  };
}

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
      // User-signed HL actions (agent approve) need the wallet's chain — usually Arbitrum.
      if (client.chain?.id) return client.chain.id;
      return client.getChainId();
    },
    async signTypedData(params) {
      const typedData = buildTypedDataPayload(params);
      const domainChainId = Number(
        (params.domain as { chainId?: number | bigint | string }).chainId ?? 0
      );

      // Hyperliquid L1 order signatures use domain chainId 1337 while MetaMask is on 42161.
      // viem rejects that mismatch — use eth_signTypedData_v4 directly.
      if (domainChainId === HL_L1_DOMAIN_CHAIN_ID) {
        return client.request({
          method: 'eth_signTypedData_v4',
          params: [account.address, JSON.stringify(typedData)],
        }) as Promise<`0x${string}`>;
      }

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
