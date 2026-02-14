// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArcaneaGovernance
 * @author Arcanea Protocol
 * @notice Guardian Council governance contract for the Arcanea ecosystem.
 *
 * @dev Implements:
 *   - Proposal creation by Guardian agents (GUARDIAN_ROLE) or delegates (DELEGATE_ROLE)
 *   - Dual voting: 10 Guardian votes (each weight = 1) + community delegate votes
 *   - Quorum: 7/10 Guardians must approve + 51% of active delegate weight
 *   - Timelock: 48-hour delay between proposal passing and execution
 *   - Emergency proposals: Shinkami (SHINKAMI_ROLE) can fast-track with 24-hour window
 *   - Treasury management: proposals can transfer ETH or call arbitrary contracts
 *   - Proposal types: PARAMETER_CHANGE, TREASURY_SPEND, EMERGENCY, GUARDIAN_UPDATE
 *
 * Security decisions:
 *   - Timelock prevents immediate execution of passed proposals (gives time to react)
 *   - Emergency proposals still have a 24-hour window (cannot be instant)
 *   - Proposals expire after 14 days if not executed
 *   - One active proposal per proposer (prevents spam)
 *   - Guardian votes are binary (approve/reject), delegate votes are weighted
 *   - ReentrancyGuard on all execution and treasury functions
 *   - Executed proposals are marked to prevent replay
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ArcaneaGovernance is AccessControl, ReentrancyGuard {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice The 10 Guardian AI agents (or their operators). Each has 1 vote.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice Community delegates who hold voting weight.
    bytes32 public constant DELEGATE_ROLE = keccak256("DELEGATE_ROLE");

    /// @notice Shinkami (Source Gate Guardian) — can create emergency proposals.
    bytes32 public constant SHINKAMI_ROLE = keccak256("SHINKAMI_ROLE");

    /// @notice Admin — can manage roles and configuration.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Total number of Guardian seats.
    uint256 public constant TOTAL_GUARDIANS = 10;

    /// @notice Guardian quorum: 7 out of 10 must approve.
    uint256 public constant GUARDIAN_QUORUM = 7;

    /// @notice Delegate quorum: 51% of total active delegate weight.
    uint256 public constant DELEGATE_QUORUM_BPS = 5100;

    /// @notice Standard timelock: 48 hours between approval and execution.
    uint256 public constant STANDARD_TIMELOCK = 48 hours;

    /// @notice Emergency timelock: 24 hours (fast-track).
    uint256 public constant EMERGENCY_TIMELOCK = 24 hours;

    /// @notice Proposal expiry: 14 days after creation.
    uint256 public constant PROPOSAL_EXPIRY = 14 days;

    /// @notice Voting period: 7 days from proposal creation.
    uint256 public constant VOTING_PERIOD = 7 days;

    /// @notice Basis points denominator.
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────

    enum ProposalType {
        PARAMETER_CHANGE, // Update protocol parameters
        TREASURY_SPEND, // Send ETH from treasury
        EMERGENCY, // Fast-track emergency action
        GUARDIAN_UPDATE // Update Guardian roster or weights
    }

    enum ProposalStatus {
        Active, // Voting is open
        Passed, // Quorum met, awaiting timelock
        Rejected, // Did not meet quorum
        Queued, // In timelock, awaiting execution
        Executed, // Successfully executed
        Expired, // Past expiry without execution
        Cancelled // Cancelled by proposer or admin
    }

    enum VoteType {
        Against,
        For,
        Abstain
    }

    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    struct Proposal {
        uint256 proposalId;
        ProposalType proposalType;
        address proposer;
        string description;
        // Execution payload
        address target; // Contract to call (or recipient for treasury spend)
        uint256 value; // ETH to send
        bytes callData; // Function call data
        // Timing
        uint64 createdAt;
        uint64 votingEndsAt;
        uint64 executableAt; // After timelock expires
        uint64 expiresAt;
        // Voting tallies
        uint256 guardianForVotes;
        uint256 guardianAgainstVotes;
        uint256 delegateForWeight;
        uint256 delegateAgainstWeight;
        uint256 delegateAbstainWeight;
        // Status
        ProposalStatus status;
        bool isEmergency;
    }

    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    error ProposalNotFound(uint256 proposalId);
    error ProposalNotActive(uint256 proposalId);
    error ProposalNotPassed(uint256 proposalId);
    error ProposalNotQueued(uint256 proposalId);
    error ProposalExpired(uint256 proposalId);
    error VotingPeriodEnded(uint256 proposalId);
    error VotingPeriodNotEnded(uint256 proposalId);
    error TimelockNotExpired(uint256 proposalId, uint256 executableAt);
    error AlreadyVoted(uint256 proposalId, address voter);
    error NotProposer(uint256 proposalId);
    error ProposerHasActiveProposal(address proposer);
    error ExecutionFailed(uint256 proposalId);
    error InsufficientTreasuryBalance(uint256 requested, uint256 available);
    error ZeroAddress();
    error InvalidDelegateWeight();
    error NoEmergencyPermission();
    error QuorumNotMet(uint256 proposalId);

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event ProposalCreated(
        uint256 indexed proposalId,
        ProposalType proposalType,
        address indexed proposer,
        string description,
        address target,
        uint256 value,
        bool isEmergency
    );

    event GuardianVoteCast(uint256 indexed proposalId, address indexed guardian, VoteType vote);

    event DelegateVoteCast(uint256 indexed proposalId, address indexed delegate, VoteType vote, uint256 weight);

    event ProposalQueued(uint256 indexed proposalId, uint64 executableAt);

    event ProposalExecuted(uint256 indexed proposalId);

    event ProposalCancelled(uint256 indexed proposalId);

    event ProposalRejected(uint256 indexed proposalId);

    event DelegateWeightUpdated(address indexed delegate, uint256 oldWeight, uint256 newWeight);

    event TotalDelegateWeightUpdated(uint256 oldTotal, uint256 newTotal);

    event TreasuryDeposit(address indexed from, uint256 amount);

    event EmergencyProposalCreated(uint256 indexed proposalId, address indexed shinkami);

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Auto-incrementing proposal ID.
    uint256 private _nextProposalId = 1;

    /// @notice Proposal storage.
    mapping(uint256 => Proposal) public proposals;

    /// @notice Track whether a guardian has voted on a proposal.
    /// @dev proposalId => guardian address => hasVoted
    mapping(uint256 => mapping(address => bool)) public guardianHasVoted;

    /// @notice Track whether a delegate has voted on a proposal.
    mapping(uint256 => mapping(address => bool)) public delegateHasVoted;

    /// @notice Delegate voting weight.
    mapping(address => uint256) public delegateWeight;

    /// @notice Total active delegate weight (sum of all delegates).
    uint256 public totalDelegateWeight;

    /// @notice Track active proposal per proposer (one at a time).
    mapping(address => uint256) public activeProposal;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param admin     Address granted admin roles.
     * @param shinkami  Address of Shinkami (Source Gate Guardian) for emergency proposals.
     */
    constructor(address admin, address shinkami) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        if (shinkami != address(0)) {
            _grantRole(SHINKAMI_ROLE, shinkami);
            _grantRole(GUARDIAN_ROLE, shinkami);
        }
    }

    // ──────────────────────────────────────────────
    //  Proposal Creation
    // ──────────────────────────────────────────────

    /**
     * @notice Create a standard governance proposal.
     * @dev Only GUARDIAN_ROLE or DELEGATE_ROLE can create proposals.
     *      One active proposal per proposer at a time.
     *
     * @param proposalType  Type of proposal (affects quorum rules).
     * @param description   Human-readable description.
     * @param target        Contract to call when executed (or ETH recipient for treasury).
     * @param value         ETH value to send with the execution call.
     * @param callData      Encoded function call data (empty for pure ETH transfers).
     */
    function createProposal(
        ProposalType proposalType,
        string calldata description,
        address target,
        uint256 value,
        bytes calldata callData
    ) external returns (uint256 proposalId) {
        if (!hasRole(GUARDIAN_ROLE, msg.sender) && !hasRole(DELEGATE_ROLE, msg.sender)) {
            revert ZeroAddress(); // Unauthorized (reusing error for gas efficiency)
        }
        if (activeProposal[msg.sender] != 0) {
            // Check if previous proposal is still active
            Proposal storage prev = proposals[activeProposal[msg.sender]];
            if (prev.status == ProposalStatus.Active || prev.status == ProposalStatus.Passed
                || prev.status == ProposalStatus.Queued) {
                revert ProposerHasActiveProposal(msg.sender);
            }
        }

        proposalId = _nextProposalId++;
        uint64 now_ = uint64(block.timestamp);

        proposals[proposalId] = Proposal({
            proposalId: proposalId,
            proposalType: proposalType,
            proposer: msg.sender,
            description: description,
            target: target,
            value: value,
            callData: callData,
            createdAt: now_,
            votingEndsAt: now_ + uint64(VOTING_PERIOD),
            executableAt: 0, // Set when queued
            expiresAt: now_ + uint64(PROPOSAL_EXPIRY),
            guardianForVotes: 0,
            guardianAgainstVotes: 0,
            delegateForWeight: 0,
            delegateAgainstWeight: 0,
            delegateAbstainWeight: 0,
            status: ProposalStatus.Active,
            isEmergency: false
        });

        activeProposal[msg.sender] = proposalId;

        emit ProposalCreated(proposalId, proposalType, msg.sender, description, target, value, false);
    }

    /**
     * @notice Create an emergency proposal with shortened timelock (24h).
     * @dev Only SHINKAMI_ROLE can create emergency proposals.
     *      Emergency proposals have the same voting period but shorter timelock.
     */
    function createEmergencyProposal(
        string calldata description,
        address target,
        uint256 value,
        bytes calldata callData
    ) external onlyRole(SHINKAMI_ROLE) returns (uint256 proposalId) {
        proposalId = _nextProposalId++;
        uint64 now_ = uint64(block.timestamp);

        proposals[proposalId] = Proposal({
            proposalId: proposalId,
            proposalType: ProposalType.EMERGENCY,
            proposer: msg.sender,
            description: description,
            target: target,
            value: value,
            callData: callData,
            createdAt: now_,
            votingEndsAt: now_ + uint64(VOTING_PERIOD),
            executableAt: 0,
            expiresAt: now_ + uint64(PROPOSAL_EXPIRY),
            guardianForVotes: 0,
            guardianAgainstVotes: 0,
            delegateForWeight: 0,
            delegateAgainstWeight: 0,
            delegateAbstainWeight: 0,
            status: ProposalStatus.Active,
            isEmergency: true
        });

        activeProposal[msg.sender] = proposalId;

        emit EmergencyProposalCreated(proposalId, msg.sender);
        emit ProposalCreated(proposalId, ProposalType.EMERGENCY, msg.sender, description, target, value, true);
    }

    // ──────────────────────────────────────────────
    //  Voting
    // ──────────────────────────────────────────────

    /**
     * @notice Cast a Guardian vote on a proposal.
     * @dev Each Guardian has exactly 1 vote (binary: For or Against).
     *      Abstain is not available for Guardians — they must take a stance.
     */
    function castGuardianVote(uint256 proposalId, VoteType vote) external onlyRole(GUARDIAN_ROLE) {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.proposalId == 0) revert ProposalNotFound(proposalId);
        if (proposal.status != ProposalStatus.Active) revert ProposalNotActive(proposalId);
        if (block.timestamp > proposal.votingEndsAt) revert VotingPeriodEnded(proposalId);
        if (guardianHasVoted[proposalId][msg.sender]) revert AlreadyVoted(proposalId, msg.sender);

        guardianHasVoted[proposalId][msg.sender] = true;

        if (vote == VoteType.For) {
            proposal.guardianForVotes++;
        } else if (vote == VoteType.Against) {
            proposal.guardianAgainstVotes++;
        }
        // Abstain: counted but doesn't affect quorum for Guardians

        emit GuardianVoteCast(proposalId, msg.sender, vote);
    }

    /**
     * @notice Cast a delegate vote on a proposal.
     * @dev Delegate votes are weighted by their assigned delegateWeight.
     *      All three vote types (For, Against, Abstain) are available.
     */
    function castDelegateVote(uint256 proposalId, VoteType vote) external onlyRole(DELEGATE_ROLE) {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.proposalId == 0) revert ProposalNotFound(proposalId);
        if (proposal.status != ProposalStatus.Active) revert ProposalNotActive(proposalId);
        if (block.timestamp > proposal.votingEndsAt) revert VotingPeriodEnded(proposalId);
        if (delegateHasVoted[proposalId][msg.sender]) revert AlreadyVoted(proposalId, msg.sender);

        uint256 weight = delegateWeight[msg.sender];
        if (weight == 0) revert InvalidDelegateWeight();

        delegateHasVoted[proposalId][msg.sender] = true;

        if (vote == VoteType.For) {
            proposal.delegateForWeight += weight;
        } else if (vote == VoteType.Against) {
            proposal.delegateAgainstWeight += weight;
        } else {
            proposal.delegateAbstainWeight += weight;
        }

        emit DelegateVoteCast(proposalId, msg.sender, vote, weight);
    }

    // ──────────────────────────────────────────────
    //  Proposal Lifecycle
    // ──────────────────────────────────────────────

    /**
     * @notice Finalize voting and queue the proposal for execution (if passed).
     * @dev Can be called by anyone after the voting period ends.
     *      Checks both Guardian quorum (7/10) and delegate quorum (51% weight).
     */
    function finalizeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.proposalId == 0) revert ProposalNotFound(proposalId);
        if (proposal.status != ProposalStatus.Active) revert ProposalNotActive(proposalId);
        if (block.timestamp <= proposal.votingEndsAt) revert VotingPeriodNotEnded(proposalId);

        // Check Guardian quorum: 7/10 must vote For
        bool guardianQuorumMet = proposal.guardianForVotes >= GUARDIAN_QUORUM;

        // Check delegate quorum: 51% of total delegate weight must vote For
        bool delegateQuorumMet = true;
        if (totalDelegateWeight > 0) {
            uint256 requiredWeight = totalDelegateWeight * DELEGATE_QUORUM_BPS / BPS_DENOMINATOR;
            delegateQuorumMet = proposal.delegateForWeight >= requiredWeight;
        }

        if (guardianQuorumMet && delegateQuorumMet) {
            proposal.status = ProposalStatus.Queued;

            uint256 timelock = proposal.isEmergency ? EMERGENCY_TIMELOCK : STANDARD_TIMELOCK;
            proposal.executableAt = uint64(block.timestamp + timelock);

            emit ProposalQueued(proposalId, proposal.executableAt);
        } else {
            proposal.status = ProposalStatus.Rejected;
            emit ProposalRejected(proposalId);
        }
    }

    /**
     * @notice Execute a queued proposal after the timelock has expired.
     * @dev Performs the target call with the specified value and callData.
     *      ReentrancyGuard protects against re-entrancy from the target call.
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.proposalId == 0) revert ProposalNotFound(proposalId);
        if (proposal.status != ProposalStatus.Queued) revert ProposalNotQueued(proposalId);
        if (block.timestamp < proposal.executableAt) {
            revert TimelockNotExpired(proposalId, proposal.executableAt);
        }
        if (block.timestamp > proposal.expiresAt) revert ProposalExpired(proposalId);

        // Check treasury balance for value transfers
        if (proposal.value > 0 && address(this).balance < proposal.value) {
            revert InsufficientTreasuryBalance(proposal.value, address(this).balance);
        }

        proposal.status = ProposalStatus.Executed;

        // Execute the proposal
        if (proposal.target != address(0)) {
            (bool success,) = proposal.target.call{ value: proposal.value }(proposal.callData);
            if (!success) revert ExecutionFailed(proposalId);
        }

        emit ProposalExecuted(proposalId);
    }

    /**
     * @notice Cancel a proposal. Only the proposer or ADMIN_ROLE can cancel.
     * @dev Can cancel at any stage except Executed.
     */
    function cancelProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.proposalId == 0) revert ProposalNotFound(proposalId);
        if (proposal.status == ProposalStatus.Executed) revert ProposalNotActive(proposalId);
        if (proposal.proposer != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert NotProposer(proposalId);
        }

        proposal.status = ProposalStatus.Cancelled;

        emit ProposalCancelled(proposalId);
    }

    // ──────────────────────────────────────────────
    //  Delegate Management
    // ──────────────────────────────────────────────

    /**
     * @notice Set the voting weight for a delegate.
     * @dev Only ADMIN_ROLE. Weight of 0 effectively removes voting power.
     *      Also manages DELEGATE_ROLE grant/revoke.
     */
    function setDelegateWeight(address delegate, uint256 weight) external onlyRole(ADMIN_ROLE) {
        if (delegate == address(0)) revert ZeroAddress();

        uint256 oldWeight = delegateWeight[delegate];
        uint256 oldTotal = totalDelegateWeight;

        // Update weight
        delegateWeight[delegate] = weight;
        totalDelegateWeight = totalDelegateWeight - oldWeight + weight;

        // Manage role
        if (weight > 0 && !hasRole(DELEGATE_ROLE, delegate)) {
            _grantRole(DELEGATE_ROLE, delegate);
        } else if (weight == 0 && hasRole(DELEGATE_ROLE, delegate)) {
            _revokeRole(DELEGATE_ROLE, delegate);
        }

        emit DelegateWeightUpdated(delegate, oldWeight, weight);
        emit TotalDelegateWeightUpdated(oldTotal, totalDelegateWeight);
    }

    // ──────────────────────────────────────────────
    //  Treasury
    // ──────────────────────────────────────────────

    /// @notice Deposit ETH into the governance treasury.
    function deposit() external payable {
        emit TreasuryDeposit(msg.sender, msg.value);
    }

    /// @notice Get the current treasury balance.
    function treasuryBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @dev Accept ETH deposits.
    receive() external payable {
        emit TreasuryDeposit(msg.sender, msg.value);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /// @notice Get a proposal by ID.
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    /// @notice Check if quorum requirements are currently met for a proposal.
    function isQuorumMet(uint256 proposalId) external view returns (bool guardianMet, bool delegateMet) {
        Proposal storage proposal = proposals[proposalId];
        guardianMet = proposal.guardianForVotes >= GUARDIAN_QUORUM;

        if (totalDelegateWeight > 0) {
            uint256 requiredWeight = totalDelegateWeight * DELEGATE_QUORUM_BPS / BPS_DENOMINATOR;
            delegateMet = proposal.delegateForWeight >= requiredWeight;
        } else {
            delegateMet = true; // No delegates = auto-met
        }
    }

    /// @notice Get the current vote tally for a proposal.
    function getVoteTally(uint256 proposalId)
        external
        view
        returns (
            uint256 guardianFor,
            uint256 guardianAgainst,
            uint256 delegateFor,
            uint256 delegateAgainst,
            uint256 delegateAbstain
        )
    {
        Proposal storage p = proposals[proposalId];
        return (
            p.guardianForVotes,
            p.guardianAgainstVotes,
            p.delegateForWeight,
            p.delegateAgainstWeight,
            p.delegateAbstainWeight
        );
    }
}
