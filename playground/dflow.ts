import { Configuration, SwapApi, type InstructionResponse } from "@blueshift/beethoven/dflow";
import { type TransactionInstruction } from "@solana/web3.js";
import { buildTransaction, deserializeInstruction, getLookupTables, keypair } from "./setup";

const userPublicKey = keypair.publicKey.toBase58();
const inputMint = "So11111111111111111111111111111111111111112";
const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const amount = 5_000_000; // 0.005 SOL
const slippageBps = 50;

const dflowClient = new SwapApi(
  new Configuration({
    basePath: process.env.DFLOW_TRADE_API_URL ?? "https://quote-api.dflow.net",
    apiKey: process.env.DFLOW_API_KEY,
  })
);

async function main() {
  const quote = await dflowClient.quoteGet({
    inputMint,
    outputMint,
    amount,
    slippageBps,
  });

  const instructions = await dflowClient.swapInstructionsPost({
    swapRequest: {
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      quoteResponse: quote,
    },
  });

  console.log("quote.outAmount:", quote.outAmount);

  const ixs: TransactionInstruction[] = [
    ...instructions.computeBudgetInstructions.map(deserializeInstruction),
    ...instructions.setupInstructions.map(deserializeInstruction),
    deserializeInstruction(instructions.swapInstruction),
    ...instructions.cleanupInstructions.map((ix: InstructionResponse) => deserializeInstruction(ix)),
    ...instructions.otherInstructions.map((ix: InstructionResponse) => deserializeInstruction(ix)),
  ];

  const tx = await buildTransaction({
    instructions: ixs,
    signers: [keypair],
    payer: keypair.publicKey,
    lookupTables: await getLookupTables(instructions.addressLookupTableAddresses),
  });

  console.log(Buffer.from(tx.serialize()).toString("base64"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
