import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import { GuardianVault } from "../target/types/guardian_vault";
import { provider, expectAnchorError, balance, LAMPORTS } from "./helpers";

describe("guardian-vault", () => {
  const program = anchor.workspace.GuardianVault as Program<GuardianVault>;
  const admin = provider.wallet.publicKey;
  const agent = anchor.web3.Keypair.generate();
  const destination = anchor.web3.Keypair.generate().publicKey;
  const guardianId = 3;
  const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from([guardianId]), admin.toBuffer()],
    program.programId
  );

  const spend = (sol: number, signer = agent) =>
    program.methods
      .agentSpend(new BN(sol * LAMPORTS))
      .accountsPartial({ vaultConfig: vault, destination, agent: signer.publicKey })
      .signers([signer])
      .rpc();

  it("initializes a vault with spend limits", async () => {
    await program.methods
      .initialize(guardianId, new BN(1 * LAMPORTS), new BN(1.5 * LAMPORTS), 1, [admin])
      .accountsPartial({ vaultConfig: vault, agent: agent.publicKey, admin })
      .rpc();

    const v = await program.account.vaultConfig.fetch(vault);
    expect(v.guardianId).to.equal(guardianId);
    expect(v.agent.toBase58()).to.equal(agent.publicKey.toBase58());
    expect(v.isActive).to.equal(true);
  });

  it("accepts deposits", async () => {
    await program.methods.deposit(new BN(3 * LAMPORTS)).accountsPartial({ vaultConfig: vault, depositor: admin }).rpc();

    const v = await program.account.vaultConfig.fetch(vault);
    expect(v.totalDeposited.toNumber()).to.equal(3 * LAMPORTS);
  });

  it("lets the agent spend within limits", async () => {
    await spend(1);

    expect(await balance(destination)).to.equal(1 * LAMPORTS);
    const v = await program.account.vaultConfig.fetch(vault);
    expect(v.dailySpent.toNumber()).to.equal(1 * LAMPORTS);
  });

  it("enforces the per-transaction limit", async () => {
    await expectAnchorError(spend(1.2), "PerTxLimitExceeded");
  });

  it("enforces the daily limit", async () => {
    await expectAnchorError(spend(0.9), "DailyLimitExceeded");
  });

  it("rejects spends by anyone but the agent", async () => {
    const outsider = anchor.web3.Keypair.generate();
    await expectAnchorError(spend(0.1, outsider), "UnauthorizedAgent");
  });
});
