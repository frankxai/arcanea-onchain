import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import { GuardianVault } from "../target/types/guardian_vault";
import { provider, expectAnchorError, balance, fundedKeypair, LAMPORTS } from "./helpers";

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
  // ── Multisig withdrawals: a request belongs to exactly one vault. ──
  describe("withdrawal requests", () => {
    const requestFor = (v: anchor.web3.PublicKey, nonce: number) =>
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("withdrawal"), v.toBuffer(), new BN(nonce).toArrayLike(Buffer, "le", 8)],
        program.programId
      )[0];
    const payee = anchor.web3.Keypair.generate().publicKey;

    const create = (v: anchor.web3.PublicKey, nonce: number, sol: number, to: anchor.web3.PublicKey, who?: anchor.web3.Keypair) => {
      const b = program.methods
        .createWithdrawalRequest(new BN(sol * LAMPORTS), new BN(nonce))
        .accountsPartial({
          vaultConfig: v,
          withdrawalRequest: requestFor(v, nonce),
          destination: to,
          initiator: who ? who.publicKey : admin,
        });
      return who ? b.signers([who]).rpc() : b.rpc();
    };
    const approve = (v: anchor.web3.PublicKey, req: anchor.web3.PublicKey, who?: anchor.web3.Keypair) => {
      const b = program.methods
        .approveWithdrawal()
        .accountsPartial({ vaultConfig: v, withdrawalRequest: req, signer: who ? who.publicKey : admin });
      return who ? b.signers([who]).rpc() : b.rpc();
    };
    const execute = (v: anchor.web3.PublicKey, req: anchor.web3.PublicKey, to: anchor.web3.PublicKey, who?: anchor.web3.Keypair) => {
      const b = program.methods
        .executeWithdrawal()
        .accountsPartial({ vaultConfig: v, withdrawalRequest: req, destination: to, executor: who ? who.publicKey : admin });
      return who ? b.signers([who]).rpc() : b.rpc();
    };

    it("creates, approves and executes a withdrawal from its own vault", async () => {
      await create(vault, 1, 0.5, payee);
      await approve(vault, requestFor(vault, 1));
      await execute(vault, requestFor(vault, 1), payee);

      expect(await balance(payee)).to.equal(0.5 * LAMPORTS);
      expect((await program.account.withdrawalRequest.fetch(requestFor(vault, 1))).isExecuted).to.equal(true);
    });

    it("rejects withdrawal requests from anyone but the agent or a signer", async () => {
      const outsider = await fundedKeypair(1);
      await expectAnchorError(create(vault, 2, 0.1, outsider.publicKey, outsider), "UnauthorizedSigner");
    });

    describe("vault binding (adversarial)", () => {
      let attacker: anchor.web3.Keypair;
      let attackerVault: anchor.web3.PublicKey;

      before(async () => {
        attacker = await fundedKeypair(3);
        [attackerVault] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("vault"), Buffer.from([guardianId]), attacker.publicKey.toBuffer()],
          program.programId
        );
        // Attacker's own vault: they are the agent and the sole 1-of-1 signer.
        await program.methods
          .initialize(guardianId, new BN(1 * LAMPORTS), new BN(1 * LAMPORTS), 1, [attacker.publicKey])
          .accountsPartial({ vaultConfig: attackerVault, agent: attacker.publicKey, admin: attacker.publicKey })
          .signers([attacker])
          .rpc();
      });

      it("rejects executing an attacker-approved request against a victim vault", async () => {
        // Request + 1-of-1 approval on the attacker's own vault, paying the attacker...
        await create(attackerVault, 1, 1, attacker.publicKey, attacker);
        const req = requestFor(attackerVault, 1);
        await approve(attackerVault, req, attacker);

        // ...then executed against the victim vault, which would pay it out.
        const victimBefore = await balance(vault);
        await expectAnchorError(execute(vault, req, attacker.publicKey, attacker), "VaultMismatch");
        expect(await balance(vault)).to.equal(victimBefore);
      });

      it("rejects approving a victim vault's request as a signer of another vault", async () => {
        await create(vault, 3, 0.25, payee);
        const req = requestFor(vault, 3);

        await expectAnchorError(approve(attackerVault, req, attacker), "VaultMismatch");
        const r = await program.account.withdrawalRequest.fetch(req);
        expect(r.approvalCount).to.equal(0);
        expect(r.approvalBitmap).to.equal(0);
      });
    });
  });

  // ── M1/M2: frozen vaults and stale multisig approvals (adversarial) ──
  describe("config epoch + frozen vault (adversarial)", () => {
    const epochGuardianId = 7;
    const [epochVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), Buffer.from([epochGuardianId]), admin.toBuffer()],
      program.programId
    );
    const payee = anchor.web3.Keypair.generate().publicKey;
    let signer2: anchor.web3.Keypair;
    let signer3: anchor.web3.Keypair;

    const reqPda = (nonce: number) =>
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("withdrawal"), epochVault.toBuffer(), new BN(nonce).toArrayLike(Buffer, "le", 8)],
        program.programId
      )[0];
    const create = (nonce: number, sol = 0.1) =>
      program.methods
        .createWithdrawalRequest(new BN(sol * LAMPORTS), new BN(nonce))
        .accountsPartial({ vaultConfig: epochVault, withdrawalRequest: reqPda(nonce), destination: payee, initiator: admin })
        .rpc();
    const approve = (nonce: number, who?: anchor.web3.Keypair) => {
      const b = program.methods
        .approveWithdrawal()
        .accountsPartial({ vaultConfig: epochVault, withdrawalRequest: reqPda(nonce), signer: who ? who.publicKey : admin });
      return who ? b.signers([who]).rpc() : b.rpc();
    };
    const execute = (nonce: number) =>
      program.methods
        .executeWithdrawal()
        .accountsPartial({ vaultConfig: epochVault, withdrawalRequest: reqPda(nonce), destination: payee, executor: admin })
        .rpc();
    const setActive = (active: boolean) =>
      program.methods.setActive(active).accountsPartial({ vaultConfig: epochVault, admin }).rpc();
    const updateConfig = (threshold: number | null, signers: anchor.web3.PublicKey[] | null) =>
      program.methods
        .updateConfig(null, null, null, threshold, signers)
        .accountsPartial({ vaultConfig: epochVault, admin })
        .rpc();

    before(async () => {
      signer2 = await fundedKeypair(1);
      signer3 = await fundedKeypair(1);
      // 1-of-2: admin + signer2.
      await program.methods
        .initialize(epochGuardianId, new BN(1 * LAMPORTS), new BN(1 * LAMPORTS), 1, [admin, signer2.publicKey])
        .accountsPartial({ vaultConfig: epochVault, agent: agent.publicKey, admin })
        .rpc();
      await program.methods
        .deposit(new BN(2 * LAMPORTS))
        .accountsPartial({ vaultConfig: epochVault, depositor: admin })
        .rpc();
    });

    it("M1: rejects approving a withdrawal while the vault is frozen", async () => {
      await create(1);
      await setActive(false);
      try {
        await expectAnchorError(approve(1), "VaultNotActive");
        const r = await program.account.withdrawalRequest.fetch(reqPda(1));
        expect(r.approvalCount).to.equal(0);
      } finally {
        await setActive(true);
      }
    });

    it("M1: rejects executing an approved withdrawal while the vault is frozen", async () => {
      await create(2);
      await approve(2);
      await setActive(false);
      try {
        const before = await balance(epochVault);
        await expectAnchorError(execute(2), "VaultNotActive");
        expect(await balance(epochVault)).to.equal(before);
      } finally {
        await setActive(true);
      }
    });

    it("M2: a removed signer's approval cannot be executed after the signer set changes", async () => {
      // signer2 approves (bitmap index 1)...
      await create(3);
      await approve(3, signer2);
      // ...then is removed as compromised and replaced by signer3 at the same index.
      await updateConfig(null, [admin, signer3.publicKey]);

      const before = await balance(epochVault);
      await expectAnchorError(execute(3), "ConfigEpochMismatch");
      expect(await balance(epochVault)).to.equal(before);
    });

    it("M2: rejects approving a request created under an older config", async () => {
      await create(4);
      await updateConfig(1, null); // any config update starts a new epoch
      await expectAnchorError(approve(4, signer3), "ConfigEpochMismatch");
    });

    it("M2: a request created after the config change works normally", async () => {
      await create(5);
      await approve(5, signer3);
      const before = await balance(payee);
      await execute(5);
      expect(await balance(payee)).to.equal(before + 0.1 * LAMPORTS);
    });

    it("M2: rejects shrinking the signer set below the current threshold", async () => {
      await updateConfig(2, null); // 2-of-2
      await expectAnchorError(updateConfig(null, [admin]), "InvalidThreshold");
      const v = await program.account.vaultConfig.fetch(epochVault);
      expect(v.signers.length).to.equal(2);
      expect(v.multisigThreshold).to.equal(2);
    });

    it("M2: rejects a zero threshold on update", async () => {
      await expectAnchorError(updateConfig(0, null), "InvalidThreshold");
    });

    it("M2: rejects duplicate signers on update", async () => {
      await expectAnchorError(updateConfig(null, [admin, admin]), "DuplicateSigner");
    });

    it("M2: rejects duplicate signers on initialize", async () => {
      const dupGuardianId = 8;
      const [dupVault] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), Buffer.from([dupGuardianId]), admin.toBuffer()],
        program.programId
      );
      // Duplicates inflate signer_count, so 2-of-[admin, admin] looks valid but
      // one key could never produce two approvals (or would, if counted twice).
      await expectAnchorError(
        program.methods
          .initialize(dupGuardianId, new BN(1 * LAMPORTS), new BN(1 * LAMPORTS), 2, [admin, admin])
          .accountsPartial({ vaultConfig: dupVault, agent: agent.publicKey, admin })
          .rpc(),
        "DuplicateSigner"
      );
    });
  });
});
