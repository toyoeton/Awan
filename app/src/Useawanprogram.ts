import { useMemo } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import idl from "../../target/idl/awan.json";
import type { Awan } from "../../target/types/awan";

// Returns a typed Program instance bound to whatever wallet is currently
// connected through Phantom (or any wallet, via Wallet Standard). Returns
// null until a wallet is actually connected, since Anchor needs a signer.
export function useAwanProgram(): Program<Awan> | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    return new Program<Awan>(idl as Awan, provider);
  }, [connection, wallet]);
}