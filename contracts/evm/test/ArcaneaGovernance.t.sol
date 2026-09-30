// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ArcaneaGovernance } from "../src/ArcaneaGovernance.sol";

contract ArcaneaGovernanceTest is Test {
    ArcaneaGovernance internal gov;

    address internal admin = makeAddr("admin");
    address internal shinkami = makeAddr("shinkami");
    address payable internal recipient = payable(makeAddr("recipient"));
    address[] internal guardians;

    function setUp() public {
        vm.warp(1_700_000_000);
        gov = new ArcaneaGovernance(admin, shinkami);

        bytes32 guardianRole = gov.GUARDIAN_ROLE();
        guardians.push(shinkami);
        for (uint256 i = 1; i < gov.TOTAL_GUARDIANS(); i++) {
            address g = makeAddr(string.concat("guardian", vm.toString(i)));
            guardians.push(g);
            vm.prank(admin);
            gov.grantRole(guardianRole, g);
        }

        vm.deal(address(this), 5 ether);
        gov.deposit{ value: 5 ether }();
    }

    function _propose() internal returns (uint256) {
        vm.prank(guardians[1]);
        return gov.createProposal(ArcaneaGovernance.ProposalType.TREASURY_SPEND, "grant", recipient, 1 ether, "");
    }

    function _vote(uint256 id, uint256 forVotes) internal {
        for (uint256 i = 0; i < forVotes; i++) {
            vm.prank(guardians[i]);
            gov.castGuardianVote(id, ArcaneaGovernance.VoteType.For);
        }
    }

    function _status(uint256 id) internal view returns (uint8) {
        return uint8(gov.getProposal(id).status);
    }

    function test_TreasurySpendPassesQuorumAndExecutesAfterTimelock() public {
        uint256 id = _propose();
        _vote(id, gov.GUARDIAN_QUORUM());

        vm.warp(block.timestamp + gov.VOTING_PERIOD() + 1);
        gov.finalizeProposal(id);
        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Queued));

        uint64 executableAt = gov.getProposal(id).executableAt;
        vm.expectRevert(abi.encodeWithSelector(ArcaneaGovernance.TimelockNotExpired.selector, id, executableAt));
        gov.executeProposal(id);

        vm.warp(executableAt);
        gov.executeProposal(id);

        assertEq(recipient.balance, 1 ether);
        assertEq(gov.treasuryBalance(), 4 ether);
        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Executed));
    }

    function test_BelowQuorumIsRejected() public {
        uint256 id = _propose();
        _vote(id, gov.GUARDIAN_QUORUM() - 1);

        vm.warp(block.timestamp + gov.VOTING_PERIOD() + 1);
        gov.finalizeProposal(id);

        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Rejected));
    }

    function test_GuardianCannotVoteTwice() public {
        uint256 id = _propose();

        vm.startPrank(guardians[0]);
        gov.castGuardianVote(id, ArcaneaGovernance.VoteType.For);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaGovernance.AlreadyVoted.selector, id, guardians[0]));
        gov.castGuardianVote(id, ArcaneaGovernance.VoteType.For);
        vm.stopPrank();
    }

    function test_CannotFinalizeDuringVoting() public {
        uint256 id = _propose();

        vm.expectRevert(abi.encodeWithSelector(ArcaneaGovernance.VotingPeriodNotEnded.selector, id));
        gov.finalizeProposal(id);
    }

    function test_NonMemberCannotPropose() public {
        vm.prank(makeAddr("outsider"));
        vm.expectRevert(ArcaneaGovernance.ZeroAddress.selector);
        gov.createProposal(ArcaneaGovernance.ProposalType.PARAMETER_CHANGE, "x", address(0), 0, "");
    }

    function test_ProposerCannotHaveTwoActiveProposals() public {
        _propose();

        vm.prank(guardians[1]);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaGovernance.ProposerHasActiveProposal.selector, guardians[1]));
        gov.createProposal(ArcaneaGovernance.ProposalType.PARAMETER_CHANGE, "x", address(0), 0, "");
    }

    function test_EmergencyProposalUsesShorterTimelock() public {
        vm.prank(shinkami);
        uint256 id = gov.createEmergencyProposal("halt", recipient, 1 ether, "");
        _vote(id, gov.GUARDIAN_QUORUM());

        vm.warp(block.timestamp + gov.VOTING_PERIOD() + 1);
        gov.finalizeProposal(id);

        assertEq(gov.getProposal(id).executableAt, uint64(block.timestamp + gov.EMERGENCY_TIMELOCK()));
    }

    // ── Second-model audit (Codex) C3: delegate quorum must round UP
    // ─────
    // 51% of the total delegate weight, floored, let 0 For-weight pass with a single
    // weight-1 delegate and exactly half pass with total weight 2.

    /// Configure delegates with the given weights; returns their addresses.
    function _delegates(uint256[] memory weights) internal returns (address[] memory ds) {
        ds = new address[](weights.length);
        for (uint256 i = 0; i < weights.length; i++) {
            ds[i] = makeAddr(string.concat("delegate", vm.toString(i)));
            vm.prank(admin);
            gov.setDelegateWeight(ds[i], weights[i]);
        }
    }

    /// Full Guardian quorum plus For votes from the first `forCount` delegates, then finalize.
    function _finalizeWithDelegates(address[] memory ds, uint256 forCount) internal returns (uint256 id) {
        id = _propose();
        _vote(id, gov.GUARDIAN_QUORUM());
        for (uint256 i = 0; i < forCount; i++) {
            vm.prank(ds[i]);
            gov.castDelegateVote(id, ArcaneaGovernance.VoteType.For);
        }
        vm.warp(block.timestamp + gov.VOTING_PERIOD() + 1);
        gov.finalizeProposal(id);
    }

    function _weights(uint256 a) internal pure returns (uint256[] memory w) {
        w = new uint256[](1);
        w[0] = a;
    }

    function _ones(uint256 n) internal pure returns (uint256[] memory w) {
        w = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            w[i] = 1;
        }
    }

    /// Total weight 1: zero delegate support must NOT meet quorum (floor gave 0 required).
    function test_C3_Weight1_NoDelegateSupportIsRejected() public {
        address[] memory ds = _delegates(_weights(1));
        uint256 id = _finalizeWithDelegates(ds, 0);

        (, bool delegateMet) = gov.isQuorumMet(id);
        assertFalse(delegateMet, "0 of 1 is not 51%");
        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Rejected));
    }

    function test_C3_Weight1_SoleDelegateForPasses() public {
        address[] memory ds = _delegates(_weights(1));
        uint256 id = _finalizeWithDelegates(ds, 1);
        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Queued));
    }

    /// Total weight 2: exactly half (1 of 2) is not 51% (floor gave 1 required).
    function test_C3_Weight2_HalfIsRejected() public {
        address[] memory ds = _delegates(_ones(2));
        uint256 id = _finalizeWithDelegates(ds, 1);
        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Rejected));

        uint256 id2 = _proposeAs(guardians[2]);
        _finalizeAfterVotes(id2, ds, 2);
        assertEq(_status(id2), uint8(ArcaneaGovernance.ProposalStatus.Queued), "2 of 2 passes");
    }

    /// Total weight 3: 1 of 3 must fail (floor gave 1 required), 2 of 3 passes.
    function test_C3_Weight3_OneThirdIsRejectedTwoThirdsPasses() public {
        address[] memory ds = _delegates(_ones(3));
        uint256 id = _finalizeWithDelegates(ds, 1);
        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Rejected));

        uint256 id2 = _proposeAs(guardians[2]);
        _finalizeAfterVotes(id2, ds, 2);
        assertEq(_status(id2), uint8(ArcaneaGovernance.ProposalStatus.Queued));
    }

    /// Total weight 100 (weights 50 + 50): 50 fails, 100 passes; with 49 + 51, 51 passes.
    function test_C3_Weight100_BoundaryAt51() public {
        uint256[] memory w = new uint256[](2);
        w[0] = 50;
        w[1] = 50;
        address[] memory ds = _delegates(w);
        uint256 id = _finalizeWithDelegates(ds, 1);
        assertEq(_status(id), uint8(ArcaneaGovernance.ProposalStatus.Rejected), "50 of 100");

        // Re-weight to 51 + 49 (total still 100); the weight-51 delegate alone passes.
        vm.startPrank(admin);
        gov.setDelegateWeight(ds[0], 51);
        gov.setDelegateWeight(ds[1], 49);
        vm.stopPrank();
        uint256 id2 = _proposeAs(guardians[2]);
        _finalizeAfterVotes(id2, ds, 1);
        assertEq(_status(id2), uint8(ArcaneaGovernance.ProposalStatus.Queued), "51 of 100");
    }

    function _proposeAs(address proposer) internal returns (uint256) {
        vm.prank(proposer);
        return gov.createProposal(ArcaneaGovernance.ProposalType.TREASURY_SPEND, "grant", recipient, 1 ether, "");
    }

    function _finalizeAfterVotes(uint256 id, address[] memory ds, uint256 forCount) internal {
        _vote(id, gov.GUARDIAN_QUORUM());
        for (uint256 i = 0; i < forCount; i++) {
            vm.prank(ds[i]);
            gov.castDelegateVote(id, ArcaneaGovernance.VoteType.For);
        }
        vm.warp(block.timestamp + gov.VOTING_PERIOD() + 1);
        gov.finalizeProposal(id);
    }
}
