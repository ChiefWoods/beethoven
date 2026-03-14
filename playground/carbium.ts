import { keypair } from "./setup";

const user_account = keypair.publicKey.toBase58();
const src_mint = "So11111111111111111111111111111111111111112";
const dst_mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const amount_in = 5_000_000; // 0.005 SOL
const slippage_bps = 50; // 0.50%

type CarbiumRouteStep = {
	percent: string;
	bps: string;
	swapInfo: {
		label: string;
		inAmount: string;
		outAmount: string;
		feeAmount: string;
		feeMint: string;
	};
};

type CarbiumQuoteResponse = {
	srcAmountIn: string;
	destAmountOut: string;
	destAmountOutMin: string;
	swapMode: string;
	slippage: string;
	priceImpactPct: string;
	routePlan: CarbiumRouteStep[];
	inputMint: string;
	outputMint: string;
	requestId: string;
	txn: string;
	[key: string]: unknown;
};

async function main() {
	const baseUrl = process.env.CARBIUM_API_URL ?? "https://api.carbium.io/api";
	const apiKey = process.env.CARBIUM_API_KEY!;
	const params = new URLSearchParams({
		src_mint,
		dst_mint,
		amount_in: amount_in.toString(),
		slippage_bps: slippage_bps.toString(),
		user_account,
	});

	const response = await fetch(`${baseUrl}/v2/quote?${params.toString()}`, {
		method: "GET",
		headers: {
			accept: "application/json",
			"X-API-KEY": apiKey,
		},
	});

	if (!response.ok) {
		throw new Error(
			`Carbium quote failed: ${response.status} ${response.statusText}\n${await response.text()}`,
		);
	}

	const result = (await response.json()) as CarbiumQuoteResponse;

	console.log("quote.destAmountOut:", result.destAmountOut);

	console.log(result.txn);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
