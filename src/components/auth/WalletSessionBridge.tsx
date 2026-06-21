import { useEffect } from 'react';
import { useAccount, useConnectionEffect, useReconnect } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
import { clearWalletSession, touchWalletSession } from '../../lib/walletSession';

/** Keeps wagmi + AppKit in sync and refreshes the 4h wallet session on connect. */
const WalletSessionBridge: React.FC = () => {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();
  const { reconnect } = useReconnect();

  useEffect(() => {
    void reconnect();
  }, [reconnect]);

  useConnectionEffect({
    onConnect({ address }) {
      if (address) touchWalletSession(address);
    },
    onDisconnect() {
      clearWalletSession();
    },
  });

  useEffect(() => {
    const address = wagmiAddress ?? appKitAddress;
    if ((wagmiConnected || appKitConnected) && address) {
      touchWalletSession(address);
    }
  }, [wagmiAddress, appKitAddress, wagmiConnected, appKitConnected]);

  return null;
};

export default WalletSessionBridge;
