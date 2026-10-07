import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

// Point this at your local validator for now. Swap to a devnet/mainnet
// RPC URL once Awan is deployed somewhere other than your machine.
const RPC_ENDPOINT = "http://127.0.0.1:8899";

export const SolanaProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(() => RPC_ENDPOINT, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* An empty wallets array is intentional: Wallet Standard auto-discovers
          any installed wallet (Phantom included), no per-wallet package needed. */}
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
