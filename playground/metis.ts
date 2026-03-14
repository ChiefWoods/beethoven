import {
	Configuration,
	SwapApi,
	type QuoteResponse,
} from "@blueshift/beethoven/metis";
import { type TransactionInstruction } from "@solana/web3.js";
import {
	buildTransaction,
	deserializeInstruction,
	getLookupTables,
	keypair,
} from "./setup";

const userPublicKey = keypair.publicKey.toBase58();
const inputMint = "So11111111111111111111111111111111111111112";
const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const amount = 5_000_000; // 0.005 SOL
const slippageBps = 50;

const metisClient = new SwapApi(
	new Configuration({
		basePath: process.env.JUPITER_BASE_URL ?? "https://api.jup.ag/swap/v1",
		apiKey: process.env.JUPITER_API_KEY,
	}),
);

// bandage fix to convert null percent in routePlan to 100
function normalizeSingleRoutePercent(quote: QuoteResponse): QuoteResponse {
	const normalizedRoutePlan = quote.routePlan.map((route) =>
		route.percent === null ? { ...route, percent: 100 } : route,
	);
	const changed = normalizedRoutePlan.some(
		(route, index) => route !== quote.routePlan[index],
	);
	if (!changed) return quote;

	return {
		...quote,
		routePlan: normalizedRoutePlan,
	};
}

async function main() {
	const quote = await metisClient.quoteGet({
		inputMint,
		outputMint,
		amount,
		slippageBps,
		// V2 requires bandage fix, V1 does not
		instructionVersion: "V1",
	});

	const instructions = await metisClient.swapInstructionsPost({
	  swapRequest: {
	    userPublicKey,
	    wrapAndUnwrapSol: true,
	    dynamicComputeUnitLimit: true,
	    dynamicSlippage: true,
	    quoteResponse: normalizeSingleRoutePercent(quote),
	  },
	});

	console.log("quote.outAmount:", quote.outAmount);

	const ixs: TransactionInstruction[] = [
		...instructions.computeBudgetInstructions.map(deserializeInstruction),
		...instructions.setupInstructions.map(deserializeInstruction),
		deserializeInstruction(instructions.swapInstruction),
	];

	// TODO: create a dummy Anchor program that accepts an agnostic swap instruction
	// parse the swap instruction into accounts and data
	// pass the accounts and data to the top-level instruction
	// test using Surfpool

	if (instructions.cleanupInstruction) {
		ixs.push(deserializeInstruction(instructions.cleanupInstruction!));
	}

	const tx = await buildTransaction({
		instructions: ixs,
		signers: [keypair],
		payer: keypair.publicKey,
		lookupTables: await getLookupTables(
			instructions.addressLookupTableAddresses,
		),
	});

	console.log(Buffer.from(tx.serialize()).toString("base64"));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
