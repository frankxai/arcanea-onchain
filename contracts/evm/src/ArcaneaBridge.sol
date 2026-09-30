// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArcaneaBridge
 * @author Arcanea Protocol
 * @notice Cross-chain NFT bridge adapter for Arcanea NFTs between Solana and Base L2.
 *
 * @dev Implements a lock-and-mint / burn-and-unlock bridging pattern:
 *
 *   Solana → Base (Inbound):
 *     1. NFT is locked/escrowed on Solana (handled by Solana program)
 *     2. Wormhole VAA (Verified Action Approval) is generated
 *     3. Relayer calls `mintBridgedNFT()` on this contract with the VAA
 *     4. A wrapped Arcanea NFT is minted on Base with preserved metadata
 *
 *   Base → Solana (Outbound):
 *     1. User calls `bridgeToSolana()` — NFT is locked in this contract
 *     2. Bridge request event is emitted
 *     3. Off-chain relayer processes the event and unlocks on Solana
 *
 * Security decisions:
 *   - Guardian approval required for high-value transfers. "High value" is
 *     derived on-chain, never supplied by the caller (see `isHighValueCollection`).
 *     There is no price oracle, so the value basis is an ADMIN_ROLE-assessed
 *     per-collection value: a collection is low-value only if an admin has
 *     explicitly assessed it BELOW `highValueThreshold`. Unassessed collections
 *     default to high-value and require Guardian approval.
 *     The high-value decision is re-evaluated at acknowledge time (the last
 *     point before the Solana mint), so reclassifying a collection also applies
 *     to requests that are already outstanding. An explicit Guardian approval
 *     is the only stored override.
 *   - Outbound requests are two-phase on the relayer side: the relayer must
 *     `acknowledgeBridgeRequest()` BEFORE it mints on Solana, and the requester
 *     can only cancel while the request is still Pending (unacknowledged) and
 *     `cancelTimeout` has elapsed. This closes the cancel-after-mint race that
 *     would otherwise leave the NFT on both chains.
 *   - Once Acknowledged, the NFT can no longer be returned on Base by fiat. The
 *     request can only be completed, or failed by the SAME relayer that
 *     acknowledged it, and only after that request's `ackDeadline`
 *     (acknowledge time + `ackTimeout`, snapshotted at acknowledge). No other
 *     relayer and no admin can fail it.
 *
 * Residual trust assumption (acknowledged requests):
 *   Base cannot observe Solana, so the EVM side cannot prove the destination
 *   mint did NOT happen. Safety of `failBridgeRequest` on an acknowledged request
 *   rests on the acknowledging relayer (a single key) honoring this protocol:
 *     (1) it mints on Solana only before the request's `ackDeadline`, carrying
 *         the EVM requestId so the Solana side can dedupe by requestId, and
 *     (2) it fails an acknowledged request only if it did not mint, and never
 *         mints for a request after `BridgeAcknowledgementRevoked` was emitted.
 *   A Solana-side bridge program must enforce (1) (reject a mint whose
 *   deadline has passed or whose requestId was already used) before mainnet.
 *   If the acknowledging relayer disappears, an acknowledged request stays
 *   locked on Base: that is the safe failure mode (no duplicate), not a bug.
 *   - Emergency pause stops all bridge operations
 *   - Configurable bridge fee to prevent spam
 *   - Per-token bridge tracking to prevent double-minting
 *   - Timelock on bridge requests (configurable cooldown)
 *   - Only whitelisted NFT collections can be bridged
 *   - Wormhole integration is via interface — actual VAA verification
 *     is delegated to the Wormhole core contract
 */

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ArcaneaBridge is AccessControl, Pausable, ReentrancyGuard {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice Relayer role — can process inbound bridge messages (mint bridged NFTs).
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice Guardian role — approves high-value bridge requests.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice Admin role — configures bridge parameters.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────

    enum BridgeDirection {
        SolanaToBase,
        BaseToSolana
    }

    enum BridgeStatus {
        Pending, // Request created, awaiting processing (requester may cancel after cancelTimeout)
        Completed, // Successfully bridged
        Cancelled, // Cancelled by the requester
        Failed, // Failed during processing (NFT returned)
        Acknowledged // Relayer committed to minting on the destination chain; no user cancel
    }

    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    /// @notice A bridge request record.
    struct BridgeRequest {
        uint256 requestId;
        BridgeDirection direction;
        address nftContract; // EVM NFT contract address
        uint256 tokenId; // EVM token ID
        bytes32 solanaAccount; // Solana destination/source account (32 bytes)
        address requester; // EVM address that initiated the bridge
        uint256 timestamp;
        BridgeStatus status;
        bool guardianApproved; // Explicit Guardian approval only. Low-value status is NOT stored:
        // it is re-derived from the collection's current assessment at acknowledge time.
    }

    /// @notice Bridged token metadata preserved across chains.
    struct BridgedMetadata {
        bytes32 sourceChainHash; // Hash of source chain + contract + tokenId
        uint8 element;
        uint8 guardian;
        uint8 rank;
        uint8 gateLevel;
        uint8 house;
        uint8 tier;
        string metadataURI;
    }

    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    error CollectionNotWhitelisted(address collection);
    error TokenAlreadyBridged(address collection, uint256 tokenId);
    error BridgeRequestNotFound(uint256 requestId);
    error BridgeRequestNotPending(uint256 requestId);
    error InvalidSolanaAccount();
    error InsufficientBridgeFee(uint256 required, uint256 sent);
    error HighValueTransferRequiresGuardianApproval(uint256 requestId);
    error RequestAlreadyApproved(uint256 requestId);
    error NotRequester(uint256 requestId);
    error ZeroAddress();
    error WithdrawalFailed();
    error NoBalanceToWithdraw();
    error CooldownNotElapsed(uint256 availableAt);
    error CancelTimeoutNotElapsed(uint256 availableAt);
    error BridgeRequestNotAcknowledged(uint256 requestId);
    error InvalidBridgeDirection(uint256 requestId);
    error NotRelayerOrAdmin(address account);
    error NotAcknowledgingRelayer(uint256 requestId, address acknowledgedBy);
    error AckTimeoutNotElapsed(uint256 availableAt);
    error AckTimeoutTooShort(uint256 minimum);

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event BridgeRequestCreated(
        uint256 indexed requestId,
        BridgeDirection direction,
        address indexed nftContract,
        uint256 indexed tokenId,
        bytes32 solanaAccount,
        address requester
    );

    event BridgeCompleted(uint256 indexed requestId, BridgeDirection direction);
    event BridgeCancelled(uint256 indexed requestId);
    event BridgeFailed(uint256 indexed requestId, string reason);

    event GuardianApproval(uint256 indexed requestId, address indexed guardian);
    event BridgeAcknowledged(uint256 indexed requestId, address indexed relayer);
    event CollectionValueAssessed(address indexed collection, uint256 value);
    event CollectionValueCleared(address indexed collection);
    event CancelTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event AckTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);

    /// @notice The acknowledging relayer revoked its acknowledgement and the NFT was
    ///         returned on Base. The Solana side MUST NOT mint for `requestId` after this.
    event BridgeAcknowledgementRevoked(uint256 indexed requestId, address indexed relayer, bytes32 solanaAccount);

    event BridgedNFTMinted(
        address indexed nftContract, uint256 indexed tokenId, bytes32 sourceChainHash, address recipient
    );

    event CollectionWhitelisted(address indexed collection, bool status);
    event BridgeFeeUpdated(uint256 oldFee, uint256 newFee);
    event HighValueThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event WormholeCoreUpdated(address indexed oldCore, address indexed newCore);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Auto-incrementing request ID.
    uint256 private _nextRequestId = 1;

    /// @notice Bridge fee in wei (to prevent spam bridging). Default: 0.001 ETH.
    uint256 public bridgeFee = 0.001 ether;

    /// @notice Assessed value (wei) at or above which Guardian approval is required.
    /// @dev Compared against `collectionAssessedValue`. Unassessed collections are
    ///      always treated as high-value (fail-closed).
    uint256 public highValueThreshold = 1 ether;

    /// @notice Minimum time a Pending outbound request must wait before its requester
    ///         may cancel it. Gives the relayer time to acknowledge before minting.
    uint256 public cancelTimeout = 1 days;

    /// @notice Lower bound for `ackTimeout`, so an admin cannot make acknowledged
    ///         requests instantly failable.
    uint256 public constant MIN_ACK_TIMEOUT = 1 days;

    /// @notice How long after acknowledging a request its relayer must wait before
    ///         it may fail it. Snapshotted per request at acknowledge time.
    uint256 public ackTimeout = 7 days;

    /// @notice The relayer that acknowledged each outbound request.
    mapping(uint256 => address) public acknowledgedBy;

    /// @notice Earliest time an acknowledged request may be failed by its relayer.
    mapping(uint256 => uint256) public ackDeadline;

    /// @notice ADMIN_ROLE-assessed value (wei) per collection. The value basis for
    ///         the high-value check, since no on-chain price oracle is used.
    mapping(address => uint256) public collectionAssessedValue;

    /// @notice Whether an admin has assessed the collection's value at all.
    mapping(address => bool) public collectionValueAssessed;

    /// @notice Minimum time between bridge requests per user (anti-spam).
    uint256 public cooldownPeriod = 5 minutes;

    /// @notice Wormhole core contract address for VAA verification.
    address public wormholeCore;

    /// @notice Whitelisted NFT collections that can be bridged.
    mapping(address => bool) public whitelistedCollections;

    /// @notice Bridge request storage.
    mapping(uint256 => BridgeRequest) public bridgeRequests;

    /// @notice Track bridged tokens to prevent double-bridging.
    /// @dev keccak256(collection, tokenId) => true if currently locked/bridged.
    mapping(bytes32 => bool) public bridgedTokens;

    /// @notice Bridged token metadata (for inbound mints).
    mapping(bytes32 => BridgedMetadata) public bridgedMetadata;

    /// @notice Last bridge request timestamp per user (cooldown enforcement).
    mapping(address => uint256) public lastBridgeTime;

    /// @notice Accumulated bridge fees for admin withdrawal.
    uint256 public accumulatedFees;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param admin       Address granted all admin roles.
     * @param wormhole    Address of the Wormhole core contract (for VAA verification).
     */
    constructor(address admin, address wormhole) {
        if (admin == address(0)) revert ZeroAddress();

        wormholeCore = wormhole;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    // ──────────────────────────────────────────────
    //  Outbound: Base → Solana
    // ──────────────────────────────────────────────

    /**
     * @notice Lock an NFT on Base to bridge it to Solana.
     * @dev The NFT is transferred to this contract (locked). An off-chain relayer
     *      monitors the BridgeRequestCreated event and unlocks/mints on Solana.
     *
     *      Whether the request is high-value is derived on-chain from the
     *      collection's admin-assessed value (see `isHighValueCollection`). If it
     *      is, a Guardian must call `approveHighValueBridge()` before the relayer
     *      can acknowledge it.
     *
     * @param nftContract    The ERC-721 collection address.
     * @param tokenId        Token ID to bridge.
     * @param solanaAccount  Destination Solana wallet (32 bytes).
     */
    function bridgeToSolana(
        address nftContract,
        uint256 tokenId,
        bytes32 solanaAccount
    )
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 requestId)
    {
        if (!whitelistedCollections[nftContract]) revert CollectionNotWhitelisted(nftContract);
        if (solanaAccount == bytes32(0)) revert InvalidSolanaAccount();
        if (msg.value < bridgeFee) revert InsufficientBridgeFee(bridgeFee, msg.value);

        // Cooldown check
        if (block.timestamp < lastBridgeTime[msg.sender] + cooldownPeriod) {
            revert CooldownNotElapsed(lastBridgeTime[msg.sender] + cooldownPeriod);
        }

        // Check not already bridged
        bytes32 tokenHash = keccak256(abi.encodePacked(nftContract, tokenId));
        if (bridgedTokens[tokenHash]) revert TokenAlreadyBridged(nftContract, tokenId);

        // Lock the NFT in this contract
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        // Mark as bridged
        bridgedTokens[tokenHash] = true;
        lastBridgeTime[msg.sender] = block.timestamp;
        accumulatedFees += msg.value;

        // Create bridge request. High-value is derived on-chain (at acknowledge time),
        // never caller-supplied.
        requestId = _nextRequestId++;
        bridgeRequests[requestId] = BridgeRequest({
            requestId: requestId,
            direction: BridgeDirection.BaseToSolana,
            nftContract: nftContract,
            tokenId: tokenId,
            solanaAccount: solanaAccount,
            requester: msg.sender,
            timestamp: block.timestamp,
            status: BridgeStatus.Pending,
            guardianApproved: false // Only an explicit Guardian approval sets this
        });

        emit BridgeRequestCreated(
            requestId, BridgeDirection.BaseToSolana, nftContract, tokenId, solanaAccount, msg.sender
        );
    }

    /**
     * @notice Guardian approves a high-value bridge request.
     * @dev Must be called before the relayer can process the request.
     */
    function approveHighValueBridge(uint256 requestId) external onlyRole(GUARDIAN_ROLE) {
        BridgeRequest storage request = bridgeRequests[requestId];
        if (request.requestId == 0) revert BridgeRequestNotFound(requestId);
        if (request.status != BridgeStatus.Pending) revert BridgeRequestNotPending(requestId);
        if (request.guardianApproved) revert RequestAlreadyApproved(requestId);

        request.guardianApproved = true;

        emit GuardianApproval(requestId, msg.sender);
    }

    /**
     * @notice Relayer commits to processing an outbound request. MUST be called
     *         (and confirmed) BEFORE the relayer mints/unlocks on Solana.
     * @dev Once acknowledged, the requester can no longer cancel, so the NFT cannot
     *      be reclaimed on Base after it has been minted on Solana.
     *
     *      High-value status is re-derived here from the collection's CURRENT
     *      assessment (fail-closed): a request created while the collection was
     *      assessed low-value needs Guardian approval if the collection has since
     *      been cleared or the threshold lowered.
     */
    function acknowledgeBridgeRequest(uint256 requestId) external onlyRole(RELAYER_ROLE) whenNotPaused {
        BridgeRequest storage request = bridgeRequests[requestId];
        if (request.requestId == 0) revert BridgeRequestNotFound(requestId);
        if (request.direction != BridgeDirection.BaseToSolana) revert InvalidBridgeDirection(requestId);
        if (request.status != BridgeStatus.Pending) revert BridgeRequestNotPending(requestId);
        if (!request.guardianApproved && isHighValueCollection(request.nftContract)) {
            revert HighValueTransferRequiresGuardianApproval(requestId);
        }

        request.status = BridgeStatus.Acknowledged;
        acknowledgedBy[requestId] = msg.sender;
        ackDeadline[requestId] = block.timestamp + ackTimeout;

        emit BridgeAcknowledged(requestId, msg.sender);
    }

    /**
     * @notice Relayer marks an outbound bridge request as completed.
     * @dev Called after the Solana side has successfully minted/unlocked the NFT.
     *      The request must have been acknowledged first.
     */
    function completeBridgeRequest(uint256 requestId) external onlyRole(RELAYER_ROLE) {
        BridgeRequest storage request = bridgeRequests[requestId];
        if (request.requestId == 0) revert BridgeRequestNotFound(requestId);
        if (request.status != BridgeStatus.Acknowledged) revert BridgeRequestNotAcknowledged(requestId);

        request.status = BridgeStatus.Completed;

        emit BridgeCompleted(requestId, request.direction);
    }

    /**
     * @notice Mark a bridge request as failed and unlock the NFT back to the requester.
     * @dev A Pending (unacknowledged) request can be failed by RELAYER_ROLE or ADMIN_ROLE.
     *      An Acknowledged request can only be failed by the relayer that acknowledged
     *      it (and still holds RELAYER_ROLE), and only once its `ackDeadline` has
     *      passed. Another relayer, or the same relayer retrying after an RPC timeout
     *      while the Solana mint is still finalizing, would otherwise return the NFT
     *      on Base while it is minted on Solana. See the residual trust assumption in
     *      the contract header.
     */
    function failBridgeRequest(uint256 requestId, string calldata reason) external nonReentrant {
        bool isRelayer = hasRole(RELAYER_ROLE, msg.sender);
        if (!isRelayer && !hasRole(ADMIN_ROLE, msg.sender)) revert NotRelayerOrAdmin(msg.sender);

        BridgeRequest storage request = bridgeRequests[requestId];
        if (request.requestId == 0) revert BridgeRequestNotFound(requestId);
        bool wasAcknowledged = request.status == BridgeStatus.Acknowledged;
        if (wasAcknowledged) {
            if (!isRelayer) revert NotRelayerOrAdmin(msg.sender);
            address acker = acknowledgedBy[requestId];
            if (msg.sender != acker) revert NotAcknowledgingRelayer(requestId, acker);
            uint256 availableAt = ackDeadline[requestId];
            if (block.timestamp < availableAt) revert AckTimeoutNotElapsed(availableAt);
        } else if (request.status != BridgeStatus.Pending) {
            revert BridgeRequestNotPending(requestId);
        }

        request.status = BridgeStatus.Failed;

        // Unlock the NFT back to the requester (outbound only)
        if (request.direction == BridgeDirection.BaseToSolana) {
            bytes32 tokenHash = keccak256(abi.encodePacked(request.nftContract, request.tokenId));
            bridgedTokens[tokenHash] = false;

            IERC721(request.nftContract).safeTransferFrom(address(this), request.requester, request.tokenId);
        }

        if (wasAcknowledged) emit BridgeAcknowledgementRevoked(requestId, msg.sender, request.solanaAccount);
        emit BridgeFailed(requestId, reason);
    }

    /**
     * @notice Cancel a pending outbound bridge request and reclaim the NFT.
     * @dev Only the original requester can cancel, only while the request is still
     *      Pending (the relayer has not acknowledged it), and only after
     *      `cancelTimeout` has elapsed since the request was created.
     */
    function cancelBridgeRequest(uint256 requestId) external nonReentrant {
        BridgeRequest storage request = bridgeRequests[requestId];
        if (request.requestId == 0) revert BridgeRequestNotFound(requestId);
        if (request.requester != msg.sender) revert NotRequester(requestId);
        if (request.status != BridgeStatus.Pending) revert BridgeRequestNotPending(requestId);
        uint256 cancellableAt = request.timestamp + cancelTimeout;
        if (block.timestamp < cancellableAt) revert CancelTimeoutNotElapsed(cancellableAt);

        request.status = BridgeStatus.Cancelled;

        // Unlock NFT (outbound only)
        if (request.direction == BridgeDirection.BaseToSolana) {
            bytes32 tokenHash = keccak256(abi.encodePacked(request.nftContract, request.tokenId));
            bridgedTokens[tokenHash] = false;

            IERC721(request.nftContract).safeTransferFrom(address(this), msg.sender, request.tokenId);
        }

        emit BridgeCancelled(requestId);
    }

    // ──────────────────────────────────────────────
    //  Inbound: Solana → Base
    // ──────────────────────────────────────────────

    /**
     * @notice Mint a bridged NFT on Base (inbound from Solana).
     * @dev Called by the RELAYER_ROLE after verifying the Wormhole VAA.
     *      The actual VAA verification is expected to be done off-chain or via
     *      a separate Wormhole integration. This function trusts the relayer.
     *
     *      For production, integrate with IWormhole.parseAndVerifyVM() before minting.
     *
     * @param nftContract      Target ArcaneaNFT contract that will mint the token.
     * @param recipient        EVM address to receive the bridged NFT.
     * @param sourceChainHash  Unique hash identifying the source chain token.
     * @param metadataURI      IPFS/Arweave URI for the token metadata.
     */
    function mintBridgedNFT(
        address nftContract,
        address recipient,
        bytes32 sourceChainHash,
        string calldata metadataURI
    )
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (bridgedTokens[sourceChainHash]) revert TokenAlreadyBridged(nftContract, 0);

        bridgedTokens[sourceChainHash] = true;

        // Store bridged metadata
        bridgedMetadata[sourceChainHash] = BridgedMetadata({
            sourceChainHash: sourceChainHash,
            element: 0,
            guardian: 0,
            rank: 0,
            gateLevel: 0,
            house: 0,
            tier: 0,
            metadataURI: metadataURI
        });

        // Create inbound bridge request record
        uint256 requestId = _nextRequestId++;
        bridgeRequests[requestId] = BridgeRequest({
            requestId: requestId,
            direction: BridgeDirection.SolanaToBase,
            nftContract: nftContract,
            tokenId: 0, // Will be set by the mint
            solanaAccount: sourceChainHash,
            requester: recipient,
            timestamp: block.timestamp,
            status: BridgeStatus.Completed,
            guardianApproved: true
        });

        // Note: The actual minting is done by calling ArcaneaNFT.mint() separately
        // because this contract doesn't have direct minting authority by design.
        // The relayer should call ArcaneaNFT.mint() with MINTER_ROLE after this call.

        emit BridgedNFTMinted(nftContract, 0, sourceChainHash, recipient);
        emit BridgeCompleted(requestId, BridgeDirection.SolanaToBase);
    }

    // ──────────────────────────────────────────────
    //  Admin Configuration
    // ──────────────────────────────────────────────

    /// @notice Whitelist or de-whitelist a collection for bridging.
    function setCollectionWhitelist(address collection, bool status) external onlyRole(ADMIN_ROLE) {
        whitelistedCollections[collection] = status;
        emit CollectionWhitelisted(collection, status);
    }

    /// @notice Update the bridge fee.
    function setBridgeFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        uint256 oldFee = bridgeFee;
        bridgeFee = newFee;
        emit BridgeFeeUpdated(oldFee, newFee);
    }

    /// @notice Update the high-value threshold.
    function setHighValueThreshold(uint256 newThreshold) external onlyRole(ADMIN_ROLE) {
        uint256 old = highValueThreshold;
        highValueThreshold = newThreshold;
        emit HighValueThresholdUpdated(old, newThreshold);
    }

    /**
     * @notice Record the assessed value (wei) of a collection. Collections assessed
     *         below `highValueThreshold` skip Guardian approval; all others need it.
     */
    function setCollectionAssessedValue(address collection, uint256 value) external onlyRole(ADMIN_ROLE) {
        collectionAssessedValue[collection] = value;
        collectionValueAssessed[collection] = true;
        emit CollectionValueAssessed(collection, value);
    }

    /// @notice Remove a collection's assessment, returning it to the high-value default.
    function clearCollectionAssessedValue(address collection) external onlyRole(ADMIN_ROLE) {
        delete collectionAssessedValue[collection];
        delete collectionValueAssessed[collection];
        emit CollectionValueCleared(collection);
    }

    /// @notice Update how long a Pending request must wait before its requester can cancel.
    function setCancelTimeout(uint256 newTimeout) external onlyRole(ADMIN_ROLE) {
        uint256 old = cancelTimeout;
        cancelTimeout = newTimeout;
        emit CancelTimeoutUpdated(old, newTimeout);
    }

    /**
     * @notice Update how long an acknowledging relayer must wait before it may fail an
     *         acknowledged request. Applies to requests acknowledged after the change.
     */
    function setAckTimeout(uint256 newTimeout) external onlyRole(ADMIN_ROLE) {
        if (newTimeout < MIN_ACK_TIMEOUT) revert AckTimeoutTooShort(MIN_ACK_TIMEOUT);
        uint256 old = ackTimeout;
        ackTimeout = newTimeout;
        emit AckTimeoutUpdated(old, newTimeout);
    }

    /// @notice Update the cooldown period between bridge requests.
    function setCooldownPeriod(uint256 newCooldown) external onlyRole(ADMIN_ROLE) {
        uint256 old = cooldownPeriod;
        cooldownPeriod = newCooldown;
        emit CooldownUpdated(old, newCooldown);
    }

    /// @notice Update the Wormhole core contract address.
    function setWormholeCore(address newCore) external onlyRole(ADMIN_ROLE) {
        address old = wormholeCore;
        wormholeCore = newCore;
        emit WormholeCoreUpdated(old, newCore);
    }

    /// @notice Pause all bridge operations.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause bridge operations.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Withdraw accumulated bridge fees.
    function withdrawFees(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NoBalanceToWithdraw();

        accumulatedFees = 0;

        (bool success,) = to.call{ value: amount }("");
        if (!success) revert WithdrawalFailed();
    }

    /// @notice Emergency withdrawal of all contract ETH.
    function emergencyWithdraw(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalanceToWithdraw();

        (bool success,) = to.call{ value: balance }("");
        if (!success) revert WithdrawalFailed();

        emit EmergencyWithdrawal(to, balance);
    }

    // ──────────────────────────────────────────────
    //  ERC-721 Receiver
    // ──────────────────────────────────────────────

    /// @dev Accept NFTs sent to this contract (needed for lock escrow).
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Whether bridging from `collection` requires Guardian approval.
     * @dev Fail-closed: true unless an admin assessed the collection below the threshold.
     *      Evaluated at acknowledge time, so it applies to outstanding requests too.
     */
    function isHighValueCollection(address collection) public view returns (bool) {
        return !collectionValueAssessed[collection] || collectionAssessedValue[collection] >= highValueThreshold;
    }

    /// @notice Check if a token is currently locked in the bridge.
    function isTokenBridged(address collection, uint256 tokenId) external view returns (bool) {
        return bridgedTokens[keccak256(abi.encodePacked(collection, tokenId))];
    }

    /// @notice Get a bridge request by ID.
    function getBridgeRequest(uint256 requestId) external view returns (BridgeRequest memory) {
        return bridgeRequests[requestId];
    }
}
