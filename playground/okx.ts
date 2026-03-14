import { type TransactionInstruction } from "@solana/web3.js";
import { OKXDexClient, type QuoteParams } from "@okx-dex/okx-dex-sdk";
import {
	buildTransaction,
	deserializeInstruction,
	getLookupTables,
	keypair,
} from "./setup";

const chainIndex = "501";
const userWalletAddress = keypair.publicKey.toBase58();
const fromTokenAddress = "So11111111111111111111111111111111111111112";
const toTokenAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const amount = 5_000_000; // 0.005 SOL
const slippagePercent = 0.5;

const okxClient = new OKXDexClient({
	apiKey: process.env.OKX_API_KEY!,
	secretKey: process.env.OKX_SECRET_KEY!,
	apiPassphrase: process.env.OKX_API_PASSPHRASE!,
	projectId: process.env.OKX_PROJECT_ID!,
	baseUrl: process.env.OKX_BASE_URL ?? "https://web3.okx.com",
});

async function main() {
	const swapParams: QuoteParams = {
		chainIndex,
		fromTokenAddress,
		toTokenAddress,
		amount: amount.toString(),
		slippagePercent: slippagePercent.toString(),
		userWalletAddress,
	};

	const quoteResponse = await okxClient.dex.getQuote(swapParams);

	if (quoteResponse.code !== "0" || !quoteResponse.data.length) {
		throw new Error(
			`Unexpected quote response from OKXDexClient: ${JSON.stringify(quoteResponse)}`,
		);
	}

	const bestQuote = quoteResponse.data[0];
	if (!bestQuote) throw new Error("No best quote returned");
	
	console.log("quote.toTokenAmount:", bestQuote.toTokenAmount);

	const swapInstructionResponse =
		await okxClient.dex.getSolanaSwapInstruction(swapParams);

	if (swapInstructionResponse.code !== "0") {
		throw new Error(
			`Unexpected swap-instruction response from OKXDexClient: ${JSON.stringify(
				swapInstructionResponse,
			)}`,
		);
	}

	const instructionLists = swapInstructionResponse.data.instructionLists ?? [];
	if (!instructionLists.length) {
		throw new Error(
			`swap-instruction returned no instructions: ${JSON.stringify(
				swapInstructionResponse,
			)}`,
		);
	}

	const ixs: TransactionInstruction[] = instructionLists.map((ix) =>
		deserializeInstruction({
			programId: ix.programId,
			data: ix.data,
			accounts: ix.accounts,
		}),
	);

	const tx = await buildTransaction({
		instructions: ixs,
		signers: [keypair],
		payer: keypair.publicKey,
		lookupTables: await getLookupTables(swapInstructionResponse.data.addressLookupTableAccount),
	});

	console.log(Buffer.from(tx.serialize()).toString("base64"));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
