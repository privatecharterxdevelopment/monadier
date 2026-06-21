import { getConnections } from '@wagmi/core';
import type { AbstractViemJsonRpcAccount } from '@nktkas/hyperliquid/signing';
import type { WalletClient } from 'viem';
import { config } from '../wallet';

/** HL L1 actions always use chainId 1337 in EIP-712 — not the wallet's active chain. */
const HL_L1_DOMAIN_CHAIN_ID = 1337;

type EthProvider = {
  request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
};

function extractProviderFromTransport(client: WalletClient): EthProvider | null {
  const transport = client.transport;
  if (!transport || typeof transport !== 'object') return null;

  const candidates = [
    (transport as { value?: unknown }).value,
    (transport as { provider?: unknown }).provider,
    transport,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && 'request' in candidate) {
      const req = (candidate as EthProvider).request;
      if (typeof req === 'function') return candidate as EthProvider;
    }
  }

  return null;
}

async function resolveSigningProvider(client: WalletClient): Promise<EthProvider | null> {
  const connections = getConnections(config);
  for (const connection of connections) {
    try {
      const provider = await connection.connector.getProvider();
      if (provider && typeof (provider as EthProvider).request === 'function') {
        return provider as EthProvider;
      }
    } catch {
      /* try next connection */
    }
  }

  const fromTransport = extractProviderFromTransport(client);
  if (fromTransport) return fromTransport;

  if (typeof window !== 'undefined') {
    const eth = (window as Window & { ethereum?: EthProvider }).ethereum;
    if (eth?.request) return eth;
  }

  return null;
}

function normalizeEip712Types(
  types: Record<string, unknown> | undefined
): Record<string, Array<{ name: string; type: string }>> {
  const out: Record<string, Array<{ name: string; type: string }>> = {};
  if (!types || typeof types !== 'object' || Array.isArray(types)) return out;

  for (const [key, value] of Object.entries(types)) {
    if (Array.isArray(value)) {
      out[key] = value as Array<{ name: string; type: string }>;
    }
  }
  return out;
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)])
    );
  }
  return value;
}

function buildTypedDataPayload(params: {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  const domain = { ...params.domain };
  if (domain.chainId != null) {
    domain.chainId = Number(domain.chainId);
  }
  const customTypes = normalizeEip712Types(params.types);
  return {
    domain: jsonSafe(domain) as Record<string, unknown>,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...customTypes,
    },
    primaryType: params.primaryType,
    message: jsonSafe(params.message) as Record<string, unknown>,
  };
}

async function signTypedDataViaProvider(
  provider: EthProvider,
  address: `0x${string}`,
  typedData: ReturnType<typeof buildTypedDataPayload>
): Promise<`0x${string}`> {
  const sig = await provider.request({
    method: 'eth_signTypedData_v4',
    params: [address, JSON.stringify(typedData)],
  });
  if (typeof sig !== 'string' || !sig.startsWith('0x')) {
    throw new Error('Wallet returned an invalid signature');
  }
  return sig as `0x${string}`;
}

async function signHlL1TypedData(
  client: WalletClient,
  address: `0x${string}`,
  typedData: ReturnType<typeof buildTypedDataPayload>
): Promise<`0x${string}`> {
  const provider = await resolveSigningProvider(client);
  if (provider) {
    try {
      return await signTypedDataViaProvider(provider, address, typedData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/reject|denied|cancel/i.test(msg)) throw err;
      /* fall through to client.request */
    }
  }

  try {
    return (await client.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(typedData)],
    })) as `0x${string}`;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not sign Hyperliquid order (chainId 1337). Reconnect wallet and try again. ${detail}`
    );
  }
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
      if (client.chain?.id) return client.chain.id;
      return client.getChainId();
    },
    async signTypedData(params) {
      const typedData = buildTypedDataPayload(params);
      const domainChainId = Number(
        (params.domain as { chainId?: number | bigint | string }).chainId ?? 0
      );

      // Perp L1 orders — domain chainId 1337; must bypass viem chain validation.
      if (domainChainId === HL_L1_DOMAIN_CHAIN_ID) {
        return signHlL1TypedData(client, account.address, typedData);
      }

      return client.signTypedData({
        account,
        domain: params.domain,
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          ...normalizeEip712Types(params.types),
        },
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };
}
