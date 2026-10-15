import { useMemo } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import idl from "../../target/idl/awan.json";
import type { Awan } from "../../target/types/awan";

// Anchor requires a Wallet even for reads. This fallback has no signing
// capability, so visitors can browse the public marketplace before connecting.
const readOnlyWallet: ConstructorParameters<typeof AnchorProvider>[1] = {
  publicKey: PublicKey.default,
  signTransaction: async (_transaction: Transaction | VersionedTransaction) => {
    throw new Error("Connect a wallet to sign this transaction.");
  },
  signAllTransactions: async (_transactions: (Transaction | VersionedTransaction)[]) => {
    throw new Error("Connect a wallet to sign this transaction.");
  },
};

export function useAwanProgram(): Program<Awan> {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    const provider = new AnchorProvider(connection, wallet ?? readOnlyWallet, {
      commitment: "confirmed",
    });

    return new Program<Awan>(idl as Awan, provider);
  }, [connection, wallet]);
}
