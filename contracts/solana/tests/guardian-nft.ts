import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { expect } from "chai";
import { GuardianNft } from "../target/types/guardian_nft";
import { provider, expectAnchorError } from "./helpers";

describe("guardian-nft", () => {
  const program = anchor.workspace.GuardianNft as Program<GuardianNft>;
  const authority = provider.wallet.publicKey;
  const [collection] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("collection"), authority.toBuffer()],
    program.programId
  );
  const metaFor = (mint: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("arcanean_meta"), mint.toBuffer()], program.programId)[0];

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
});
