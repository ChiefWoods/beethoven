import { keypair } from "./setup";

const userPublicKey = keypair.publicKey.toBase58();
const inputToken = "So11111111111111111111111111111111111111112";
const outputToken = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const amount = 5_000_000; // 0.005 SOL
const slippageBps = 50;

type KineticTokenResponse = {
  accessToken?: string;
  tokenType?: string;
};

type KineticQuoteRequest = {
  inputToken: string;
  outputToken: string;
  amount: number;
  slippageBps: number;
};

type KineticQuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
  apiVersion: string;
  [key: string]: unknown;
};

type KineticSwapResponse = {
  swapTransaction: string;
  [key: string]: unknown;
};

async function issueKineticToken(authBaseUrl: string, apiKey: string): Promise<string> {
  const response = await fetch(`${authBaseUrl}/v1/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  if (!response.ok) {
    throw new Error(`Kinetic token request failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as KineticTokenResponse;
  const accessToken = body.accessToken;
  const tokenType = (body.tokenType ?? "bearer").toLowerCase();
  if (!accessToken) throw new Error(`Kinetic token response missing access token: ${JSON.stringify(body)}`);

  return `${tokenType} ${accessToken}`;
}

async function main() {
  const authBaseUrl = process.env.KINETIC_AUTH_URL ?? "https://auth.kinetic.xyz";
  const apiBaseUrl = process.env.KINETIC_API_URL ?? "https://api.kinetic.xyz";
  const kineticApiKey = process.env.KINETIC_API_KEY!;
  const kineticAuthHeader = await issueKineticToken(authBaseUrl, kineticApiKey);

  const quoteRequest: KineticQuoteRequest = {
    inputToken,
    outputToken,
    amount,
    slippageBps,
  };

  const quoteResponse = await fetch(`${apiBaseUrl}/routing/v3/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Kinetic-Auth": kineticAuthHeader,
    },
    body: JSON.stringify(quoteRequest),
  });

  const quote = (await quoteResponse.json()) as KineticQuoteResponse;
  
  console.log("quote.outAmount:", quote.outAmount);

  const swapResponse = await fetch(`${apiBaseUrl}/transaction/v1/swap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Kinetic-Auth": kineticAuthHeader,
    },
    body: JSON.stringify({
      userPublicKey,
      quoteResponse: quote,
    }),
  });

  const swap = (await swapResponse.json()) as KineticSwapResponse;

  console.log(swap.swapTransaction);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
