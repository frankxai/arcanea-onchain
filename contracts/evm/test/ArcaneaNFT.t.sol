// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { ArcaneaNFT } from "../src/ArcaneaNFT.sol";

contract ArcaneaNFTTest is Test {
    ArcaneaNFT internal nft;

    address internal admin = makeAddr("admin");
    address internal royaltyReceiver = makeAddr("royaltyReceiver");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant MINT_PRICE = 0.01 ether;

    function setUp() public {
        nft = new ArcaneaNFT("Arcanea", "ARC", 3, MINT_PRICE, royaltyReceiver, 500, admin);
        vm.deal(admin, 10 ether);
    }

    function _mint(address to, bool soulbound) internal returns (uint256) {
        vm.prank(admin);
        return nft.mint{ value: MINT_PRICE }(
            to,
            ArcaneaNFT.Element.Fire,
            ArcaneaNFT.Guardian.Draconia,
            ArcaneaNFT.House.Pyros,
            ArcaneaNFT.Tier.Rare,
            soulbound
        );
    }

    function test_ConstructorRejectsZeroAdmin() public {
        vm.expectRevert(ArcaneaNFT.ZeroAddress.selector);
        new ArcaneaNFT("A", "A", 0, 0, royaltyReceiver, 500, address(0));
    }

    function test_ConstructorRejectsRoyaltyAbove100Percent() public {
        vm.expectRevert(abi.encodeWithSelector(ArcaneaNFT.InvalidRoyaltyBps.selector, uint96(10_001)));
        new ArcaneaNFT("A", "A", 0, 0, royaltyReceiver, 10_001, admin);
    }

    function test_MintAssignsTokenAndAttributes() public {
        uint256 id = _mint(alice, false);

        assertEq(id, 1);
        assertEq(nft.ownerOf(id), alice);
        assertEq(nft.totalMinted(), 1);

        ArcaneaNFT.ArcaneanAttributes memory a = nft.getAttributes(id);
        assertEq(uint8(a.element), uint8(ArcaneaNFT.Element.Fire));
        assertEq(uint8(a.guardian), uint8(ArcaneaNFT.Guardian.Draconia));
        assertEq(uint8(a.rank), uint8(ArcaneaNFT.Rank.Apprentice));
        assertEq(a.gateLevel, 0);
        assertFalse(a.soulbound);
    }

    function test_MintRequiresMinterRole() public {
        vm.deal(alice, 1 ether);
        bytes32 minterRole = nft.MINTER_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, minterRole)
        );
        nft.mint{ value: MINT_PRICE }(
            alice,
            ArcaneaNFT.Element.Fire,
            ArcaneaNFT.Guardian.Draconia,
            ArcaneaNFT.House.Pyros,
            ArcaneaNFT.Tier.Rare,
            false
        );
    }

    function test_MintRevertsOnUnderpayment() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaNFT.InsufficientPayment.selector, MINT_PRICE, MINT_PRICE - 1));
        nft.mint{ value: MINT_PRICE - 1 }(
            alice,
            ArcaneaNFT.Element.Fire,
            ArcaneaNFT.Guardian.Draconia,
            ArcaneaNFT.House.Pyros,
            ArcaneaNFT.Tier.Rare,
            false
        );
    }

    function test_MaxSupplyIsEnforced() public {
        _mint(alice, false);
        _mint(alice, false);
        _mint(alice, false);

        vm.prank(admin);
        vm.expectRevert(ArcaneaNFT.MaxSupplyReached.selector);
        nft.mint{ value: MINT_PRICE }(
            alice,
            ArcaneaNFT.Element.Fire,
            ArcaneaNFT.Guardian.Draconia,
            ArcaneaNFT.House.Pyros,
            ArcaneaNFT.Tier.Rare,
            false
        );
    }

    function test_SoulboundTokenCannotBeTransferred() public {
        uint256 id = _mint(alice, true);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaNFT.SoulboundToken.selector, id));
        nft.transferFrom(alice, bob, id);
    }

    function test_TradeableTokenCanBeTransferred() public {
        uint256 id = _mint(alice, false);

        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        assertEq(nft.ownerOf(id), bob);
    }

    function test_EvolveDerivesRankFromGateLevel() public {
        uint256 id = _mint(alice, false);

        vm.startPrank(admin);
        nft.evolveAttributes(id, 4);
        assertEq(uint8(nft.getAttributes(id).rank), uint8(ArcaneaNFT.Rank.Mage));
        nft.evolveAttributes(id, 10);
        vm.stopPrank();

        ArcaneaNFT.ArcaneanAttributes memory a = nft.getAttributes(id);
        assertEq(uint8(a.rank), uint8(ArcaneaNFT.Rank.Luminor));
        assertEq(a.gateLevel, 10);
        assertEq(a.evolutionCount, 2);
    }

    function test_EvolveRejectsGateLevelAboveTen() public {
        uint256 id = _mint(alice, false);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaNFT.InvalidGateLevel.selector, uint8(11)));
        nft.evolveAttributes(id, 11);
    }

    function test_DefaultRoyaltyIsReported() public {
        uint256 id = _mint(alice, false);

        (address receiver, uint256 amount) = nft.royaltyInfo(id, 1 ether);
        assertEq(receiver, royaltyReceiver);
        assertEq(amount, 0.05 ether);
    }

    function test_WithdrawFundsSendsMintProceeds() public {
        _mint(alice, false);
        _mint(bob, false);

        address payable treasury = payable(makeAddr("treasury"));
        vm.prank(admin);
        nft.withdrawFunds(treasury);

        assertEq(treasury.balance, 2 * MINT_PRICE);
        assertEq(address(nft).balance, 0);
    }

    function test_PauseBlocksMinting() public {
        vm.prank(admin);
        nft.pause();

        vm.prank(admin);
        vm.expectRevert();
        nft.mint{ value: MINT_PRICE }(
            alice,
            ArcaneaNFT.Element.Fire,
            ArcaneaNFT.Guardian.Draconia,
            ArcaneaNFT.House.Pyros,
            ArcaneaNFT.Tier.Rare,
            false
        );
    }
}
