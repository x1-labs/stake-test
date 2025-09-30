// stake.ts
import { readFileSync } from "node:fs";
import { Keypair, Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount} from "@solana/spl-token";
import BN from "bn.js";
import {Program} from "@coral-xyz/anchor";
import {StakeTest} from "../target/types/stake_test";
import dotenv from "dotenv";

dotenv.config();


// ---------- CONFIG ----------
const PROGRAM_ID = new PublicKey("F1JH85HfWhojoEyTPq5jJHqjoEt1hPaSR9QthvCvLs9r"); // from declare_id!
const MINT = new PublicKey(process.env.TOKEN_MINT); // the token being staked
const WALLET_PATH = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
// --------------------------------

function loadKeypair(path: string): Keypair {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
    // connection + wallet + provider
    const provider = anchor.AnchorProvider.env();
    console.log('Network', provider.connection?.rpcEndpoint);
    anchor.setProvider(provider);

    const program = anchor.workspace.StakeTest as Program<StakeTest>;
    const payer = loadKeypair(WALLET_PATH);
    const wallet = new anchor.Wallet(payer);
    anchor.setProvider(provider);
    console.log('User', payer.publicKey.toBase58());


    // ----------- DERIVATIONS -----------
    const user = payer.publicKey;
    const mint = MINT;

    // PDA: vault authority = ["vault", mint]
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), mint.toBuffer()],
        PROGRAM_ID
    );

    // ATAs
    const userAta = await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, user, false);
    const vaultAta = await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, vaultAuthority, true);

    // PDA: staker = ["staker", user, mint]
    const [stakerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("staker"), user.toBuffer(), mint.toBuffer()],
        PROGRAM_ID
    );

    // ----------- SUBSCRIBE TO EVENTS -----------
    // Anchor auto-parses your #[event] StakeEvent
    const listener = program.addEventListener(
        "stakeEvent",
        (ev: any, slot: number) => {
            // ev: { staker: string, mint: string, amount: string, newTotal: string }
            console.log("StakeEvent @ slot", slot, {
                staker: ev.staker,
                mint: ev.mint,
                amount: ev.amount?.toString?.() ?? String(ev.amount),
                newTotal: ev.newTotal?.toString?.() ?? String(ev.newTotal),
            });
        }
    );

    // ----------- SEND A STAKE -----------
    // amount is in base units (e.g. if mint has 6 decimals, 1.23 tokens => 1_230_000)
    const amount = new BN(1); // example

    const sig = await program.methods
        .doStake(amount)
        .accounts({
            user,
            mint,
            // vaultAuthority,
            // userAta,
            // vaultAta,
            // staker: stakerPda,
            // tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            // associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            // systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    console.log("stake tx:", sig);

    // ----------- READ BACK STATE -----------
    // confirm the staker total
    const stakerAcc = await program.account.staker.fetch(stakerPda);
    console.log("staker state:", {
        owner: stakerAcc.owner.toBase58(),
        mint: stakerAcc.mint.toBase58(),
        total: stakerAcc.total.toString(),
    });

    // keep process alive briefly to catch the event (or remove if you have a long-running app)
    setTimeout(async () => {
        await program.removeEventListener(listener);
        process.exit(0);
    }, 3000);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});