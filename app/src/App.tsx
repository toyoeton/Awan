import { FC, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAwanProgram } from "./Useawanprogram";

const LAMPORTS_PER_SOL = 1_000_000_000;

const App: FC = () => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const program = useAwanProgram();

  const [duelAddress, setDuelAddress] = useState("");
  const [duel, setDuel] = useState<any>(null);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [joinAmount, setJoinAmount] = useState("2");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [raising, setRaising] = useState(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);

  const [conceding, setConceding] = useState(false);
  const [concedeError, setConcedeError] = useState<string | null>(null);

  function getDuelPda(): PublicKey {
    return new PublicKey(duelAddress.trim());
  }

  async function loadDuel() {
    setError(null);
    setDuel(null);
    setSettled(false);

    if (!program) {
      setError("Connect a wallet first.");
      return;
    }

    try {
      setLoading(true);
      const account = await program.account.duel.fetch(getDuelPda());
      setDuel(account);
    } catch (err: any) {
      // A closed account (post-concede) fetches as "does not exist", that's
      // expected once a duel settles, not a real error.
      if (String(err.message).includes("Account does not exist")) {
        setSettled(true);
      } else {
        setError(err.message ?? "Failed to load that duel.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    setJoinError(null);
    if (!program || !publicKey) {
      setJoinError("Connect a wallet first.");
      return;
    }
    try {
      setJoining(true);
      const amountLamports = new BN(
        Math.round(parseFloat(joinAmount) * LAMPORTS_PER_SOL)
      );
      await program.methods
        .joinDuel(amountLamports)
        .accounts({ bidder: publicKey, duel: getDuelPda() })
        .rpc();
      await loadDuel();
    } catch (err: any) {
      setJoinError(err.message ?? "Join failed.");
    } finally {
      setJoining(false);
    }
  }

  async function handleRaise(newBidLamports: BN) {
    setRaiseError(null);
    if (!program || !publicKey) {
      setRaiseError("Connect a wallet first.");
      return;
    }
    try {
      setRaising(true);
      await program.methods
        .raise(newBidLamports)
        .accounts({ bidder: publicKey, duel: getDuelPda() })
        .rpc();
      await loadDuel();
    } catch (err: any) {
      setRaiseError(err.message ?? "Raise failed.");
    } finally {
      setRaising(false);
    }
  }

  async function handleConcede() {
    setConcedeError(null);
    if (!program || !publicKey || !duel) {
      setConcedeError("Connect a wallet and load a duel first.");
      return;
    }

    const bidderA = duel.bidderA.toBase58();
    const bidderB = duel.bidderB.toBase58();
    const me = publicKey.toBase58();

    let winner: PublicKey;
    if (me === bidderA) {
      winner = duel.bidderB;
    } else if (me === bidderB) {
      winner = duel.bidderA;
    } else {
      setConcedeError("Connected wallet isn't a bidder in this duel.");
      return;
    }

    try {
      setConceding(true);
      await program.methods
        .concede()
        .accountsPartial({
          conceder: publicKey,
          duel: getDuelPda(),
          seller: duel.seller,
          winner,
          nftMint: duel.nftMint,
        })
        .rpc();
      await loadDuel();
    } catch (err: any) {
      setConcedeError(err.message ?? "Concede failed.");
    } finally {
      setConceding(false);
    }
  }

  function getRaiseOptions(): { label: string; lamports: BN; sol: number }[] {
    if (!duel) return [];
    const leading = Math.max(duel.bidA.toNumber(), duel.bidB.toNumber());
    const max = duel.maxPrice.toNumber();
    const remaining = max - leading;

    return [0.1, 0.25, 0.5, 1.0].map((pct) => {
      const lamportsNum = Math.round(leading + remaining * pct);
      return {
        label: pct === 1 ? "Buyout" : `+${pct * 100}%`,
        lamports: new BN(lamportsNum),
        sol: lamportsNum / LAMPORTS_PER_SOL,
      };
    });
  }

  const isMyTurn =
    duel && publicKey && duel.turn.toBase58() === publicKey.toBase58();
  const isBidder =
    duel &&
    publicKey &&
    (duel.bidderA.toBase58() === publicKey.toBase58() ||
      duel.bidderB.toBase58() === publicKey.toBase58());

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 520 }}>
      <h1>Awan</h1>
      <p style={{ color: "#666" }}>Connected to {connection.rpcEndpoint}</p>

      <WalletMultiButton />

      <div style={{ marginTop: "1.5rem" }}>
        {connected && publicKey ? (
          <p>
            Wallet: <code>{publicKey.toBase58()}</code>
          </p>
        ) : (
          <p style={{ color: "#999" }}>No wallet connected yet.</p>
        )}
      </div>

      <hr style={{ margin: "2rem 0" }} />

      <h2>Load a Duel</h2>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          placeholder="Duel PDA address"
          value={duelAddress}
          onChange={(e) => setDuelAddress(e.target.value)}
          style={{ flex: 1, padding: "0.5rem" }}
        />
        <button onClick={loadDuel} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {settled && (
        <p style={{ color: "green", fontWeight: "bold" }}>
          This duel has been settled and closed. NFT and funds already paid
          out.
        </p>
      )}

      {duel && (
        <div style={{ marginTop: "1.5rem", lineHeight: 1.8 }}>
          <p>
            <strong>Seller:</strong> {duel.seller.toBase58()}
          </p>
          <p>
            <strong>NFT mint:</strong> {duel.nftMint.toBase58()}
          </p>
          <p>
            <strong>Min price:</strong>{" "}
            {duel.minPrice.toNumber() / LAMPORTS_PER_SOL} SOL
          </p>
          <p>
            <strong>Max price:</strong>{" "}
            {duel.maxPrice.toNumber() / LAMPORTS_PER_SOL} SOL
          </p>
          <p>
            <strong>Bidder A:</strong> {duel.bidderA.toBase58()} (
            {duel.bidA.toNumber() / LAMPORTS_PER_SOL} SOL)
          </p>
          <p>
            <strong>Bidder B:</strong> {duel.bidderB.toBase58()} (
            {duel.bidB.toNumber() / LAMPORTS_PER_SOL} SOL)
          </p>
          <p>
            <strong>Turn:</strong> {duel.turn.toBase58()}
          </p>
          <p>
            <strong>Status:</strong> {Object.keys(duel.status)[0]}
          </p>
        </div>
      )}

      <hr style={{ margin: "2rem 0" }} />

      <h2>Join This Duel</h2>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Joins using whichever wallet is currently connected above. Locks the
        duel's full max_price, regardless of your opening bid.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="number"
          step="0.1"
          value={joinAmount}
          onChange={(e) => setJoinAmount(e.target.value)}
          style={{ width: "100px", padding: "0.5rem" }}
        />
        <span>SOL opening bid</span>
        <button onClick={handleJoin} disabled={joining}>
          {joining ? "Joining..." : "Join"}
        </button>
      </div>
      {joinError && <p style={{ color: "crimson" }}>{joinError}</p>}

      {duel && Object.keys(duel.status)[0] === "open" && (
        <>
          <hr style={{ margin: "2rem 0" }} />
          <h2>Raise</h2>
          {!isMyTurn && (
            <p style={{ color: "#999" }}>
              Not your turn, the Raise buttons are disabled.
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {getRaiseOptions().map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleRaise(opt.lamports)}
                disabled={!isMyTurn || raising}
              >
                {opt.label} ({opt.sol.toFixed(2)} SOL)
              </button>
            ))}
          </div>
          {raiseError && <p style={{ color: "crimson" }}>{raiseError}</p>}

          <h2 style={{ marginTop: "2rem" }}>Concede</h2>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>
            Forfeits for the connected wallet. The other bidder wins at their
            current bid, gets refunded the overflow, and receives the NFT.
            You get your full locked amount back.
          </p>
          {!isBidder && (
            <p style={{ color: "#999" }}>
              Connected wallet isn't a bidder in this duel.
            </p>
          )}
          <button
            onClick={handleConcede}
            disabled={!isBidder || conceding}
            style={{ background: "#fee", borderColor: "crimson" }}
          >
            {conceding ? "Conceding..." : "Concede"}
          </button>
          {concedeError && <p style={{ color: "crimson" }}>{concedeError}</p>}
        </>
      )}
    </div>
  );
};

export default App;
