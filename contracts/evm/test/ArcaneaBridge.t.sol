// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ArcaneaNFT } from "../src/ArcaneaNFT.sol";
import { ArcaneaBridge } from "../src/ArcaneaBridge.sol";

contract ArcaneaBridgeTest is Test {
    ArcaneaNFT internal nft;
    ArcaneaBridge internal bridge;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    bytes32 internal constant SOL_ACCOUNT = bytes32(uint256(0xA11CE));

    uint256 internal tokenId;
    uint256 internal fee;

    function setUp() public {
        // The per-user cooldown is measured from timestamp 0, so start from a realistic block time.
        vm.warp(1_700_000_000);
        nft = new ArcaneaNFT("Arcanea", "ARC", 0, 0, admin, 500, admin);
        bridge = new ArcaneaBridge(admin, address(0));
        fee = bridge.bridgeFee();

        vm.prank(admin);
        bridge.setCollectionWhitelist(address(nft), true);

        vm.prank(admin);
        tokenId = nft.mint(
            alice,
            ArcaneaNFT.Element.Void,
            ArcaneaNFT.Guardian.Shinkami,
            ArcaneaNFT.House.Nero,
            ArcaneaNFT.Tier.Legendary,
            false
        );

        vm.prank(alice);
        nft.setApprovalForAll(address(bridge), true);
        vm.deal(alice, 1 ether);
    }

    function _bridge(bool highValue) internal returns (uint256) {
        vm.prank(alice);
        return bridge.bridgeToSolana{ value: fee }(address(nft), tokenId, SOL_ACCOUNT, highValue);
    }

    function test_BridgeLocksTokenAndCollectsFee() public {
        uint256 id = _bridge(false);

        assertEq(nft.ownerOf(tokenId), address(bridge));
        assertTrue(bridge.isTokenBridged(address(nft), tokenId));
        assertEq(uint8(bridge.getBridgeRequest(id).status), uint8(ArcaneaBridge.BridgeStatus.Pending));
        assertEq(address(bridge).balance, fee);
    }

    function test_NonWhitelistedCollectionRejected() public {
        vm.prank(admin);
        bridge.setCollectionWhitelist(address(nft), false);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.CollectionNotWhitelisted.selector, address(nft)));
        bridge.bridgeToSolana{ value: fee }(address(nft), tokenId, SOL_ACCOUNT, false);
    }

    function test_InsufficientFeeRejected() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.InsufficientBridgeFee.selector, fee, fee - 1));
        bridge.bridgeToSolana{ value: fee - 1 }(address(nft), tokenId, SOL_ACCOUNT, false);
    }

    function test_CancelReturnsToken() public {
        uint256 id = _bridge(false);

        vm.prank(alice);
        bridge.cancelBridgeRequest(id);

        assertEq(nft.ownerOf(tokenId), alice);
        assertFalse(bridge.isTokenBridged(address(nft), tokenId));
    }

    function test_OnlyRequesterCanCancel() public {
        uint256 id = _bridge(false);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.NotRequester.selector, id));
        bridge.cancelBridgeRequest(id);
    }

    function test_HighValueRequiresGuardianApprovalBeforeCompletion() public {
        uint256 id = _bridge(true);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.HighValueTransferRequiresGuardianApproval.selector, id));
        bridge.completeBridgeRequest(id);

        vm.startPrank(admin);
        bridge.approveHighValueBridge(id);
        bridge.completeBridgeRequest(id);
        vm.stopPrank();

        assertEq(uint8(bridge.getBridgeRequest(id).status), uint8(ArcaneaBridge.BridgeStatus.Completed));
    }
}
