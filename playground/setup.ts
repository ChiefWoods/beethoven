import { AddressLookupTableAccount, clusterApiUrl, Connection, Keypair, PublicKey, Transaction, TransactionInstruction, TransactionMessage, VersionedMessage, VersionedTransaction } from "@solana/web3.js";

export const connection = new Connection(process.env.RPC_URL ?? clusterApiUrl("mainnet-beta"), "confirmed");

export const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.KEYPAIR_SECRET_KEY!)));

export async function buildTransaction({
  instructions,
  signers,
  payer,
  lookupTables,
}: {
  instructions: TransactionInstruction[];
  signers: Keypair[];
  payer: PublicKey;
  lookupTables: AddressLookupTableAccount[];
}) {
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions,
      payerKey: payer,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    }).compileToV0Message(lookupTables),
  );
  transaction.sign(signers);
  return transaction;
}

export async function getLookupTables(addresses: string[]) {
  const lookupTables = await Promise.all(addresses.map(async (address) => {
    const lookupTable = await connection.getAddressLookupTable(new PublicKey(address));

    return lookupTable.value;
  }));
  return lookupTables.filter((lookupTable) => lookupTable !== null);
}

export async function sendTransaction(transaction: VersionedTransaction) {
  const tx = await connection.sendTransaction(transaction);
  await connection.confirmTransaction(tx);
  return tx;
}

export function deserializeInstruction(instruction: { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean; }[]; data: string; }): TransactionInstruction {
  return new TransactionInstruction({
  programId: new PublicKey(instruction.programId),
  keys: instruction.accounts.map((key: { pubkey: string; isSigner: boolean; isWritable: boolean; }) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
  })),
  data: Buffer.from(instruction.data, "base64"),
  });
};