import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

// Set VITE_SOLANA_RPC_ENDPOINT for local validator rehearsal; Devnet is default.
const RPC_ENDPOINT = import.meta.env.VITE_SOLANA_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
export const NETWORK_LABEL = RPC_ENDPOINT.includes("127.0.0.1") || RPC_ENDPOINT.includes("localhost")
  ? "Solana Localnet"
  : RPC_ENDPOINT.includes("devnet")
    ? "Solana Devnet"
    : "Solana network";

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
