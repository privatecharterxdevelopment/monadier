import { getAccount, getConnections } from '@wagmi/core';
import type { AbstractViemJsonRpcAccount } from '@nktkas/hyperliquid/signing';
import type { WalletClient } from 'viem';
import { config } from '../wallet';

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
  const account = getAccount(config);
  if (account.connector) {
    try {
      const provider = await account.connector.getProvider();
      if (provider && typeof (provider as EthProvider).request === 'function') {
        return provider as EthProvider;
      }
    } catch {
      /* fall through */
    }
  }

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

const EIP712_DOMAIN_FIELDS = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const;

function normalizeHex(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('0x')) return value;
  return value.toLowerCase();
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const asNum = Number(value);
    return Number.isSafeInteger(asNum) ? asNum : value.toString();
  }
  if (typeof value === 'string' && value.startsWith('0x')) {
    return value.toLowerCase();
  }
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
  const domain = jsonSafe({ ...params.domain }) as Record<string, unknown>;
  if (domain.chainId != null) {
    domain.chainId = Number(domain.chainId);
  }
  if (domain.verifyingContract != null) {
    domain.verifyingContract = normalizeHex(domain.verifyingContract);
  }

  const customTypes = normalizeEip712Types(params.types);
  const types = {
    ...(customTypes.EIP712Domain ? {} : { EIP712Domain: [...EIP712_DOMAIN_FIELDS] }),
    ...customTypes,
  };

  return {
    domain,
    types,
    primaryType: params.primaryType,
    message: jsonSafe(params.message) as Record<string, unknown>,
  };
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json && json !== '{}' && json !== '[]') return json;
  } catch {
    /* circular or non-serializable */
  }
  return Object.prototype.toString.call(value);
}

function unwrapError(err: unknown, depth = 0): string {
  if (depth > 6) return safeStringify(err);
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);

  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause) {
      const causeMsg = unwrapError(cause, depth + 1);
      if (causeMsg && causeMsg !== err.message) return causeMsg;
    }
    // viem attaches richer fields than the generic Error.message.
    const rich = err as Error & { shortMessage?: unknown; details?: unknown };
    if (typeof rich.shortMessage === 'string' && rich.shortMessage) return rich.shortMessage;
    if (typeof rich.details === 'string' && rich.details) return rich.details;
    return err.message || safeStringify(err);
  }

  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    // Unwrap common nested wallet/RPC error shapes first.
    for (const key of ['cause', 'error', 'data'] as const) {
      const nested = o[key];
      if (nested && typeof nested === 'object') {
        const msg = unwrapError(nested, depth + 1);
        if (msg && msg !== '[object Object]') return msg;
      }
    }
    for (const key of ['shortMessage', 'details', 'message', 'reason', 'statusText'] as const) {
      const v = o[key];
      if (typeof v === 'string' && v) return v;
    }
    if (typeof o.code === 'string' || typeof o.code === 'number') {
      return `wallet error code ${String(o.code)}`;
    }
    return safeStringify(o);
  }

  return String(err);
}

/** User-facing copy for HL wallet signature failures. */
export function formatHlWalletSignError(err: unknown): string {
  const raw = unwrapError(err);
  if (/user rejected|rejected the request|denied|cancel/i.test(raw)) {
    return 'Signature cancelled in wallet.';
  }
  if (/Failed to sign typed data with viem wallet/i.test(raw)) {
    const inner = raw.replace(/^Failed to sign typed data with viem wallet\s*/i, '').trim();
    if (inner && inner !== raw) {
      return formatHlWalletSignError(new Error(inner));
    }
    return 'Wallet signature failed — open your wallet app, confirm the Hyperliquid request, or reconnect and retry.';
  }
  if (/Could not sign Hyperliquid order/i.test(raw)) {
    return raw.replace(
      /Could not sign Hyperliquid order \(chainId 1337\)\. Reconnect wallet and try again\.\s*/i,
      'Could not sign Hyperliquid order — reconnect wallet and try again. '
    );
  }
  if (/failed to sign typed data|sign typed data/i.test(raw)) {
    return 'Wallet signature failed — confirm in your wallet app, or reconnect and try again.';
  }
  return raw;
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
  return sig.toLowerCase() as `0x${string}`;
}

async function signTypedDataViaWalletRpc(
  client: WalletClient,
  address: `0x${string}`,
  typedData: ReturnType<typeof buildTypedDataPayload>
): Promise<`0x${string}`> {
  const provider = await resolveSigningProvider(client);
  const errors: string[] = [];

  if (provider) {
    try {
      return await signTypedDataViaProvider(provider, address, typedData);
    } catch (err) {
      const msg = unwrapError(err);
      if (/reject|denied|cancel/i.test(msg)) throw err;
      errors.push(msg);
    }
  }

  try {
    const sig = await client.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(typedData)],
    });
    if (typeof sig === 'string' && sig.startsWith('0x')) {
      return sig.toLowerCase() as `0x${string}`;
    }
    errors.push('Wallet client returned an invalid signature');
  } catch (err) {
    errors.push(unwrapError(err));
  }

  const detail = errors.filter(Boolean).join(' · ') || 'unknown wallet error';
  const chainId = typedData.domain.chainId;
  throw new Error(
    `Could not sign Hyperliquid order (chainId ${String(chainId)}). Reconnect wallet and try again. ${detail}`
  );
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
      // HL uses chainId 1337 for L1 orders and wallet chainId for user-signed actions.
      // Always bypass viem signTypedData — it rejects domain/wallet chain mismatches.
      return signTypedDataViaWalletRpc(client, account.address, typedData);
    },
  };
}
