// stake.ts
import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {getOrCreateAssociatedTokenAccount} from "@solana/spl-token";
import BN from "bn.js";
import {Program} from "@coral-xyz/anchor";
import {StakeTest} from "../target/types/stake_test";
import dotenv from "dotenv";

dotenv.config();


// ---------- CONFIG ----------
const PROGRAM_ID = new PublicKey("F1JH85HfWhojoEyTPq5jJHqjoEt1hPaSR9QthvCvLs9r"); // from declare_id!
// --------------------------------

async function main() {
    // connection + wallet + provider
    const provider = anchor.AnchorProvider.env();
    console.log('Network', provider.connection?.rpcEndpoint);
    anchor.setProvider(provider);

    const program = anchor.workspace.StakeTest as Program<StakeTest>;
    anchor.setProvider(provider);

    const allStakes = await program.account.staker.all()

    console.log("all stakes:");
    allStakes.forEach(stake => console.log('  ', stake.account.owner.toBase58(), stake.account.total.toNumber()) );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});