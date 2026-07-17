import { expect } from 'chai';
import { ethers } from 'hardhat';

const nativePrice = ethers.parseEther('1');
const erc20Price = 100_000_000n;
const maxSupply = 3n;
const nativeToken = ethers.ZeroAddress;

async function deploy() {
  const [admin, buyer, developer, operatorPool, protocolTreasury, other] = await ethers.getSigners();
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const usdc = (await MockUSDC.deploy()) as any;
  const License = await ethers.getContractFactory('ClawSkillLicense');
  const license = (await License.deploy(
    'ipfs://starlight/{id}.json',
    admin.address,
    protocolTreasury.address,
    operatorPool.address,
    await usdc.getAddress(),
  )) as any;
  return { admin, buyer, developer, operatorPool, protocolTreasury, other, usdc, license };
}

async function registerDefaultPack(ctx: Awaited<ReturnType<typeof deploy>>) {
  await ctx.license.registerPack(
    1,
    ctx.developer.address,
    nativePrice,
    erc20Price,
    maxSupply,
    'sha256:manifest',
    'sha256:terms',
    '0.1.0',
    { developer: 9000, operatorPool: 0, protocol: 1000 },
  );
}

describe('ClawSkillLicense', () => {
  it('sells native licenses and accrues pull payouts', async () => {
    const ctx = await deploy();
    await registerDefaultPack(ctx);

    await expect(ctx.license.connect(ctx.buyer).purchaseLicense(1, 2, { value: ethers.parseEther('2') }))
      .to.emit(ctx.license, 'LicensePurchased')
      .withArgs(1, ctx.buyer.address, 2, nativeToken, ethers.parseEther('2'));

    expect(await ctx.license.balanceOf(ctx.buyer.address, 1)).to.equal(2);
    expect(await ctx.license.pendingWithdrawals(nativeToken, ctx.developer.address)).to.equal(ethers.parseEther('1.8'));
    expect(await ctx.license.pendingWithdrawals(nativeToken, ctx.protocolTreasury.address)).to.equal(
      ethers.parseEther('0.2'),
    );
  });

  it('refunds native overpayment', async () => {
    const ctx = await deploy();
    await registerDefaultPack(ctx);

    await expect(() =>
      ctx.license.connect(ctx.buyer).purchaseLicense(1, 1, { value: ethers.parseEther('1.25') }),
    ).to.changeEtherBalances([ctx.buyer, ctx.license], [ethers.parseEther('-1'), ethers.parseEther('1')]);
  });

  it('rejects inactive packs and supply overflow', async () => {
    const ctx = await deploy();
    await registerDefaultPack(ctx);

    await expect(ctx.license.connect(ctx.buyer).purchaseLicense(1, 4, { value: ethers.parseEther('4') })).to.be
      .revertedWithCustomError(ctx.license, 'SupplyExceeded');

    await ctx.license.setPackStatus(1, false);
    await expect(ctx.license.connect(ctx.buyer).purchaseLicense(1, 1, { value: nativePrice })).to.be
      .revertedWithCustomError(ctx.license, 'PackInactive');
  });

  it('sells ERC20 licenses when token payment is configured', async () => {
    const ctx = await deploy();
    await registerDefaultPack(ctx);

    await ctx.usdc.mint(ctx.buyer.address, erc20Price);
    await ctx.usdc.connect(ctx.buyer).approve(await ctx.license.getAddress(), erc20Price);

    await ctx.license.connect(ctx.buyer).purchaseLicenseWithToken(1, 1);

    expect(await ctx.license.balanceOf(ctx.buyer.address, 1)).to.equal(1);
    expect(await ctx.license.pendingWithdrawals(await ctx.usdc.getAddress(), ctx.developer.address)).to.equal(
      90_000_000n,
    );
    expect(await ctx.license.pendingWithdrawals(await ctx.usdc.getAddress(), ctx.protocolTreasury.address)).to.equal(
      10_000_000n,
    );
  });

  it('supports third-party marketplace split defaults', async () => {
    const ctx = await deploy();

    await ctx.license.registerPack(
      2,
      ctx.developer.address,
      nativePrice,
      erc20Price,
      0,
      'sha256:third-party',
      'sha256:terms',
      '0.1.0',
      { developer: 7500, operatorPool: 1500, protocol: 1000 },
    );

    await ctx.license.connect(ctx.buyer).purchaseLicense(2, 1, { value: nativePrice });

    expect(await ctx.license.pendingWithdrawals(nativeToken, ctx.developer.address)).to.equal(
      ethers.parseEther('0.75'),
    );
    expect(await ctx.license.pendingWithdrawals(nativeToken, ctx.operatorPool.address)).to.equal(
      ethers.parseEther('0.15'),
    );
    expect(await ctx.license.pendingWithdrawals(nativeToken, ctx.protocolTreasury.address)).to.equal(
      ethers.parseEther('0.1'),
    );
  });

  it('pauses purchases and exposes ERC2981 royalties', async () => {
    const ctx = await deploy();
    await registerDefaultPack(ctx);

    await ctx.license.setDefaultRoyalty(ctx.protocolTreasury.address, 500);
    const [receiver, royaltyAmount] = await ctx.license.royaltyInfo(1, ethers.parseEther('10'));
    expect(receiver).to.equal(ctx.protocolTreasury.address);
    expect(royaltyAmount).to.equal(ethers.parseEther('0.5'));

    await ctx.license.pause();
    await expect(
      ctx.license.connect(ctx.buyer).purchaseLicense(1, 1, { value: nativePrice }),
    ).to.be.revertedWithCustomError(ctx.license, 'EnforcedPause');
  });

  it('limits pack management to authorized roles', async () => {
    const ctx = await deploy();

    await expect(
      ctx.license
        .connect(ctx.other)
        .registerPack(1, ctx.developer.address, nativePrice, erc20Price, 1, 'm', 't', 'v', {
          developer: 9000,
          operatorPool: 0,
          protocol: 1000,
        }),
    ).to.be.reverted;
  });
});
