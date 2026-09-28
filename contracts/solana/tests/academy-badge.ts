import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { AcademyBadge } from "../target/types/academy_badge";
import { provider, expectAnchorError } from "./helpers";

describe("academy-badge", () => {
  const program = anchor.workspace.AcademyBadge as Program<AcademyBadge>;
  const authority = provider.wallet.publicKey;
  const [config] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("badge_config"), authority.toBuffer()],
    program.programId
  );
  const recipient = anchor.web3.Keypair.generate().publicKey;
  const receiptFor = (who: anchor.web3.PublicKey, category: number, id: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("badge_receipt"), who.toBuffer(), Buffer.from([category]), Buffer.from([id])],
      program.programId
    )[0];

  // BadgeCategory::GateCompletion = 1, gate id 3 (Heart).
  const receipt = receiptFor(recipient, 1, 3);

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
          badgeReceipt: receiptFor(recipient, 0, 7),
          recipient,
          badgeAuthority: authority,
        })
        .rpc(),
      "InvalidCategoryId"
    );
  });

  it("verifies the badge for its holder only", async () => {
    await program.methods.verifyBadge().accountsPartial({ badgeReceipt: receipt, holder: recipient }).rpc();

    await expectAnchorError(
      program.methods
        .verifyBadge()
        .accountsPartial({ badgeReceipt: receipt, holder: anchor.web3.Keypair.generate().publicKey })
        .rpc(),
      "BadgeNotFound"
    );
  });

  it("fails verification after revocation", async () => {
    await program.methods.revokeBadge().accountsPartial({ badgeConfig: config, badgeReceipt: receipt, authority }).rpc();

    await expectAnchorError(
      program.methods.verifyBadge().accountsPartial({ badgeReceipt: receipt, holder: recipient }).rpc(),
      "BadgeRevoked"
    );
  });
});
