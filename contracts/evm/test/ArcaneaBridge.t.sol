// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { ArcaneaNFT } from "../src/ArcaneaNFT.sol";
import { ArcaneaBridge } from "../src/ArcaneaBridge.sol";

contract ArcaneaBridgeTest is Test {
    ArcaneaNFT internal nft;
    ArcaneaBridge internal bridge;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal relayer = makeAddr("relayer");
    address internal relayer2 = makeAddr("relayer2"); // a second, independent relayer
    address internal ops = makeAddr("ops"); // ADMIN_ROLE only — not a relayer
    bytes32 internal constant SOL_ACCOUNT = bytes32(uint256(0xA11CE));

    uint256 internal tokenId;
    uint256 internal fee;

    function setUp() public {
        // The per-user cooldown is measured from timestamp 0, so start from a realistic block time.
        vm.warp(1_700_000_000);
        nft = new ArcaneaNFT("Arcanea", "ARC", 0, 0, admin, 500, admin);
        bridge = new ArcaneaBridge(admin, address(0));
        fee = bridge.bridgeFee();

        vm.startPrank(admin);
        bridge.setCollectionWhitelist(address(nft), true);
        bridge.grantRole(bridge.RELAYER_ROLE(), relayer);
        bridge.grantRole(bridge.RELAYER_ROLE(), relayer2);
        bridge.grantRole(bridge.ADMIN_ROLE(), ops);
        vm.stopPrank();

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

    /// @dev Assess the collection below the high-value threshold (no Guardian approval needed).
    function _assessLowValue() internal {
        vm.prank(admin);
        bridge.setCollectionAssessedValue(address(nft), 0.1 ether);
    }

    function _bridge() internal returns (uint256) {
        vm.prank(alice);
        return bridge.bridgeToSolana{ value: fee }(address(nft), tokenId, SOL_ACCOUNT);
    }

    function _status(uint256 id) internal view returns (uint8) {
        return uint8(bridge.getBridgeRequest(id).status);
    }

    function test_BridgeLocksTokenAndCollectsFee() public {
        uint256 id = _bridge();

        assertEq(nft.ownerOf(tokenId), address(bridge));
        assertTrue(bridge.isTokenBridged(address(nft), tokenId));
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Pending));
        assertEq(address(bridge).balance, fee);
    }

    function test_NonWhitelistedCollectionRejected() public {
        vm.prank(admin);
        bridge.setCollectionWhitelist(address(nft), false);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.CollectionNotWhitelisted.selector, address(nft)));
        bridge.bridgeToSolana{ value: fee }(address(nft), tokenId, SOL_ACCOUNT);
    }

    function test_InsufficientFeeRejected() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.InsufficientBridgeFee.selector, fee, fee - 1));
        bridge.bridgeToSolana{ value: fee - 1 }(address(nft), tokenId, SOL_ACCOUNT);
    }

    function test_CancelReturnsTokenAfterTimeout() public {
        uint256 id = _bridge();

        vm.warp(block.timestamp + bridge.cancelTimeout());
        vm.prank(alice);
        bridge.cancelBridgeRequest(id);

        assertEq(nft.ownerOf(tokenId), alice);
        assertFalse(bridge.isTokenBridged(address(nft), tokenId));
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Cancelled));
    }

    function test_OnlyRequesterCanCancel() public {
        uint256 id = _bridge();
        vm.warp(block.timestamp + bridge.cancelTimeout());

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.NotRequester.selector, id));
        bridge.cancelBridgeRequest(id);
    }

    function test_HighValueRequiresGuardianApprovalBeforeCompletion() public {
        uint256 id = _bridge(); // unassessed collection => high value

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.HighValueTransferRequiresGuardianApproval.selector, id));
        bridge.acknowledgeBridgeRequest(id);

        vm.prank(admin);
        bridge.approveHighValueBridge(id);

        vm.startPrank(relayer);
        bridge.acknowledgeBridgeRequest(id);
        bridge.completeBridgeRequest(id);
        vm.stopPrank();

        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Completed));
    }

    // ── H1: cancel-after-mint double NFT
    // ─────────────────────────────

    /// Relayer acknowledges (and then mints on Solana). The requester must not be
    /// able to reclaim the NFT on Base afterwards — that would duplicate it.
    function test_H1_RequesterCannotCancelAfterRelayerAcknowledged() public {
        _assessLowValue();
        uint256 id = _bridge();

        vm.prank(relayer);
        bridge.acknowledgeBridgeRequest(id);
        // ... relayer now mints on Solana ...

        vm.warp(block.timestamp + bridge.cancelTimeout() + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.BridgeRequestNotPending.selector, id));
        bridge.cancelBridgeRequest(id);

        assertEq(nft.ownerOf(tokenId), address(bridge), "NFT stays locked once acknowledged");
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Acknowledged));
    }

    /// Without a timeout the requester could front-run the relayer's acknowledge
    /// with a cancel right after it saw the request picked up.
    function test_H1_RequesterCannotCancelBeforeTimeout() public {
        _assessLowValue();
        uint256 id = _bridge();
        uint256 availableAt = block.timestamp + bridge.cancelTimeout();

        vm.warp(availableAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.CancelTimeoutNotElapsed.selector, availableAt));
        bridge.cancelBridgeRequest(id);

        assertEq(nft.ownerOf(tokenId), address(bridge));
    }

    /// failBridgeRequest must not let a non-relayer admin unlock a request the
    /// relayer has already acknowledged (and possibly minted on Solana).
    function test_H1_AdminCannotFailAcknowledgedRequest() public {
        _assessLowValue();
        uint256 id = _bridge();

        vm.prank(relayer);
        bridge.acknowledgeBridgeRequest(id);

        vm.prank(ops);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.AcknowledgedRequestCannotBeFailed.selector, id));
        bridge.failBridgeRequest(id, "admin override");

        assertEq(nft.ownerOf(tokenId), address(bridge));
    }

    /// Guard: before acknowledging (so before any Solana mint) the relayer can still fail
    /// a request it cannot process, returning the NFT.
    function test_H1_RelayerCanFailPendingRequestBeforeAcknowledging() public {
        _assessLowValue();
        uint256 id = _bridge();

        vm.prank(relayer);
        bridge.failBridgeRequest(id, "cannot process");

        assertEq(nft.ownerOf(tokenId), alice);
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Failed));
    }

    function test_H1_CompleteRequiresAcknowledgement() public {
        _assessLowValue();
        uint256 id = _bridge();

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.BridgeRequestNotAcknowledged.selector, id));
        bridge.completeBridgeRequest(id);
    }

    function test_H1_UnauthorizedFailUsesAccurateError() public {
        uint256 id = _bridge();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.NotRelayerOrAdmin.selector, alice));
        bridge.failBridgeRequest(id, "nope");
    }

    // ── H2: caller-supplied high-value flag
    // ──────────────────────────

    /// With no price oracle, an unassessed collection must default to high value:
    /// the requester cannot opt out of Guardian approval.
    function test_H2_UnassessedCollectionDefaultsToHighValue() public {
        assertTrue(bridge.isHighValueCollection(address(nft)));

        uint256 id = _bridge();
        assertFalse(bridge.getBridgeRequest(id).guardianApproved, "caller cannot skip guardian approval");

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.HighValueTransferRequiresGuardianApproval.selector, id));
        bridge.acknowledgeBridgeRequest(id);
    }

    function test_H2_AssessedAtOrAboveThresholdIsHighValue() public {
        uint256 threshold = bridge.highValueThreshold();
        vm.prank(admin);
        bridge.setCollectionAssessedValue(address(nft), threshold);

        uint256 id = _bridge();
        assertFalse(bridge.getBridgeRequest(id).guardianApproved);
    }

    function test_H2_AssessedBelowThresholdSkipsGuardian() public {
        _assessLowValue();
        assertFalse(bridge.isHighValueCollection(address(nft)));

        uint256 id = _bridge();
        // Low-value is not stored as an approval; it is re-derived at acknowledge time.
        assertFalse(bridge.getBridgeRequest(id).guardianApproved);

        vm.prank(relayer);
        bridge.acknowledgeBridgeRequest(id);
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Acknowledged));
    }

    function test_H2_RaisingThresholdOrClearingAssessmentIsRespected() public {
        _assessLowValue(); // 0.1 ether
        vm.prank(admin);
        bridge.setHighValueThreshold(0.05 ether);
        assertTrue(bridge.isHighValueCollection(address(nft)), "threshold now below assessed value");

        vm.startPrank(admin);
        bridge.setHighValueThreshold(1 ether);
        bridge.clearCollectionAssessedValue(address(nft));
        vm.stopPrank();
        assertTrue(bridge.isHighValueCollection(address(nft)), "cleared => back to high-value default");
    }

    function test_H2_OnlyAdminCanAssessCollectionValue() public {
        bytes32 adminRole = bridge.ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, adminRole)
        );
        bridge.setCollectionAssessedValue(address(nft), 0);
    }
    // ── Second-model audit (Codex) C1: failing an acknowledged request
    // ───
    // After acknowledge the Solana mint may already be finalizing (or have finalized
    // behind an RPC timeout). Base cannot prove it did not happen, so no role and no
    // amount of elapsed time may return the NFT on Base.

    function _ackLowValue() internal returns (uint256 id) {
        _assessLowValue();
        id = _bridge();
        vm.prank(relayer);
        bridge.acknowledgeBridgeRequest(id);
    }

    function _assertStillLocked(uint256 id) internal view {
        assertEq(nft.ownerOf(tokenId), address(bridge), "NFT stays locked");
        assertTrue(bridge.isTokenBridged(address(nft), tokenId));
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Acknowledged));
    }

    function test_C1_OtherRelayerCannotFailAcknowledgedRequest() public {
        uint256 id = _ackLowValue();

        vm.prank(relayer2);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.AcknowledgedRequestCannotBeFailed.selector, id));
        bridge.failBridgeRequest(id, "other relayer says it failed");

        _assertStillLocked(id);
    }

    /// e.g. an RPC timeout right after acknowledge while the Solana mint is still finalizing.
    function test_C1_AckingRelayerCannotFailRightAfterAcknowledging() public {
        uint256 id = _ackLowValue();

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.AcknowledgedRequestCannotBeFailed.selector, id));
        bridge.failBridgeRequest(id, "rpc timeout");

        _assertStillLocked(id);
    }

    /// No timeout makes it safe either: the mint may have finalized while its RPC response was lost.
    function test_C1_AckingRelayerCannotFailEvenAfterLongDelay() public {
        uint256 id = _ackLowValue();

        vm.warp(block.timestamp + 365 days);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.AcknowledgedRequestCannotBeFailed.selector, id));
        bridge.failBridgeRequest(id, "gave up");

        _assertStillLocked(id);
    }

    /// The deployer admin holds both ADMIN_ROLE and RELAYER_ROLE; neither lets it fail an ack.
    function test_C1_AdminHoldingRelayerRoleCannotFailAcknowledgedRequest() public {
        uint256 id = _ackLowValue();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.AcknowledgedRequestCannotBeFailed.selector, id));
        bridge.failBridgeRequest(id, "admin override");

        _assertStillLocked(id);
    }

    /// Guard: an acknowledged request still completes normally.
    function test_C1_AcknowledgedRequestCanStillComplete() public {
        uint256 id = _ackLowValue();

        vm.prank(relayer);
        bridge.completeBridgeRequest(id);
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Completed));
    }

    // ── Second-model audit (Codex) C2: reclassification must reach outstanding requests
    // ──

    /// A request created while the collection was assessed low-value must need
    /// Guardian approval if the assessment is cleared before the relayer acknowledges.
    function test_C2_ClearingAssessmentGatesOutstandingRequest() public {
        _assessLowValue();
        uint256 id = _bridge(); // created as low-value

        vm.prank(admin);
        bridge.clearCollectionAssessedValue(address(nft));

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.HighValueTransferRequiresGuardianApproval.selector, id));
        bridge.acknowledgeBridgeRequest(id);

        vm.prank(admin);
        bridge.approveHighValueBridge(id);
        vm.prank(relayer);
        bridge.acknowledgeBridgeRequest(id);
        assertEq(_status(id), uint8(ArcaneaBridge.BridgeStatus.Acknowledged));
    }

    function test_C2_LoweringThresholdGatesOutstandingRequest() public {
        _assessLowValue(); // 0.1 ether
        uint256 id = _bridge();

        vm.prank(admin);
        bridge.setHighValueThreshold(0.05 ether);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaBridge.HighValueTransferRequiresGuardianApproval.selector, id));
        bridge.acknowledgeBridgeRequest(id);
    }
}
