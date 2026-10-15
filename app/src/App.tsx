import { FC, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAwanProgram } from "./Useawanprogram";
import { NETWORK_LABEL } from "./SolanaProvider";
import "./App.css";

const LAMPORTS_PER_SOL = 1_000_000_000;
type UserRole = "bidder" | "lister";

function solToLamports(value: string): BN {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(trimmed)) {
    throw new Error("Enter a SOL amount with up to 9 decimal places.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return new BN(whole).mul(new BN(LAMPORTS_PER_SOL)).add(new BN(fraction.padEnd(9, "0") || "0"));
}

function resolveMetadataUrl(value: string): string | undefined {
  if (value.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${value.slice(7).replace(/^ipfs\//, "")}`;
  if (value.startsWith("ar://")) return `https://arweave.net/${value.slice(5)}`;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

type NftVisualData = {
  collection: string;
  title: string;
  accentA: string;
  accentB: string;
  accentC: string;
  badge: string;
};

type NftMetadata = { name: string; symbol?: string; image?: string };

function buildNftVisualData(mintAddress?: string, forcedTitle?: string): NftVisualData {
  const source = (mintAddress ?? "Awan NFT").trim() || "Awan NFT";
  const hash = [...source].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const palettes = [
    { accentA: "#d5f36a", accentB: "#8dd7f7", accentC: "#fff5b8" },
    { accentA: "#ffa76b", accentB: "#f36d8b", accentC: "#ffe0a6" },
    { accentA: "#7cf0d0", accentB: "#5fa0ff", accentC: "#d4ccff" },
    { accentA: "#d0a6ff", accentB: "#8ad0ff", accentC: "#f7ffb4" },
  ];
  const palette = palettes[hash % palettes.length];

  return {
    collection: "SPL NFT",
    title: forcedTitle ?? `NFT ${source.slice(-4)}`,
    accentA: palette.accentA,
    accentB: palette.accentB,
    accentC: palette.accentC,
    badge: "Auction",
  };
}

function NftVisual({ mintAddress, title, status, imageUrl }: { mintAddress?: string; title?: string; status?: string; imageUrl?: string }) {
  const data = buildNftVisualData(mintAddress, title);

  return (
    <div className="nft-visual-card">
      <div
        className="nft-visual"
        style={{
          background: `radial-gradient(circle at top left, ${data.accentC} 0%, ${data.accentA} 20%, ${data.accentB} 60%, #171912 100%)`,
        }}
      >
        {imageUrl && <img className="nft-visual__image" src={imageUrl} alt={title ?? "NFT artwork"} loading="lazy" />}
        <div className="nft-visual__header">
          <span>{status ?? data.badge}</span>
          <span>{data.collection}</span>
        </div>
        <div className="nft-visual__art">
          <div className="nft-visual__orb" />
          <div className="nft-visual__ring" />
        </div>
        <div className="nft-visual__footer">
          <strong>{data.title}</strong>
          <small>{mintAddress ? `${mintAddress.slice(0, 6)}…${mintAddress.slice(-4)}` : "Live NFT"}</small>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "open"
      ? "awan-badge awan-badge-open"
      : status === "settled"
      ? "awan-badge awan-badge-settled"
      : "awan-badge awan-badge-waiting";
  return <span className={className}>{status}</span>;
}

const App: FC = () => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const program = useAwanProgram();

  const [duelAddress, setDuelAddress] = useState("");
  const [duel, setDuel] = useState<any>(null);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("bidder");

  const [joinAmount, setJoinAmount] = useState("2");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [raising, setRaising] = useState(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);


  const [listingMinPrice, setListingMinPrice] = useState("2");
  const [listingMaxPrice, setListingMaxPrice] = useState("10");
  const [listingMint, setListingMint] = useState("");
  const [listingDuration, setListingDuration] = useState("300");
  const [ownedNfts, setOwnedNfts] = useState<{ mint: string; tokenAccount: string }[]>([]);
  const [nftLoadError, setNftLoadError] = useState<string | null>(null);
  const [marketAuctions, setMarketAuctions] = useState<{ publicKey: PublicKey; account: any }[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [nftMetadata, setNftMetadata] = useState<Record<string, NftMetadata>>({});
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [creatingDuel, setCreatingDuel] = useState(false);
  const [settling, setSettling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdDuelAddress, setCreatedDuelAddress] = useState<string | null>(null);

  async function readNftMetadata(mintAddress: string): Promise<NftMetadata | null> {
    try {
      const mint = new PublicKey(mintAddress);
      const metadataProgram = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("metadata"), metadataProgram.toBuffer(), mint.toBuffer()],
        metadataProgram,
      );
      const metadataAccount = await connection.getAccountInfo(metadataPda);
      if (!metadataAccount) return null;
      const data = metadataAccount.data;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let offset = 1 + 32 + 32;
      const readString = () => {
        const length = view.getUint32(offset, true);
        offset += 4;
        const value = new TextDecoder().decode(data.subarray(offset, offset + length)).replace(/\0+$/g, "").trim();
        offset += length;
        return value;
      };
      const name = readString();
      const symbol = readString();
      const uri = readString().replace(/\0+$/g, "").trim();
      if (!uri) return { name, symbol };
      const jsonUrl = resolveMetadataUrl(uri);
      if (!jsonUrl) return { name, symbol };
      const response = await fetch(jsonUrl, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { name, symbol };
      const json = await response.json();
      const image = typeof json.image === "string" ? json.image : undefined;
      const resolvedImage = image ? resolveMetadataUrl(image) : undefined;
      return { name: typeof json.name === "string" ? json.name : name, symbol, image: resolvedImage };
    } catch {
      return null;
    }
  }

  async function loadMetadataFor(mints: string[]) {
    const uniqueMints = [...new Set(mints)].filter((mint) => mint && !nftMetadata[mint]);
    const entries = await Promise.all(uniqueMints.map(async (mint) => [mint, await readNftMetadata(mint)] as const));
    setNftMetadata((previous) => {
      const next = { ...previous };
      entries.forEach(([mint, metadata]) => { if (metadata) next[mint] = metadata; });
      return next;
    });
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadMyNfts() {
    setNftLoadError(null);
    if (!publicKey) return;
    try {
      const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const associatedTokenProgram = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
      const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: tokenProgram });
      const nfts = accounts.value.flatMap(({ pubkey, account }) => {
        const parsed = (account.data as any).parsed.info;
        const mint = new PublicKey(parsed.mint);
        const [ata] = PublicKey.findProgramAddressSync(
          [publicKey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()], associatedTokenProgram,
        );
        return pubkey.equals(ata) && parsed.tokenAmount.decimals === 0 && parsed.tokenAmount.amount === "1"
          ? [{ mint: parsed.mint as string, tokenAccount: pubkey.toBase58() }]
          : [];
      });
      setOwnedNfts(nfts);
      void loadMetadataFor(nfts.map((nft) => nft.mint));
      if (!listingMint && nfts.length) setListingMint(nfts[0].mint);
    } catch (err: any) {
      setNftLoadError(err.message ?? "Could not load NFTs from this wallet.");
    }
  }

  async function loadMarketplace() {
    setMarketLoading(true);
    try {
      const auctions = await program.account.duel.all();
      setMarketAuctions(auctions.filter(({ account }) => {
        const status = Object.keys(account.status)[0];
        return status === "awaitingBidders" || status === "open";
      }));
      void loadMetadataFor(auctions.map(({ account }) => account.nftMint.toBase58()));
    } catch (err: any) {
      setError(err.message ?? "Could not load marketplace auctions.");
    } finally {
      setMarketLoading(false);
    }
  }

  useEffect(() => { void loadMarketplace(); }, [program]);
  useEffect(() => { if (userRole === "lister" && publicKey) void loadMyNfts(); }, [userRole, publicKey]);

  async function handleCreateDuel() {
    setCreateError(null);
    setCreatedDuelAddress(null);
    if (!program || !publicKey) {
      setCreateError("Connect a wallet first.");
      return;
    }

    try {
      const mint = new PublicKey(listingMint.trim());
      const minLamports = solToLamports(listingMinPrice);
      const maxLamports = solToLamports(listingMaxPrice);
      const durationSeconds = Number(listingDuration);
      if (minLamports.lten(0) || maxLamports.lte(minLamports)) {
        throw new Error("Enter a minimum above zero and a maximum higher than the minimum.");
      }
      if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 2_592_000) {
        throw new Error("Auction duration must be from 1 minute to 30 days.");
      }

      // The program accepts classic SPL Token NFTs (one token, zero decimals).
      const mintInfo = await connection.getParsedAccountInfo(mint);
      const parsedMint = (mintInfo.value?.data as any)?.parsed?.info;
      if (!parsedMint || parsedMint.decimals !== 0 || parsedMint.supply !== "1") {
        throw new Error("This mint is not a classic one-of-one NFT (supply 1, 0 decimals).");
      }

      setCreatingDuel(true);
      const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const associatedTokenProgram = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
      const [duelPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("duel"), mint.toBuffer(), publicKey.toBuffer()],
        program.programId,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("vault"), duelPda.toBuffer()],
        program.programId,
      );
      const associatedAddress = (owner: PublicKey) => PublicKey.findProgramAddressSync(
        [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
        associatedTokenProgram,
      )[0];
      const sellerAta = associatedAddress(publicKey);
      const sellerToken = await connection.getParsedAccountInfo(sellerAta);
      const sellerTokenInfo = (sellerToken.value?.data as any)?.parsed?.info;
      if (!sellerTokenInfo || sellerTokenInfo.mint !== mint.toBase58() || sellerTokenInfo.tokenAmount.amount !== "1") {
        throw new Error("This wallet does not hold this NFT in its associated token account.");
      }

      await program.methods.createDuel(
        minLamports,
        maxLamports,
        new BN(durationSeconds),
      ).accountsPartial({
        seller: publicKey,
        nftMint: mint,
        duel: duelPda,
        vault: vaultPda,
        sellerNftAccount: sellerAta,
        vaultNftAccount: associatedAddress(vaultPda),
        tokenProgram,
        associatedTokenProgram,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      }).rpc();

      setCreatedDuelAddress(duelPda.toBase58());
      await loadMarketplace();
    } catch (err: any) {
      setCreateError(err.message ?? "Could not create the duel.");
    } finally {
      setCreatingDuel(false);
    }
  }

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
      void loadMetadataFor([account.nftMint.toBase58()]);
      setDuelAddress(getDuelPda().toBase58());
    } catch (err: any) {
      if (String(err.message).includes("Account does not exist")) {
        setSettled(true);
      } else {
        setError(err.message ?? "Failed to load that duel.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function openAuction(address: PublicKey) {
    setDuelAddress(address.toBase58());
    setError(null);
    setSettled(false);
    if (!program) return;
    try {
      setLoading(true);
      const account = await program.account.duel.fetch(address);
      setDuel(account);
      void loadMetadataFor([account.nftMint.toBase58()]);
    } catch (err: any) {
      setError(err.message ?? "Could not load this auction.");
      setDuel(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize() {
    if (!program || !duel || !publicKey || now < duel.endsAt.toNumber()) return;
    const bidderAWins = duel.bidA.gt(duel.bidB);
    const winner = bidderAWins ? duel.bidderA : duel.bidderB;
    const loser = bidderAWins ? duel.bidderB : duel.bidderA;
    try {
      setSettling(true);
      setError(null);
      await program.methods.finalize().accountsPartial({
        caller: publicKey, duel: getDuelPda(), seller: duel.seller, winner, loser, nftMint: duel.nftMint,
      }).rpc();
      await loadDuel();
      await loadMarketplace();
    } catch (err: any) {
      setError(err.message ?? "Could not settle this auction.");
    } finally {
      setSettling(false);
    }
  }

  async function handleCancelListing() {
    if (!program || !duel || !publicKey) return;
    try {
      setCancelling(true);
      const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const associatedTokenProgram = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
      const [vault] = PublicKey.findProgramAddressSync([new TextEncoder().encode("vault"), getDuelPda().toBuffer()], program.programId);
      const associatedAddress = (owner: PublicKey) => PublicKey.findProgramAddressSync(
        [owner.toBuffer(), tokenProgram.toBuffer(), duel.nftMint.toBuffer()], associatedTokenProgram,
      )[0];
      await program.methods.cancelListing().accountsPartial({
        caller: publicKey, seller: duel.seller, duel: getDuelPda(), vault, nftMint: duel.nftMint,
        vaultNftAccount: associatedAddress(vault), sellerNftAccount: associatedAddress(publicKey),
        bidderA: duel.bidderA.equals(PublicKey.default) ? null : duel.bidderA,
      }).rpc();
      await loadDuel();
      await loadMarketplace();
    } catch (err: any) {
      setError(err.message ?? "Could not cancel this listing.");
    } finally {
      setCancelling(false);
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
      const amountLamports = solToLamports(joinAmount);
      await program.methods
        .joinDuel(amountLamports)
        .accounts({ bidder: publicKey, duel: getDuelPda() })
        .rpc();
      await loadDuel();
      await loadMarketplace();
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
      await loadMarketplace();
    } catch (err: any) {
      setRaiseError(err.message ?? "Raise failed.");
    } finally {
      setRaising(false);
    }
  }

  function getRaiseOptions(): { label: string; lamports: BN; sol: number }[] {
    if (!duel) return [];
    const leading = duel.bidA.gte(duel.bidB) ? duel.bidA : duel.bidB;
    const max = duel.maxPrice as BN;
    if (leading.gte(max)) return [];
    const remaining = max.sub(leading);
    const options = [0.1, 0.25, 0.5, 1.0].map((pct) => ({
      label: pct === 1 ? "Buyout" : `+${pct * 100}%`,
      lamports: leading.add(remaining.muln(Math.round(pct * 100)).divn(100)),
    }));
    const unique = new Map<string, { label: string; lamports: BN; sol: number }>();
    for (const option of options) {
      if (option.lamports.gt(leading) && option.lamports.lte(max)) {
        unique.set(option.lamports.toString(), { ...option, sol: option.lamports.toNumber() / LAMPORTS_PER_SOL });
      }
    }
    return [...unique.values()];
  }

  const nftPreviewMint = duel ? duel.nftMint.toBase58() : "AwanDeck";
  const isMyTurn =
    duel && publicKey && duel.turn.toBase58() === publicKey.toBase58();

  return (
    <div className="awan-app">
      <div className="awan-header">
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <div>
            <h1>Awan<span className="brand-period">.</span></h1>
            <p className="awan-endpoint">NFT auctions on {NETWORK_LABEL}</p>
          </div>
        </div>
        <WalletMultiButton />
      </div>

      {connected && publicKey && (
        <p className="awan-wallet-line">
          <span className="connection-dot" /> Connected <code>{publicKey.toBase58()}</code>
        </p>
      )}

      <section className="intro">
        <p className="eyebrow">{NETWORK_LABEL.toUpperCase()} • ON-CHAIN NFT AUCTIONS</p>
        <h2>Two bidders.<br /><span>One winner.</span></h2>
        <p>Browse auctions without a wallet. Connect one to list an NFT or join a room.</p>
      </section>

      <div className="awan-card role-switch-card">
        <div className="section-heading">
          <div>
            <span className="step-label">00 / SELECT ROLE</span>
            <h2>Choose how you want to play</h2>
          </div>
        </div>
        <div className="role-switch" role="tablist" aria-label="User role selector">
          <button
            className={`awan-button role-button ${userRole === "bidder" ? "role-button-active" : ""}`}
            onClick={() => setUserRole("bidder")}
          >
            Bidder
          </button>
          <button
            className={`awan-button role-button ${userRole === "lister" ? "role-button-active" : ""}`}
            onClick={() => setUserRole("lister")}
          >
            Lister
          </button>
        </div>
      </div>

      {userRole === "bidder" ? (
        <>
          <div className="awan-card load-card">
            <div className="section-heading">
              <div><span className="step-label">01 / FIND AN AUCTION</span><h2>Browse auction rooms</h2></div>
              <span className="heading-icon">↗</span>
            </div>
            <div className="marketplace-block">
              <div className="section-heading">
                <div><span className="step-label">LIVE ON-CHAIN LISTINGS</span><h2>Browse auctions</h2></div>
                <button className="awan-button" onClick={loadMarketplace} disabled={marketLoading}>{marketLoading ? "Refreshing…" : "Refresh"}</button>
              </div>
              {marketAuctions.length === 0 ? <p className="hint">{marketLoading ? "Loading auctions…" : "No active auctions found on this network."}</p> : (
                <div className="market-grid">
                  {marketAuctions.map(({ publicKey: address, account }) => {
                    const status = Object.keys(account.status)[0];
                    const mint = account.nftMint.toBase58();
                    return <button className="market-item" key={address.toBase58()} onClick={() => openAuction(address)}>
                      <NftVisual mintAddress={mint} title={nftMetadata[mint]?.name} imageUrl={nftMetadata[mint]?.image} status={status === "open" ? "Live" : "Waiting"} />
                      {nftMetadata[mint]?.name && <strong className="market-name">{nftMetadata[mint].name}</strong>}
                      <span className="market-price">{(account.minPrice.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} – {(account.maxPrice.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} SOL</span>
                      <small>{status === "open" ? `Ends ${new Date(account.endsAt.toNumber() * 1000).toLocaleString()}` : "Waiting for two bidders"}</small>
                      <code>{address.toBase58().slice(0, 8)}…{address.toBase58().slice(-5)}</code>
                    </button>;
                  })}
                </div>
              )}
            </div>
            <div className="awan-row">
              <input
                type="text"
                placeholder="Paste an auction room address"
                value={duelAddress}
                onChange={(e) => setDuelAddress(e.target.value)}
                className="awan-input awan-pda-input"
              />
              <button className="awan-button awan-button-primary" onClick={loadDuel} disabled={loading}>
                {loading ? "Loading…" : "Open room"}
              </button>
            </div>
            {error && <p className="awan-error">{error}</p>}
            {settled && (
              <p className="awan-settled-banner">
                No active auction room exists at this address. It may have been settled or the address may be invalid.
              </p>
            )}

            {duel && (
              <div className="duel-overview">
                <div className="nft-hero">
                  <NftVisual mintAddress={duel.nftMint.toBase58()} title={nftMetadata[duel.nftMint.toBase58()]?.name} imageUrl={nftMetadata[duel.nftMint.toBase58()]?.image} status="Escrowed NFT" />
                  <div className="nft-hero__details">
                    <span className="step-label">NFT MINT</span>
                    <h3>{nftMetadata[duel.nftMint.toBase58()]?.name ?? `${duel.nftMint.toBase58().slice(0, 8)}…${duel.nftMint.toBase58().slice(-6)}`}</h3>
                    <p>Classic SPL one-of-one token held in the auction escrow.</p>
                    <div className="duel-topline"><span className="step-label">AUCTION ROOM</span><StatusBadge status={Object.keys(duel.status)[0]} /></div>
                  </div>
                </div>

                <div className="bidder-grid">
                  {[
                    { name: "Bidder A", key: duel.bidderA, bid: duel.bidA },
                    { name: "Bidder B", key: duel.bidderB, bid: duel.bidB },
                  ].map((bidder, index) => {
                    const turnIsLive = Object.keys(duel.status)[0] === "open" && duel.turn.toBase58() === bidder.key.toBase58();
                    return (
                      <div className={`bidder-panel ${turnIsLive ? "is-turn" : ""}`} key={bidder.name}>
                        <div className="bidder-label"><span className="bidder-avatar">{index === 0 ? "A" : "B"}</span>{bidder.name}{turnIsLive && <span className="turn-tag">UP NEXT</span>}</div>
                        <strong className="bid-amount">{(bidder.bid.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} <small>SOL</small></strong>
                        <span className="wallet-short">{bidder.key.toBase58() === PublicKey.default.toBase58() ? "Waiting for bidder" : `${bidder.key.toBase58().slice(0, 5)}…${bidder.key.toBase58().slice(-5)}`}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="duel-meta">
                  <div><span>PRICE RANGE</span><strong>{(duel.minPrice.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} – {(duel.maxPrice.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} SOL</strong></div>
                  <div><span>NFT MINT</span><strong title={duel.nftMint.toBase58()}>{duel.nftMint.toBase58().slice(0, 7)}…{duel.nftMint.toBase58().slice(-6)}</strong></div>
                  <div><span>{Object.keys(duel.status)[0] === "open" ? "AUCTION ENDS" : "BIDDING WINDOW"}</span><strong>{Object.keys(duel.status)[0] === "open" ? new Date(duel.endsAt.toNumber() * 1000).toLocaleString() : `${Math.max(0, Math.ceil((duel.createdAt.toNumber() + duel.durationSeconds.toNumber() - now) / 60))} min left for two bidders to join`}</strong></div>
                </div>
                {Object.keys(duel.status)[0] === "open" && <p className="hint">{now < duel.endsAt.toNumber() ? `Time left: ${Math.floor((duel.endsAt.toNumber() - now) / 3600)}h ${Math.floor(((duel.endsAt.toNumber() - now) % 3600) / 60)}m ${Math.max(0, (duel.endsAt.toNumber() - now) % 60)}s` : "Bidding has ended. Anyone can settle this auction."}</p>}
                {Object.keys(duel.status)[0] === "open" && <p className="hint">A valid raise must beat the other bidder’s current bid. If final bids tie, bidder B wins.</p>}
                <button className="awan-button" onClick={() => openAuction(getDuelPda())} disabled={loading}>{loading ? "Refreshing room…" : "Refresh room"}</button>
                {Object.keys(duel.status)[0] === "open" && now >= duel.endsAt.toNumber() && <button className="awan-button awan-button-primary" onClick={handleFinalize} disabled={settling || !publicKey}>{settling ? "Settling…" : "Settle auction and transfer NFT"}</button>}
                {Object.keys(duel.status)[0] === "awaitingBidders" && publicKey && now >= duel.createdAt.toNumber() + duel.durationSeconds.toNumber() && <button className="awan-button awan-button-danger" onClick={handleCancelListing} disabled={cancelling}>{cancelling ? "Returning NFT…" : "Return NFT and refund first bidder"}</button>}
                <details className="duel-details"><summary>Seller and account details</summary><div className="awan-field"><span className="awan-field-label">Seller</span><span className="awan-field-value">{duel.seller.toBase58()}</span></div><div className="awan-field"><span className="awan-field-label">Auction room address</span><span className="awan-field-value">{duelAddress}</span></div></details>
              </div>
            )}
          </div>

          <div className="awan-card">
            <div className="section-heading"><div><span className="step-label">02 / JOIN AN AUCTION</span><h2>Join this auction</h2></div><span className="heading-icon">＋</span></div>
            <p className="hint">
              Joins using whichever wallet is currently connected. Locks the
              auction's full maximum price, regardless of your opening bid.
            </p>
            <div className="awan-row">
              <input
                type="text"
                value={joinAmount}
                onChange={(e) => setJoinAmount(e.target.value)}
                className="awan-input"
                style={{ maxWidth: "160px" }}
              />
              <span className="input-suffix">SOL opening bid</span>
              {!publicKey && <p className="hint">Connect a wallet to join. Your wallet must cover the full maximum price plus transaction fees.</p>}
              <button className="awan-button awan-button-primary" onClick={handleJoin} disabled={joining || !publicKey || !duel || Object.keys(duel.status)[0] !== "awaitingBidders"}>
                {joining ? "Joining…" : !publicKey ? "Connect wallet to join" : "Join auction"}
              </button>
            </div>
            {joinError && <p className="awan-error">{joinError}</p>}
          </div>

          {duel && Object.keys(duel.status)[0] === "open" && (
            <div className="awan-card">
              <div className="section-heading"><div><span className="step-label">YOUR MOVE</span><h2>Raise the bid</h2></div><span className="heading-icon">↑</span></div>
              {!isMyTurn && <p className="hint">Not your turn. The other bidder must act first.</p>}
              <div className="awan-row">
                {getRaiseOptions().map((opt) => (
                  <button
                    key={opt.label}
                    className="awan-button"
                    onClick={() => handleRaise(opt.lamports)}
                    disabled={!isMyTurn || raising}
                  >
                    {opt.label} ({opt.sol.toFixed(2)} SOL)
                  </button>
                ))}
                {getRaiseOptions().length === 0 && <span className="hint">The maximum price has been reached. The auction will settle after its timer ends.</span>}
              </div>
              {raiseError && <p className="awan-error">{raiseError}</p>}

            </div>
          )}
        </>
      ) : (
        <div className="awan-card listing-card">
          <div className="section-heading">
            <div><span className="step-label">LIST YOUR NFT</span><h2>Set up an auction</h2></div>
            <span className="heading-icon">◎</span>
          </div>

          <div className="listing-layout">
            <NftVisual mintAddress={listingMint || nftPreviewMint} title={nftMetadata[listingMint]?.name} imageUrl={nftMetadata[listingMint]?.image} status="Preview" />
            <div className="listing-form">
              <div className="listing-field"><span>Select an NFT in your wallet</span><div className="awan-row"><select className="awan-input" value={listingMint} onChange={(e) => setListingMint(e.target.value)}><option value="">Choose an NFT</option>{ownedNfts.map((nft) => <option key={nft.mint} value={nft.mint}>{nft.mint.slice(0, 8)}…{nft.mint.slice(-5)}</option>)}</select><button type="button" className="awan-button" onClick={loadMyNfts}>Load my NFTs</button></div>{nftLoadError && <small className="awan-error">{nftLoadError}</small>}{ownedNfts.length === 0 && <small className="hint">Connect your wallet, then load NFTs. Supports classic SPL one-of-one NFTs held in an associated token account.</small>}</div>
              <div className="listing-row">
                <label className="listing-field">
                  <span>Min price</span>
                  <input
                    className="awan-input"
                    type="number"
                    step="0.1"
                    value={listingMinPrice}
                    onChange={(e) => setListingMinPrice(e.target.value)}
                  />
                </label>
                <label className="listing-field">
                  <span>Max price</span>
                  <input
                    className="awan-input"
                    type="number"
                    step="0.1"
                    value={listingMaxPrice}
                    onChange={(e) => setListingMaxPrice(e.target.value)}
                  />
                </label>
              </div>
              <label className="listing-field"><span>Auction duration</span><select className="awan-input" value={listingDuration} onChange={(e) => setListingDuration(e.target.value)}><option value="60">1 minute (demo)</option><option value="300">5 minutes (demo)</option><option value="3600">1 hour</option><option value="21600">6 hours</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="2592000">30 days</option></select><small className="hint">This is the time to find two bidders. Once the second bidder joins, a new bidding timer of the same length starts.</small></label>
              <p className="hint">NFT name and artwork load from the token’s Metaplex metadata when available. Auction rooms are identified by their room address.</p>
              <p className="hint">Creating the auction transfers this NFT into escrow. Your wallet must own it and will pay the transaction and account rent.</p>
              <button className="awan-button awan-button-primary" type="button" onClick={handleCreateDuel} disabled={!connected || !publicKey || creatingDuel || !listingMint.trim()}>
                {!connected || !publicKey ? "Connect wallet to list" : creatingDuel ? "Creating auction…" : "Create auction"}
              </button>
              {createError && <p className="awan-error">{createError}</p>}
              {createdDuelAddress && <div className="listing-summary"><span>Auction created — share this auction room address</span><code className="awan-field-value">{createdDuelAddress}</code><button className="awan-button" type="button" onClick={() => navigator.clipboard.writeText(createdDuelAddress)}>Copy auction room address</button></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
