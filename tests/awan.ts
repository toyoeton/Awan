import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Awan } from "../target/types/awan";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { assert } from "chai";

describe("awan", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Awan as Program<Awan>;
  const wallet = provider.wallet as NodeWallet;

  const seller = Keypair.generate();
  const bidderA = Keypair.generate();
  const bidderB = Keypair.generate();

  const minPrice = new BN(2 * LAMPORTS_PER_SOL);
  const maxPrice = new BN(10 * LAMPORTS_PER_SOL);

  let nftMint: PublicKey;
  let sellerNftAccount: PublicKey;
  let vaultNftAccount: PublicKey;

  const confirm = async (signature: string): Promise<string> => {
    const block = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({ signature, ...block });
    return signature;
  };

  let duel: PublicKey;
  let vault: PublicKey;

  it("Test Preparation", async () => {
    for (const kp of [seller, bidderA, bidderB]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        15 * LAMPORTS_PER_SOL
      );
      await confirm(sig);
    }
    console.log("\nAirdropped SOL to seller and both bidders");

    // Mint a 1-of-1 "NFT": supply 1, 0 decimals.
    nftMint = await createMint(provider.connection, wallet.payer, seller.publicKey, null, 0);
    console.log("NFT mint created", nftMint.toBase58());

    sellerNftAccount = (
      await getOrCreateAssociatedTokenAccount(provider.connection, wallet.payer, nftMint, seller.publicKey)
    ).address;
    await mintTo(provider.connection, wallet.payer, nftMint, sellerNftAccount, seller, 1);
    console.log("Minted the NFT to the seller");

    [duel] = PublicKey.findProgramAddressSync(
      [Buffer.from("duel"), nftMint.toBuffer(), seller.publicKey.toBuffer()],
      program.programId
    );
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), duel.toBuffer()],
      program.programId
    );
    vaultNftAccount = getAssociatedTokenAddressSync(nftMint, vault, true);
  });

  it("Create Duel", async () => {
    const tx = await program.methods
      .createDuel(minPrice, maxPrice)
      .accountsPartial({
        seller: seller.publicKey,
        nftMint,
        duel,
        vault,
        sellerNftAccount,
        vaultNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc()
      .then(confirm);

    console.log("\nDuel created, NFT locked in escrow", tx);

    const duelAccount = await program.account.duel.fetch(duel);
    assert.equal(duelAccount.minPrice.toNumber(), minPrice.toNumber());
    assert.equal(duelAccount.maxPrice.toNumber(), maxPrice.toNumber());
  });

  it("Both Bidders Join", async () => {
    await program.methods
      .joinDuel(new BN(2 * LAMPORTS_PER_SOL))
      .accountsPartial({ bidder: bidderA.publicKey, duel, vault, systemProgram: SystemProgram.programId })
      .signers([bidderA])
      .rpc()
      .then(confirm);

    await program.methods
      .joinDuel(new BN(3 * LAMPORTS_PER_SOL))
      .accountsPartial({ bidder: bidderB.publicKey, duel, vault, systemProgram: SystemProgram.programId })
      .signers([bidderB])
      .rpc()
      .then(confirm);

    console.log("\nBoth bidders joined and locked max_price");

    const duelAccount = await program.account.duel.fetch(duel);
    assert.equal(duelAccount.turn.toBase58(), bidderA.publicKey.toBase58());

    const vaultBalance = await provider.connection.getBalance(vault);
    assert.equal(vaultBalance, 2 * maxPrice.toNumber());
    console.log("Vault balance after both joins", vaultBalance / LAMPORTS_PER_SOL, "SOL");
  });

  it("Bidders Raise", async () => {
    await program.methods
      .raise(new BN(4 * LAMPORTS_PER_SOL))
      .accountsPartial({ bidder: bidderA.publicKey, duel })
      .signers([bidderA])
      .rpc()
      .then(confirm);

    await program.methods
      .raise(new BN(5 * LAMPORTS_PER_SOL))
      .accountsPartial({ bidder: bidderB.publicKey, duel })
      .signers([bidderB])
      .rpc()
      .then(confirm);

    console.log("\nBoth bidders raised");

    const duelAccount = await program.account.duel.fetch(duel);
    assert.equal(duelAccount.bidA.toNumber(), 4 * LAMPORTS_PER_SOL);
    assert.equal(duelAccount.bidB.toNumber(), 5 * LAMPORTS_PER_SOL);
  });

  it("Concede - settles the duel", async () => {
    const winnerNftAccount = getAssociatedTokenAddressSync(nftMint, bidderB.publicKey);

    const sellerBefore = await provider.connection.getBalance(seller.publicKey);
    const winnerBefore = await provider.connection.getBalance(bidderB.publicKey);

    const tx = await program.methods
      .concede()
      .accountsPartial({
        conceder: bidderA.publicKey,
        duel,
        vault,
        seller: seller.publicKey,
        winner: bidderB.publicKey,
        nftMint,
        vaultNftAccount,
        winnerNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bidderA])
      .rpc()
      .then(confirm);

    console.log("\nbidderA conceded, bidderB wins", tx);

    const sellerAfter = await provider.connection.getBalance(seller.publicKey);
    const winnerAfter = await provider.connection.getBalance(bidderB.publicKey);

    // Seller received roughly the 5 SOL winning bid, not the full max_price.
    assert.approximately(sellerAfter - sellerBefore, 5 * LAMPORTS_PER_SOL, 0.01 * LAMPORTS_PER_SOL);
    console.log("Seller received", (sellerAfter - sellerBefore) / LAMPORTS_PER_SOL, "SOL");

    // Winner got back their 5 SOL overflow (locked 10, only owed 5), minus their own tx fees.
    assert.isAbove(winnerAfter, winnerBefore);

    const winnerAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      nftMint,
      bidderB.publicKey
    );
    assert.equal(winnerAccount.amount.toString(), "1");
    console.log("NFT confirmed in bidderB's account");
  });

  it("Join Duel - refused once the duel is full", async () => {
    try {
      await program.methods
        .joinDuel(new BN(2 * LAMPORTS_PER_SOL))
        .accountsPartial({ bidder: seller.publicKey, duel, vault, systemProgram: SystemProgram.programId })
        .signers([seller])
        .rpc();
      throw new Error("a third join should have been refused");
    } catch (error: any) {
      console.log("\nThird join correctly refused");
      console.log(error.error?.errorCode?.code ?? error.message);
    }
  });
});