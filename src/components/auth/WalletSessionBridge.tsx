import { useEffect, useRef } from 'react';
import { getConnections } from '@wagmi/core';
import { useAccount, useConnectionEffect } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
import { config } from '../../lib/wallet';
import { runWalletReconnect } from '../../lib/walletReconnect';
import {
  extendWalletSessionOnActivity,
  readWalletSession,
  touchWalletSession,
} from '../../lib/walletSession';

function persistSession(address: string, connectorId?: string) {
  let cid = connectorId;
  if (!cid) {
    const match = getConnections(config).find((c) =>
      c.accounts.some((a) => a.toLowerCase() === address.toLowerCase())
    );
    cid = match?.connector.id;
  }
  touchWalletSession(address, cid);
}

/** Keeps wagmi in sync and maintains wallet session across reloads — silent reconnect only. */
const WalletSessionBridge: React.FC = () => {
  const { address: wagmiAddress, isConnected: wagmiConnected, status: wagmiStatus } = useAccount();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();

  const wagmiConnectedRef = useRef(wagmiConnected);
  const appKitConnectedRef = useRef(appKitConnected);
  const wagmiStatusRef = useRef(wagmiStatus);
  const mountReconnectDone = useRef(false);

  wagmiConnectedRef.current = wagmiConnected;
  appKitConnectedRef.current = appKitConnected;
  wagmiStatusRef.current = wagmiStatus;

  useEffect(() => {
    if (mountReconnectDone.current) return;
    mountReconnectDone.current = true;
    void runWalletReconnect({ force: true });
  }, []);

  useConnectionEffect({
    onConnect({ address, connector }) {
      if (address) persistSession(address, connector?.id);
    },
  });

  useEffect(() => {
    const address = wagmiAddress ?? appKitAddress;
    if ((wagmiConnected || appKitConnected) && address) {
      persistSession(address);
    }
  }, [wagmiAddress, appKitAddress, wagmiConnected, appKitConnected]);

  useEffect(() => {
    const onActivity = () => {
      if (document.visibilityState === 'hidden') return;
      const session = readWalletSession();
      if (!session) return;
      extendWalletSessionOnActivity();

      const status = wagmiStatusRef.current;
      if (
        wagmiConnectedRef.current ||
        appKitConnectedRef.current ||
        status === 'connecting' ||
        status === 'reconnecting'
      ) {
        return;
      }

      if (getConnections(config).length > 0) return;

      void runWalletReconnect();
    };

    document.addEventListener('visibilitychange', onActivity);
    return () => document.removeEventListener('visibilitychange', onActivity);
  }, []);

  return null;
};

export default WalletSessionBridge;
