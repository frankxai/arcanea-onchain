import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { AcademyBadge } from "../target/types/academy_badge";
import { provider, expectAnchorError, fundedKeypair } from "./helpers";

type PublicKey = anchor.web3.PublicKey;

describe("academy-badge", () => {
  const program = anchor.workspace.AcademyBadge as Program<AcademyBadge>;
  const authority = provider.wallet.publicKey;
  const configFor = (auth: PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("badge_config"), auth.toBuffer()], program.programId)[0];
  const config = configFor(authority);

  // Receipt PDA: [b"badge_receipt", badge_config, recipient, category, category_id].
  const receiptFor = (cfg: PublicKey, who: PublicKey, category: number, id: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge_receipt"), cfg.toBuffer(), who.toBuffer(), Buffer.from([category]), Buffer.from([id])],
      program.programId
    )[0];

  const recipient = anchor.web3.Keypair.generate().publicKey;
  // BadgeCategory::GateCompletion = 1, gate id 3 (Heart).
  const receipt = receiptFor(config, recipient, 1, 3);

  const ACHIEVEMENT = 4;
  const mintAchievement = (
    cfg: PublicKey,
    issuer: anchor.web3.Keypair | null,
    to: PublicKey,
    id: number,
    receiptAddr = receiptFor(cfg, to, ACHIEVEMENT, id)
  ) => {
    const b = program.methods
      .mintBadge({ achievement: {} }, id, "Achievement", "https://arcanea.ai/b/a.json")
      .accountsPartial({
        badgeConfig: cfg,
        badgeReceipt: receiptAddr,
        recipient: to,
        badgeAuthority: issuer ? issuer.publicKey : authority,
      });
    return issuer ? b.signers([issuer]).rpc() : b.rpc();
  };

  const verify = (cfg: PublicKey, r: PublicKey, holder: PublicKey) =>
    program.methods.verifyBadge().accountsPartial({ badgeConfig: cfg, badgeReceipt: r, holder }).rpc();

  it("initializes the badge system", async () => {
    await program.methods
      .initialize(14, 64)
      .accountsPartial({ badgeConfig: config, merkleTree: anchor.web3.Keypair.generate().publicKey, authority })
      .rpc();

    const cfg = await program.account.badgeConfig.fetch(config);
    expect(cfg.isActive).to.equal(true);
    expect(cfg.totalMinted.toNumber()).to.equal(0);
    expect(cfg.maxDepth).to.equal(14);
  });

  it("mints a gate-completion badge receipt", async () => {
    await program.methods
      .mintBadge({ gateCompletion: {} }, 3, "Heart Gate", "https://arcanea.ai/b/heart.json")
      .accountsPartial({ badgeConfig: config, badgeReceipt: receipt, recipient, badgeAuthority: authority })
      .rpc();

    const r = await program.account.badgeReceipt.fetch(receipt);
    expect(r.recipient.toBase58()).to.equal(recipient.toBase58());
    expect(r.badgeConfig.toBase58()).to.equal(config.toBase58());
    expect(r.categoryId).to.equal(3);
    expect(r.isValid).to.equal(true);
    expect(r.leafIndex).to.equal(0);

    const cfg = await program.account.badgeConfig.fetch(config);
    expect(cfg.totalMinted.toNumber()).to.equal(1);
  });

  it("rejects an out-of-range category id", async () => {
    // HouseMembership (0) only has houses 0..=6.
    await expectAnchorError(
      program.methods
        .mintBadge({ houseMembership: {} }, 7, "Nope", "https://arcanea.ai/b/x.json")
        .accountsPartial({
          badgeConfig: config,
          badgeReceipt: receiptFor(config, recipient, 0, 7),
          recipient,
          badgeAuthority: authority,
        })
        .rpc(),
      "InvalidCategoryId"
    );
  });

  it("rejects minting by a signer that is not the badge authority", async () => {
    const outsider = await fundedKeypair();
    await expectAnchorError(mintAchievement(config, outsider, recipient, 99), "UnauthorizedBadgeAuthority");
  });

  it("verifies the badge for its holder only", async () => {
    await verify(config, receipt, recipient);

    await expectAnchorError(verify(config, receipt, anchor.web3.Keypair.generate().publicKey), "BadgeNotFound");
  });

  it("fails verification after revocation", async () => {
    await program.methods.revokeBadge().accountsPartial({ badgeConfig: config, badgeReceipt: receipt, authority }).rpc();

    await expectAnchorError(verify(config, receipt, recipient), "BadgeRevoked");
  });

  // ── Adversarial: every config is attacker-creatable, so a receipt must be ──
  // ── bound to the config that issued it, in its address and its data.     ──
  describe("config binding (adversarial)", () => {
    let attacker: anchor.web3.Keypair;
    let attackerConfig: PublicKey;

    before(async () => {
      attacker = await fundedKeypair(3);
      attackerConfig = configFor(attacker.publicKey);
      await program.methods
        .initialize(14, 64)
        .accountsPartial({
          badgeConfig: attackerConfig,
          merkleTree: anchor.web3.Keypair.generate().publicKey,
          authority: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
    });

    it("attacker-created config cannot revoke another config's badge", async () => {
      const victim = anchor.web3.Keypair.generate().publicKey;
      const victimReceipt = receiptFor(config, victim, ACHIEVEMENT, 1);
      await mintAchievement(config, null, victim, 1);

      await expectAnchorError(
        program.methods
          .revokeBadge()
          .accountsPartial({ badgeConfig: attackerConfig, badgeReceipt: victimReceipt, authority: attacker.publicKey })
          .signers([attacker])
          .rpc(),
        "ConfigMismatch"
      );

      expect((await program.account.badgeReceipt.fetch(victimReceipt)).isValid).to.equal(true);
      await verify(config, victimReceipt, victim);
    });

    it("non-authority cannot revoke through the real config", async () => {
      const victim = anchor.web3.Keypair.generate().publicKey;
      const victimReceipt = receiptFor(config, victim, ACHIEVEMENT, 2);
      await mintAchievement(config, null, victim, 2);

      await expectAnchorError(
        program.methods
          .revokeBadge()
          .accountsPartial({ badgeConfig: config, badgeReceipt: victimReceipt, authority: attacker.publicKey })
          .signers([attacker])
          .rpc(),
        "UnauthorizedAuthority"
      );
      expect((await program.account.badgeReceipt.fetch(victimReceipt)).isValid).to.equal(true);
    });

    it("attacker cannot front-run the real receipt address from a rogue config", async () => {
      const victim = anchor.web3.Keypair.generate().publicKey;
      const realReceipt = receiptFor(config, victim, ACHIEVEMENT, 3);

      // Attacker signs with their own config but targets the address the real
      // issuer will use: seeds bind the address to the config, so this fails.
      await expectAnchorError(mintAchievement(attackerConfig, attacker, victim, 3, realReceipt), "ConstraintSeeds");

      await mintAchievement(config, null, victim, 3);
      const r = await program.account.badgeReceipt.fetch(realReceipt);
      expect(r.badgeConfig.toBase58()).to.equal(config.toBase58());
    });

    it("a rogue config's receipt does not squat the recipient's badge slot", async () => {
      const victim = anchor.web3.Keypair.generate().publicKey;
      // Attacker mints first, through the address derived from their own config.
      await mintAchievement(attackerConfig, attacker, victim, 4);

      // The real issuer can still mint the same badge to the same recipient.
      await mintAchievement(config, null, victim, 4);
      const realReceipt = receiptFor(config, victim, ACHIEVEMENT, 4);
      expect((await program.account.badgeReceipt.fetch(realReceipt)).badgeConfig.toBase58()).to.equal(
        config.toBase58()
      );
    });

    it("a self-issued badge from a rogue config does not verify against the real config", async () => {
      await mintAchievement(attackerConfig, attacker, attacker.publicKey, 5);
      const forged = receiptFor(attackerConfig, attacker.publicKey, ACHIEVEMENT, 5);

      await expectAnchorError(verify(config, forged, attacker.publicKey), "ConfigMismatch");
      // It only verifies against the config that actually issued it.
      await verify(attackerConfig, forged, attacker.publicKey);
    });
  });
});
