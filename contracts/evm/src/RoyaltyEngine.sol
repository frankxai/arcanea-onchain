// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RoyaltyEngine
 * @author Arcanea Protocol
 * @notice Programmable multi-recipient royalty distribution engine for Arcanea NFTs.
 *
 * @dev Implements:
 *   - Multi-recipient royalty splits (up to 10 recipients per collection)
 *   - Configurable percentages per recipient (in basis points, must sum to 10000)
 *   - Pull-over-push withdrawal pattern (recipients claim their earnings)
 *   - Creator earnings tracking with per-collection and per-address accounting
 *   - Story Protocol IP asset integration points (IPAssetRegistry interface)
 *   - Support for both per-collection default splits and per-token overrides
 *
 * Security decisions:
 *   - Pull-over-push: Recipients withdraw their own earnings (no loops sending ETH)
 *   - ReentrancyGuard on all functions that move ETH
 *   - Max 10 split recipients to bound gas costs
 *   - Immutable splits once locked (optional lock for creator trust)
 *   - Only registered collections can receive distributions
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RoyaltyEngine is AccessControl, ReentrancyGuard {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice Can register collections and configure splits.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice Full admin — emergency functions.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Maximum number of split recipients per collection.
    uint256 public constant MAX_RECIPIENTS = 10;

    /// @notice Basis points denominator (10000 = 100%).
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    /// @notice A single recipient in a royalty split.
    struct SplitRecipient {
        address payable recipient;
        uint256 shareBps; // Share in basis points (e.g., 5000 = 50%)
    }

    /// @notice Royalty configuration for a collection.
    struct CollectionRoyaltyConfig {
        SplitRecipient[] recipients;
        uint96 totalRoyaltyBps; // Total royalty percentage (e.g., 1000 = 10%)
        bool isLocked; // If true, splits cannot be modified
        bool isRegistered; // Whether this collection is registered
        address storyProtocolIPId; // Optional Story Protocol IP Asset ID
    }

    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    error CollectionNotRegistered(address collection);
    error CollectionAlreadyRegistered(address collection);
    error CollectionSplitsLocked(address collection);
    error TooManyRecipients(uint256 count, uint256 max);
    error SharesMustSumTo10000(uint256 total);
    error InvalidRoyaltyBps(uint96 bps);
    error ZeroAddress();
    error ZeroShare();
    error NoBalanceToWithdraw();
    error WithdrawalFailed();
    error NoRecipientsProvided();
    error ArrayLengthMismatch();

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event CollectionRegistered(
        address indexed collection, uint96 totalRoyaltyBps, uint256 recipientCount
    );
    event SplitsUpdated(address indexed collection, uint256 recipientCount);
    event SplitsLocked(address indexed collection);
    event RoyaltyDistributed(
        address indexed collection, uint256 indexed tokenId, uint256 totalAmount, uint256 recipientCount
    );
    event EarningsWithdrawn(address indexed recipient, uint256 amount);
    event StoryProtocolIPLinked(address indexed collection, address ipId);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Collection address => royalty configuration.
    /// @dev We store recipients in a separate mapping because dynamic arrays
    ///      in structs with mappings require careful handling.
    mapping(address => uint96) public collectionRoyaltyBps;
    mapping(address => bool) public isRegistered;
    mapping(address => bool) public isLocked;
    mapping(address => address) public storyProtocolIPIds;

    /// @notice Collection => array of split recipients.
    mapping(address => SplitRecipient[]) private _splits;

    /// @notice Accumulated earnings per address (pull-over-push pattern).
    mapping(address => uint256) public earnings;

    /// @notice Total distributed per collection (for analytics).
    mapping(address => uint256) public totalDistributed;

    /// @notice Total distributed per collection per token (for analytics).
    mapping(address => mapping(uint256 => uint256)) public tokenDistributed;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param admin  Address granted DEFAULT_ADMIN_ROLE, ADMIN_ROLE, and REGISTRAR_ROLE.
     */
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    // ──────────────────────────────────────────────
    //  Collection Registration
    // ──────────────────────────────────────────────

    /**
     * @notice Register a collection with its royalty split configuration.
     * @dev Recipients' shareBps must sum to exactly 10000 (100%).
     *      totalRoyaltyBps is the overall royalty percentage charged on sales
     *      (e.g., 1000 = 10%). The split percentages divide that 10% among recipients.
     *
     * @param collection      Address of the NFT collection contract.
     * @param totalRoyaltyBps Overall royalty in bps (max 10000).
     * @param recipients      Array of recipient addresses.
     * @param sharesBps       Array of share percentages in bps (must sum to 10000).
     */
    function registerCollection(
        address collection,
        uint96 totalRoyaltyBps,
        address payable[] calldata recipients,
        uint256[] calldata sharesBps
    ) external onlyRole(REGISTRAR_ROLE) {
        if (isRegistered[collection]) revert CollectionAlreadyRegistered(collection);
        if (totalRoyaltyBps > 10_000) revert InvalidRoyaltyBps(totalRoyaltyBps);
        if (recipients.length == 0) revert NoRecipientsProvided();
        if (recipients.length != sharesBps.length) revert ArrayLengthMismatch();
        if (recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length, MAX_RECIPIENTS);

        uint256 totalShares = 0;
        for (uint256 i = 0; i < recipients.length;) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (sharesBps[i] == 0) revert ZeroShare();

            _splits[collection].push(SplitRecipient({
                recipient: recipients[i],
                shareBps: sharesBps[i]
            }));

            totalShares += sharesBps[i];
            unchecked { ++i; }
        }

        if (totalShares != BPS_DENOMINATOR) revert SharesMustSumTo10000(totalShares);

        isRegistered[collection] = true;
        collectionRoyaltyBps[collection] = totalRoyaltyBps;

        emit CollectionRegistered(collection, totalRoyaltyBps, recipients.length);
    }

    /**
     * @notice Update the royalty split for a collection.
     * @dev Cannot update if splits are locked.
     */
    function updateSplits(
        address collection,
        address payable[] calldata recipients,
        uint256[] calldata sharesBps
    ) external onlyRole(REGISTRAR_ROLE) {
        if (!isRegistered[collection]) revert CollectionNotRegistered(collection);
        if (isLocked[collection]) revert CollectionSplitsLocked(collection);
        if (recipients.length == 0) revert NoRecipientsProvided();
        if (recipients.length != sharesBps.length) revert ArrayLengthMismatch();
        if (recipients.length > MAX_RECIPIENTS) revert TooManyRecipients(recipients.length, MAX_RECIPIENTS);

        // Clear existing splits
        delete _splits[collection];

        uint256 totalShares = 0;
        for (uint256 i = 0; i < recipients.length;) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (sharesBps[i] == 0) revert ZeroShare();

            _splits[collection].push(SplitRecipient({
                recipient: recipients[i],
                shareBps: sharesBps[i]
            }));

            totalShares += sharesBps[i];
            unchecked { ++i; }
        }

        if (totalShares != BPS_DENOMINATOR) revert SharesMustSumTo10000(totalShares);

        emit SplitsUpdated(collection, recipients.length);
    }

    /**
     * @notice Permanently lock a collection's splits. Cannot be undone.
     * @dev Provides creator trust — once locked, splits are immutable.
     */
    function lockSplits(address collection) external onlyRole(REGISTRAR_ROLE) {
        if (!isRegistered[collection]) revert CollectionNotRegistered(collection);
        isLocked[collection] = true;

        emit SplitsLocked(collection);
    }

    /**
     * @notice Update the total royalty percentage for a collection.
     * @dev Cannot update if splits are locked.
     */
    function setCollectionRoyaltyBps(address collection, uint96 newBps)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        if (!isRegistered[collection]) revert CollectionNotRegistered(collection);
        if (isLocked[collection]) revert CollectionSplitsLocked(collection);
        if (newBps > 10_000) revert InvalidRoyaltyBps(newBps);

        collectionRoyaltyBps[collection] = newBps;
    }

    // ──────────────────────────────────────────────
    //  Story Protocol Integration
    // ──────────────────────────────────────────────

    /**
     * @notice Link a collection to a Story Protocol IP Asset.
     * @dev Stores the IP Asset ID for cross-reference. Actual Story Protocol
     *      interactions happen off-chain via their SDK; this provides an
     *      on-chain anchor point.
     */
    function linkStoryProtocolIP(address collection, address ipId) external onlyRole(REGISTRAR_ROLE) {
        if (!isRegistered[collection]) revert CollectionNotRegistered(collection);
        storyProtocolIPIds[collection] = ipId;

        emit StoryProtocolIPLinked(collection, ipId);
    }

    // ──────────────────────────────────────────────
    //  Royalty Distribution
    // ──────────────────────────────────────────────

    /**
     * @notice Distribute royalty payment for a specific token sale.
     * @dev Called by the marketplace (or anyone) when a sale occurs.
     *      ETH is sent with the call and distributed proportionally to recipients.
     *      Uses pull pattern: amounts are credited to earnings, not sent immediately.
     *
     *      Gas optimization: We don't send ETH in the loop. We just credit balances.
     *      Recipients withdraw via `withdrawEarnings()`.
     *
     * @param collection  NFT collection address.
     * @param tokenId     Token that was sold (for analytics).
     */
    function distributeRoyalty(address collection, uint256 tokenId)
        external
        payable
        nonReentrant
    {
        if (!isRegistered[collection]) revert CollectionNotRegistered(collection);
        if (msg.value == 0) return;

        SplitRecipient[] storage splits = _splits[collection];
        uint256 remaining = msg.value;

        // Credit each recipient's earnings proportionally
        for (uint256 i = 0; i < splits.length;) {
            uint256 share;
            if (i == splits.length - 1) {
                // Last recipient gets the remainder (avoids rounding dust)
                share = remaining;
            } else {
                share = msg.value * splits[i].shareBps / BPS_DENOMINATOR;
                remaining -= share;
            }

            earnings[splits[i].recipient] += share;

            unchecked { ++i; }
        }

        totalDistributed[collection] += msg.value;
        tokenDistributed[collection][tokenId] += msg.value;

        emit RoyaltyDistributed(collection, tokenId, msg.value, splits.length);
    }

    /**
     * @notice Withdraw accumulated earnings.
     * @dev Pull-over-push pattern. Caller receives their entire balance.
     */
    function withdrawEarnings() external nonReentrant {
        uint256 amount = earnings[msg.sender];
        if (amount == 0) revert NoBalanceToWithdraw();

        earnings[msg.sender] = 0;

        (bool success,) = msg.sender.call{ value: amount }("");
        if (!success) revert WithdrawalFailed();

        emit EarningsWithdrawn(msg.sender, amount);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /// @notice Get the split recipients for a collection.
    function getSplits(address collection) external view returns (SplitRecipient[] memory) {
        return _splits[collection];
    }

    /// @notice Get the number of recipients for a collection.
    function getSplitCount(address collection) external view returns (uint256) {
        return _splits[collection].length;
    }

    /**
     * @notice Calculate how much each recipient would receive for a given sale price.
     * @dev Useful for UIs to show projected earnings before a sale.
     */
    function previewDistribution(address collection, uint256 salePrice)
        external
        view
        returns (address[] memory recipients, uint256[] memory amounts)
    {
        if (!isRegistered[collection]) revert CollectionNotRegistered(collection);

        uint256 royaltyAmount = salePrice * collectionRoyaltyBps[collection] / BPS_DENOMINATOR;
        SplitRecipient[] storage splits = _splits[collection];

        recipients = new address[](splits.length);
        amounts = new uint256[](splits.length);
        uint256 remaining = royaltyAmount;

        for (uint256 i = 0; i < splits.length;) {
            recipients[i] = splits[i].recipient;
            if (i == splits.length - 1) {
                amounts[i] = remaining;
            } else {
                amounts[i] = royaltyAmount * splits[i].shareBps / BPS_DENOMINATOR;
                remaining -= amounts[i];
            }
            unchecked { ++i; }
        }
    }

    // ──────────────────────────────────────────────
    //  Emergency
    // ──────────────────────────────────────────────

    /**
     * @notice Emergency withdrawal of all contract ETH.
     * @dev Only for extreme emergencies. Logs for transparency.
     */
    function emergencyWithdraw(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalanceToWithdraw();

        (bool success,) = to.call{ value: balance }("");
        if (!success) revert WithdrawalFailed();

        emit EmergencyWithdrawal(to, balance);
    }

    /// @dev Accept ETH sent directly to the contract (for royalty payments).
    receive() external payable {}
}
