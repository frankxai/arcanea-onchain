import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

export const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

export const LAMPORTS = anchor.web3.LAMPORTS_PER_SOL;

export async function airdrop(to: anchor.web3.PublicKey, sol: number): Promise<void> {
  const sig = await provider.connection.requestAirdrop(to, sol * LAMPORTS);
  const latest = await provider.connection.getLatestBlockhash();
  await provider.connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
}

export async function balance(of: anchor.web3.PublicKey): Promise<number> {
  // Same commitment the provider confirms .rpc() at, so reads see the tx just sent.
  return provider.connection.getBalance(of, provider.opts.commitment ?? "processed");
}

/** Assert that `p` rejects with the given Anchor error code name. */
export async function expectAnchorError(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e: any) {
    const actual = e?.error?.errorCode?.code ?? String(e);
    expect(actual).to.contain(code);
    return;
  }
  expect.fail(`expected transaction to fail with ${code}`);
}

/** A fresh keypair with `sol` SOL airdropped, for playing an independent (often hostile) party. */
export async function fundedKeypair(sol = 2): Promise<anchor.web3.Keypair> {
  const kp = anchor.web3.Keypair.generate();
  await airdrop(kp.publicKey, sol);
  return kp;
}

// ── Minimal SPL Token helpers (raw instructions; no @solana/spl-token dependency) ──

export const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MINT_LEN = 82;
const TOKEN_ACCOUNT_LEN = 165;

function u64le(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

export interface NftMintOptions {
  decimals?: number; // default 0
  supply?: number; // tokens minted to `holder`; default 1
  revokeMintAuthority?: boolean; // default true (fixed supply)
  holder?: anchor.web3.PublicKey; // owner of the token account; default the provider wallet
}

/**
 * Create a real SPL Token mint (+ a token account holding its supply) in one tx.
 * Defaults produce a proper NFT mint: decimals 0, supply 1, mint authority revoked.
 * Returns the mint and the token account.
 */
export async function createSplMint(
  opts: NftMintOptions = {}
): Promise<{ mint: anchor.web3.PublicKey; tokenAccount: anchor.web3.PublicKey }> {
  const { decimals = 0, supply = 1, revokeMintAuthority = true } = opts;
  const payer = provider.wallet.publicKey;
  const holder = opts.holder ?? payer;
  const mint = anchor.web3.Keypair.generate();
  const tokenAccount = anchor.web3.Keypair.generate();
  const conn = provider.connection;

  const tx = new anchor.web3.Transaction();
  tx.add(
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(MINT_LEN),
      space: MINT_LEN,
      programId: TOKEN_PROGRAM_ID,
    }),
    // InitializeMint2 { decimals, mint_authority = payer, freeze_authority = None }
    new anchor.web3.TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [{ pubkey: mint.publicKey, isSigner: false, isWritable: true }],
      data: Buffer.concat([Buffer.from([20, decimals]), payer.toBuffer(), Buffer.from([0])]),
    }),
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: tokenAccount.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN),
      space: TOKEN_ACCOUNT_LEN,
      programId: TOKEN_PROGRAM_ID,
    }),
    // InitializeAccount3 { owner = holder }
    new anchor.web3.TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: tokenAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: mint.publicKey, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from([18]), holder.toBuffer()]),
    })
  );
  if (supply > 0) {
    // MintTo { amount = supply }
    tx.add(
      new anchor.web3.TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: mint.publicKey, isSigner: false, isWritable: true },
          { pubkey: tokenAccount.publicKey, isSigner: false, isWritable: true },
          { pubkey: payer, isSigner: true, isWritable: false },
        ],
        data: Buffer.concat([Buffer.from([7]), u64le(supply)]),
      })
    );
  }
  if (revokeMintAuthority) {
    // SetAuthority { authority_type = MintTokens, new_authority = None }
    tx.add(
      new anchor.web3.TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: mint.publicKey, isSigner: false, isWritable: true },
          { pubkey: payer, isSigner: true, isWritable: false },
        ],
        data: Buffer.from([6, 0, 0]),
      })
    );
  }
  await provider.sendAndConfirm(tx, [mint, tokenAccount]);
  return { mint: mint.publicKey, tokenAccount: tokenAccount.publicKey };
}

/** A proper NFT mint: decimals 0, supply 1 held by `holder`, mint authority revoked. */
export async function createNftMint(holder?: anchor.web3.PublicKey): Promise<anchor.web3.PublicKey> {
  return (await createSplMint({ holder })).mint;
}
