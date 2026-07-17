import { expect } from 'chai';
import { ethers } from 'hardhat';

function findParsedEvent(contract: any, logs: readonly any[], eventName: string) {
  return logs
    .map((log: any) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log: any) => log?.name === eventName);
}

async function deploy() {
  const [owner, assetOwner, other, licenseTemplate] = await ethers.getSigners();
  const MockStory = await ethers.getContractFactory('MockStoryProtocol');
  const story = (await MockStory.deploy()) as any;
  const MockERC721 = await ethers.getContractFactory('MockERC721');
  const nft = (await MockERC721.deploy()) as any;
  const Registry = await ethers.getContractFactory('StoryIPRegistry');
  const registry = (await Registry.deploy(await story.getAddress(), await story.getAddress())) as any;

  await nft.mint(assetOwner.address, 1);

  return { owner, assetOwner, other, licenseTemplate, story, nft, registry };
}

describe('StoryIPRegistry', () => {
  it('registers an owned creative NFT as a Story IP asset', async () => {
    const ctx = await deploy();

    const tx = await ctx.registry
      .connect(ctx.assetOwner)
      .registerWorldAsset(await ctx.nft.getAddress(), 1, 'ipfs://metadata');
    const receipt = await tx.wait();
    const event = findParsedEvent(ctx.registry, receipt?.logs ?? [], 'IPAssetRegistered');

    expect(event).to.not.equal(undefined);
    const ipAsset = event?.args.ipAssetAddress;

    expect(await ctx.story.isRegistered(ipAsset)).to.equal(true);
    expect(await ctx.registry.ipAssets(await ctx.nft.getAddress(), 1)).to.equal(ipAsset);
  });

  it('rejects registration by a non-owner without operator approval', async () => {
    const ctx = await deploy();

    await expect(
      ctx.registry.connect(ctx.other).registerWorldAsset(await ctx.nft.getAddress(), 1, 'ipfs://metadata'),
    ).to.be.revertedWith('Not owner or approved');
  });

  it('allows an approved operator to register the asset', async () => {
    const ctx = await deploy();
    await ctx.nft.connect(ctx.assetOwner).setApprovalForAll(ctx.other.address, true);

    await ctx.registry
      .connect(ctx.other)
      .registerWorldAsset(await ctx.nft.getAddress(), 1, 'ipfs://metadata');

    const ipAsset = await ctx.registry.ipAssets(await ctx.nft.getAddress(), 1);
    expect(await ctx.story.isRegistered(ipAsset)).to.equal(true);
  });

  it('attaches license terms only to registered IP assets', async () => {
    const ctx = await deploy();

    const tx = await ctx.registry
      .connect(ctx.assetOwner)
      .registerWorldAsset(await ctx.nft.getAddress(), 1, 'ipfs://metadata');
    const receipt = await tx.wait();
    const event = findParsedEvent(ctx.registry, receipt?.logs ?? [], 'IPAssetRegistered');
    const ipAsset = event?.args.ipAssetAddress;

    await expect(ctx.registry.attachLicenseToAsset(ipAsset, ctx.licenseTemplate.address, 7))
      .to.emit(ctx.registry, 'LicenseAttached')
      .withArgs(ipAsset, ctx.licenseTemplate.address, 7);

    await expect(
      ctx.registry.attachLicenseToAsset(ctx.other.address, ctx.licenseTemplate.address, 7),
    ).to.be.revertedWith('IP Asset not registered');
  });
});
