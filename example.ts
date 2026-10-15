import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairSignerFromBytes,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from "@solana/kit";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const AWAN_PROGRAM_ID = new PublicKey("8vZNXTex9JmPAADsTXVwwfTfVXUjbLBaTtassLD8dqvN");
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { getCreateDuelInstructionAsync } from "./clients/js/src/generated";

async function main() {
  // --- Set up with the familiar web3.js/spl-token tools, same as the Anchor tests ---
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const sellerKeypair = Keypair.generate();

  const airdropSig = await connection.requestAirdrop(sellerKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdropSig);

  const nftMintPubkey = await createMint(connection, sellerKeypair, sellerKeypair.publicKey, null, 0);
  const sellerAta = await getOrCreateAssociatedTokenAccount(
    connection,
    sellerKeypair,
    nftMintPubkey,
    sellerKeypair.publicKey
  );
  await mintTo(connection, sellerKeypair, nftMintPubkey, sellerAta.address, sellerKeypair, 1);

  console.log("Seller:", sellerKeypair.publicKey.toBase58());
  console.log("NFT mint:", nftMintPubkey.toBase58());

  const [duelPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("duel"), nftMintPubkey.toBuffer(), sellerKeypair.publicKey.toBuffer()],
    AWAN_PROGRAM_ID
  );

  // --- Switch to the generated Codama client to actually call create_duel ---
  const rpc = createSolanaRpc("http://127.0.0.1:8899");
  const rpcSubscriptions = createSolanaRpcSubscriptions("ws://127.0.0.1:8900");

  const seller = await createKeyPairSignerFromBytes(sellerKeypair.secretKey);
  const nftMint = address(nftMintPubkey.toBase58());

  const instruction = await getCreateDuelInstructionAsync({
    seller,
    nftMint,
    minPrice: 2_000_000_000n,
    maxPrice: 10_000_000_000n,
    durationSeconds: 3600n,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(seller, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([instruction], tx)
  );

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  // The cast below works around a known type-inference quirk when chaining several
  // pipe() steps, the transaction only ever has a blockhash lifetime at runtime.
  await sendAndConfirm(signedTransaction as Parameters<typeof sendAndConfirm>[0], {
    commitment: "confirmed",
  });

  console.log("\nDuel created via the generated Codama client!");
  console.log("Signature:", getSignatureFromTransaction(signedTransaction));
  console.log("Duel PDA (paste this into the frontend):", duelPda.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
