import {
	AddressLookupTableAccount,
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import DummyIdl from "../anchor/dummy/target/idl/dummy.json";
import { Dummy } from "../anchor/dummy/target/types/dummy";

export const connection = new Connection("http://localhost:8899", "confirmed");

export const keypair = Keypair.fromSecretKey(
	new Uint8Array(JSON.parse(process.env.KEYPAIR_SECRET_KEY!)),
);

const provider = new AnchorProvider(connection, new Wallet(keypair));
export const dummyProgram = new Program<Dummy>(DummyIdl, provider);

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
	const lookupTables = await Promise.all(
		addresses.map(async (address) => {
			const lookupTable = await connection.getAddressLookupTable(
				new PublicKey(address),
			);

			return lookupTable.value;
		}),
	);
	return lookupTables.filter((lookupTable) => lookupTable !== null);
}

export async function sendTransaction(transaction: VersionedTransaction) {
	const tx = await connection.sendTransaction(transaction);
	await connection.confirmTransaction(tx);
	return tx;
}

export function deserializeInstruction(instruction: any): TransactionInstruction {
	return new TransactionInstruction({
		programId: new PublicKey(instruction.programId),
		keys: instruction.accounts.map(
			(key: any) => ({
				pubkey: new PublicKey(key.pubkey),
				isSigner: key.isSigner,
				isWritable: key.isWritable,
			}),
		),
		data: Buffer.from(instruction.data, "base64"),
	});
}

export function arraysEqual(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((val, index) => val === b[index]);
}
