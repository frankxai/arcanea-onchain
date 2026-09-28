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
