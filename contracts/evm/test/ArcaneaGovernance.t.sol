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
}
