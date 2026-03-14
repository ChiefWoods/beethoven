import { V1Client } from "@titanexchange/sdk-ts";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { buildTransaction, deserializeInstruction, getLookupTables, keypair } from "./setup";

const userPublicKey = keypair.publicKey.toBytes();

type TitanAccountMeta = {
  p: Uint8Array;
  s: boolean;
  w: boolean;
};

type TitanInstruction = {
  p: Uint8Array;
  a: TitanAccountMeta[];
  d: Uint8Array;
};

function titanInstructionToWeb3Instruction(
  instruction: TitanInstruction
): TransactionInstruction {
  return deserializeInstruction({
    programId: new PublicKey(instruction.p).toBase58(),
    accounts: instruction.a.map((account) => ({
      pubkey: new PublicKey(account.p).toBase58(),
      isSigner: account.s,
      isWritable: account.w,
    })),
    data: Buffer.from(instruction.d).toString("base64"),
  });
}

async function main() {
  const url = `wss://${process.env.TITAN_WS_URL}/ws?auth=${process.env.TITAN_AUTH_TOKEN}`;
  const titanClient = await V1Client.connect(url);
  
  try {
    const { stream, streamId } = await titanClient.newSwapQuoteStream({
      swap: {
        inputMint: new PublicKey("So11111111111111111111111111111111111111112").toBytes(),
        outputMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").toBytes(),
        amount: 5_000_000, // 0.005 SOL
        slippageBps: 50,
      },
      transaction: {
        userPublicKey,
      },
      update: {
        num_quotes: 3,
      },
    });

    const reader = stream.getReader();
    const first = await reader.read();
    await reader.cancel();
    await titanClient.stopStream(streamId).catch(() => {});

    if (first.done || !first.value) {
      throw new Error("No quote received from Titan stream");
    }

    const quotesByProvider = first.value.quotes;
    const firstProvider = Object.keys(quotesByProvider)[0];
    if (!firstProvider) throw new Error("No provider quote returned");

    const route = quotesByProvider[firstProvider];
    if (!route) throw new Error(`No route returned for provider ${firstProvider}`);
    console.log("provider:", firstProvider, "outAmount:", route.outAmount);

    const ixs = route.instructions.map(titanInstructionToWeb3Instruction);
    const lookupTables = route.addressLookupTables.map((key) => new PublicKey(key).toBase58());

    const tx = await buildTransaction({
      instructions: ixs,
      signers: [keypair],
      payer: keypair.publicKey,
      lookupTables: await getLookupTables(lookupTables),
    });

    console.log(Buffer.from(tx.serialize()).toString("base64"));
  } finally {
    await titanClient.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
