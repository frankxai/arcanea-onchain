import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Rewards } from "../target/types/rewards";
import { provider, expectAnchorError, balance, airdrop, LAMPORTS } from "./helpers";

describe("rewards", () => {
  const program = anchor.workspace.Rewards as Program<Rewards>;
  const admin = provider.wallet.publicKey;
  const guardianVault = anchor.web3.Keypair.generate().publicKey;
  const communityTreasury = anchor.web3.Keypair.generate().publicKey;
  const creator = anchor.web3.Keypair.generate();
  const [pool] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reward_pool"), admin.toBuffer()],
    program.programId
  );
  const [creatorReward] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("creator_reward"), pool.toBuffer(), creator.publicKey.toBuffer()],
    program.programId
  );

  it("rejects shares that do not sum to 100%", async () => {
    await expectAnchorError(
      program.methods
        .initialize(7000, 2000, 500)
        .accountsPartial({ rewardPool: pool, guardianVault, communityTreasury, admin })
        .rpc(),
      "InvalidShareTotal"
    );
  });

  it("initializes a 70/20/10 pool", async () => {
    await program.methods
      .initialize(7000, 2000, 1000)
      .accountsPartial({ rewardPool: pool, guardianVault, communityTreasury, admin })
      .rpc();

    const p = await program.account.rewardPool.fetch(pool);
    expect(p.creatorShareBps).to.equal(7000);
    expect(p.isActive).to.equal(true);
  });

  it("distributes: pays guardian + community, credits the creator", async () => {
    await program.methods
      .distribute(new BN(1 * LAMPORTS))
      .accountsPartial({
        rewardPool: pool,
        creatorReward,
        creator: creator.publicKey,
        guardianVault,
        communityTreasury,
        distributor: admin,
      })
      .rpc();

    expect(await balance(guardianVault)).to.equal(0.2 * LAMPORTS);
    expect(await balance(communityTreasury)).to.equal(0.1 * LAMPORTS);

    const r = await program.account.creatorReward.fetch(creatorReward);
    expect(r.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(r.claimable.toNumber()).to.equal(0.7 * LAMPORTS);

    const p = await program.account.rewardPool.fetch(pool);
    expect(p.uniqueCreators).to.equal(1);
  });

  it("lets the creator claim their balance", async () => {
    await airdrop(creator.publicKey, 1);
    const before = await balance(creator.publicKey);

    await program.methods
      .claimReward()
      .accountsPartial({ rewardPool: pool, creatorReward, creator: creator.publicKey })
      .signers([creator])
      .rpc();

    // Fee payer is the provider wallet, so the creator receives exactly the claim.
    expect((await balance(creator.publicKey)) - before).to.equal(0.7 * LAMPORTS);
    const r = await program.account.creatorReward.fetch(creatorReward);
    expect(r.claimable.toNumber()).to.equal(0);
  });

  it("rejects a second claim with nothing owed", async () => {
    await expectAnchorError(
      program.methods
        .claimReward()
        .accountsPartial({ rewardPool: pool, creatorReward, creator: creator.publicKey })
        .signers([creator])
        .rpc(),
      "NothingToClaim"
    );
  });

  it("rejects distribution from a non-distributor", async () => {
    const outsider = anchor.web3.Keypair.generate();
    await airdrop(outsider.publicKey, 2);
    await expectAnchorError(
      program.methods
        .distribute(new BN(0.5 * LAMPORTS))
        .accountsPartial({
          rewardPool: pool,
          creatorReward,
          creator: creator.publicKey,
          guardianVault,
          communityTreasury,
          distributor: outsider.publicKey,
        })
        .signers([outsider])
        .rpc(),
      "UnauthorizedDistributor"
    );
  });
});
