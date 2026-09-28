import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import { GuardianNft } from "../target/types/guardian_nft";
import { provider, expectAnchorError, fundedKeypair } from "./helpers";

describe("guardian-nft", () => {
  const program = anchor.workspace.GuardianNft as Program<GuardianNft>;
  const authority = provider.wallet.publicKey;
  const [collection] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("collection"), authority.toBuffer()],
    program.programId
  );
  const collectionFor = (auth: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("collection"), auth.toBuffer()], program.programId)[0];
  // Metadata PDA: [b"arcanean_meta", collection_config, nft_mint].
  const metaForIn = (col: anchor.web3.PublicKey, mint: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("arcanean_meta"), col.toBuffer(), mint.toBuffer()],
      program.programId
    )[0];
  const metaFor = (mint: anchor.web3.PublicKey) => metaForIn(collection, mint);

  const firstMint = anchor.web3.Keypair.generate().publicKey;
  const recipient = anchor.web3.Keypair.generate().publicKey;

  const mint = (nftMint: anchor.web3.PublicKey) =>
    program.methods
      .mintNft({ fire: {} }, { draconia: {} }, { pyros: {} }, { rare: {} }, false)
      .accountsPartial({
        collectionConfig: collection,
        arcaneanMetadata: metaFor(nftMint),
        nftMint,
        recipient,
        mintAuthority: authority,
      })
      .rpc();

  it("initializes a collection", async () => {
    await program.methods
      .initializeCollection("Arcanea Guardians", "ARCG", "https://arcanea.ai/c.json", new BN(1), 500)
      .accountsPartial({ collectionConfig: collection, authority })
      .rpc();

    const config = await program.account.collectionConfig.fetch(collection);
    expect(config.name).to.equal("Arcanea Guardians");
    expect(config.maxSupply.toNumber()).to.equal(1);
    expect(config.currentSupply.toNumber()).to.equal(0);
    expect(config.isActive).to.equal(true);
  });

  it("mints an NFT with its attributes", async () => {
    await mint(firstMint);

    const meta = await program.account.arcaneanMetadata.fetch(metaFor(firstMint));
    expect(meta.collection.toBase58()).to.equal(collection.toBase58());
    expect(meta.element).to.deep.equal({ fire: {} });
    expect(meta.rank).to.deep.equal({ apprentice: {} });
    expect(meta.gateLevel).to.equal(0);

    const config = await program.account.collectionConfig.fetch(collection);
    expect(config.currentSupply.toNumber()).to.equal(1);
  });

  it("enforces max supply", async () => {
    await expectAnchorError(mint(anchor.web3.Keypair.generate().publicKey), "MaxSupplyReached");
  });

  it("evolves attributes and derives rank from gate level", async () => {
    await program.methods
      .evolveAttributes(7)
      .accountsPartial({ collectionConfig: collection, arcaneanMetadata: metaFor(firstMint), guardianAuthority: authority })
      .rpc();

    const meta = await program.account.arcaneanMetadata.fetch(metaFor(firstMint));
    expect(meta.gateLevel).to.equal(7);
    expect(meta.rank).to.deep.equal({ archmage: {} });
    expect(meta.evolutionCount).to.equal(1);
  });

  it("rejects gate levels above 10", async () => {
    await expectAnchorError(
      program.methods
        .evolveAttributes(11)
        .accountsPartial({ collectionConfig: collection, arcaneanMetadata: metaFor(firstMint), guardianAuthority: authority })
        .rpc(),
      "InvalidGateLevel"
    );
  });

  it("rejects evolution by a non-guardian", async () => {
    const outsider = anchor.web3.Keypair.generate();
    await expectAnchorError(
      program.methods
        .evolveAttributes(3)
        .accountsPartial({
          collectionConfig: collection,
          arcaneanMetadata: metaFor(firstMint),
          guardianAuthority: outsider.publicKey,
        })
        .signers([outsider])
        .rpc(),
      "UnauthorizedGuardianAuthority"
    );
  });
  // ── Adversarial: anyone can create a collection, so metadata must only be ──
  // ── touched through the collection that minted it.                       ──
  describe("collection binding (adversarial)", () => {
    let attacker: anchor.web3.Keypair;
    let attackerCollection: anchor.web3.PublicKey;

    const mintIn = (col: anchor.web3.PublicKey, signer: anchor.web3.Keypair, nftMint: anchor.web3.PublicKey) =>
      program.methods
        .mintNft({ water: {} }, { leyla: {} }, { aqualis: {} }, { common: {} }, false)
        .accountsPartial({
          collectionConfig: col,
          arcaneanMetadata: metaForIn(col, nftMint),
          nftMint,
          recipient,
          mintAuthority: signer.publicKey,
        })
        .signers([signer])
        .rpc();

    const initCollection = (signer: anchor.web3.Keypair) =>
      program.methods
        .initializeCollection("Rogue", "RGE", "https://example.invalid/c.json", new BN(0), 0)
        .accountsPartial({ collectionConfig: collectionFor(signer.publicKey), authority: signer.publicKey })
        .signers([signer])
        .rpc();

    before(async () => {
      attacker = await fundedKeypair(3);
      attackerCollection = collectionFor(attacker.publicKey);
      await initCollection(attacker);
    });

    it("rejects setSoulbound through an attacker-created collection", async () => {
      await expectAnchorError(
        program.methods
          .setSoulbound(true)
          .accountsPartial({
            collectionConfig: attackerCollection,
            arcaneanMetadata: metaFor(firstMint),
            guardianAuthority: attacker.publicKey,
          })
          .signers([attacker])
          .rpc(),
        "CollectionMismatch"
      );
      expect((await program.account.arcaneanMetadata.fetch(metaFor(firstMint))).isSoulbound).to.equal(false);
    });

    it("rejects evolving through an attacker-created collection", async () => {
      await expectAnchorError(
        program.methods
          .evolveAttributes(10)
          .accountsPartial({
            collectionConfig: attackerCollection,
            arcaneanMetadata: metaFor(firstMint),
            guardianAuthority: attacker.publicKey,
          })
          .signers([attacker])
          .rpc(),
        "CollectionMismatch"
      );
    });

    it("a rogue collection cannot squat the metadata address of a mint", async () => {
      // A second, legitimate collection (unlimited supply) that will mint `nftMint`.
      const issuer = await fundedKeypair(2);
      await initCollection(issuer);
      const nftMint = anchor.web3.Keypair.generate().publicKey;

      // Attacker front-runs with the same mint through their own collection.
      await mintIn(attackerCollection, attacker, nftMint);

      // The real collection's mint still goes through, at its own address.
      await mintIn(collectionFor(issuer.publicKey), issuer, nftMint);
      const meta = await program.account.arcaneanMetadata.fetch(metaForIn(collectionFor(issuer.publicKey), nftMint));
      expect(meta.collection.toBase58()).to.equal(collectionFor(issuer.publicKey).toBase58());
    });
  });
});
