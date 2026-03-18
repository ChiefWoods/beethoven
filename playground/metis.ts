import {
	Configuration,
	SwapApi,
	type QuoteResponse,
} from "@blueshift/beethoven/metis";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
	arraysEqual,
	buildTransaction,
	deserializeInstruction,
	dummyProgram,
	getLookupTables,
	keypair,
	sendTransaction,
} from "./setup";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const JUPITER_PROGRAM_ID = new PublicKey(
	"JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
);
const JUPITER_EVENT_AUTHORITY = new PublicKey(
	"D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf",
);
const EXACT_OUT_ROUTE_DISCRIMINATOR = [208, 51, 239, 151, 123, 43, 237, 92];
const ROUTE_DISCRIMINATOR = [229, 23, 203, 151, 122, 227, 173, 42];
const SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR = [
	176, 209, 105, 168, 154, 125, 69, 62,
];
const SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR = [
	193, 32, 155, 51, 65, 214, 156, 129,
];

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

function extractRemainingAccountsForSwap(
	swapInstruction: TransactionInstruction,
): { remainingAccounts: any[] } {
	const instructionData = swapInstruction.data;

	// Check discriminator (first 8 bytes)
	const discriminator = Array.from(instructionData.slice(0, 8));

	let remainingAccounts: any[] = [];

	if (arraysEqual(discriminator, ROUTE_DISCRIMINATOR)) {
		// For Route, the first 9 accounts are base accounts
		remainingAccounts = swapInstruction.keys.slice(9);
	} else if (arraysEqual(discriminator, EXACT_OUT_ROUTE_DISCRIMINATOR)) {
		// For ExactOutRoute, the first 11 accounts are base accounts
		remainingAccounts = swapInstruction.keys.slice(11);
	} else if (
		arraysEqual(discriminator, SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR) ||
		arraysEqual(discriminator, SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR)
	) {
		// For SharedAccounts (ExactOutRoute or Route)
		// The smart contract expects:
		// - remaining_accounts[0] = program authority (position 1 in Jupiter response)
		// - remaining_accounts[1] = program source token account (position 4 in Jupiter response)
		// - remaining_accounts[2] = program destination token account (position 5 in Jupiter response)
		// - remaining_accounts[3+] = all other remaining accounts (position 11+ in Jupiter response)
		const programAuthority = swapInstruction.keys[1]; // position 1
		const programSourceTokenAccount = swapInstruction.keys[4]; // position 4
		const programDestinationTokenAccount = swapInstruction.keys[5]; // position 5
		const otherRemainingAccounts = swapInstruction.keys.slice(13); // after position 12 (index 13+)

		remainingAccounts = [
			programAuthority,
			programSourceTokenAccount,
			programDestinationTokenAccount,
			...otherRemainingAccounts,
		];
	} else {
		throw new Error(`Unknown discriminator: ${discriminator}`);
	}

	return {
		remainingAccounts,
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
			dynamicSlippage: false,
			quoteResponse: normalizeSingleRoutePercent(quote),
		},
	});

	console.log("quote.outAmount:", quote.outAmount);

	const ixs: TransactionInstruction[] = [
		...instructions.computeBudgetInstructions.map(deserializeInstruction),
		...instructions.setupInstructions.map(deserializeInstruction),
	];

	const remainingAccounts = extractRemainingAccountsForSwap(
		deserializeInstruction(instructions.swapInstruction),
	).remainingAccounts;

	const swapIx = await dummyProgram.methods
		.swap({
			amount: new BN(amount),
			slippageBps,
			swapData: Buffer.from(instructions.swapInstruction.data, "base64"),
		})
		.accounts({
			authority: keypair.publicKey,
			eventAuthority: JUPITER_EVENT_AUTHORITY,
			inputMint: new PublicKey(inputMint),
			outputMint: new PublicKey(outputMint),
			swapProgram: JUPITER_PROGRAM_ID,
			tokenProgram: TOKEN_PROGRAM_ID,
			payer: keypair.publicKey,
		})
		.remainingAccounts(remainingAccounts)
		.instruction();

	ixs.push(swapIx);

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

	const sig = await sendTransaction(tx);
	console.log("sig:", sig);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
