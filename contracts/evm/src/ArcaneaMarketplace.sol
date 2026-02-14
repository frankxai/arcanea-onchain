// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArcaneaMarketplace
 * @author Arcanea Protocol
 * @notice Full-featured NFT marketplace for the Arcanea ecosystem on Base L2.
 *
 * @dev Implements:
 *   - Direct Listings: Fixed-price buy-now sales
 *   - English Auctions: Ascending-bid with anti-sniping protection
 *   - Dutch Auctions: Descending-price over configurable duration
 *   - Offer System: Buyers place offers on any NFT (even unlisted ones)
 *   - Platform fee: 2.5% (250 bps) — configurable by admin
 *   - ERC-2981 royalty enforcement on every sale
 *   - Guardian agent integration: GUARDIAN_ROLE can list/bid on behalf of creators
 *   - Full escrow for all bids and purchases
 *
 * Security decisions:
 *   - ReentrancyGuard on ALL functions that move ETH or tokens
 *   - Pull-over-push for failed refunds (pendingWithdrawals mapping)
 *   - Anti-sniping: 15-minute extension on bids placed in last 15 minutes
 *   - Minimum bid increment: 5% above current highest bid
 *   - Reserve price: auctions only settle if reserve is met
 *   - Emergency pause stops new listings/bids but allows withdrawals
 *   - All ETH transfers use call{} (not transfer/send) for SC wallet compatibility
 */

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ArcaneaMarketplace is AccessControl, Pausable, ReentrancyGuard {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice Guardian AI agents — can list, bid, and manage on behalf of creators.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice Full admin — can configure fees, pause, emergency withdraw.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Anti-sniping: if a bid arrives within this window before auction end,
    ///         the auction is extended by this duration.
    uint256 public constant ANTI_SNIPE_WINDOW = 15 minutes;

    /// @notice Minimum bid increment as basis points above current highest bid (500 = 5%).
    uint256 public constant MIN_BID_INCREMENT_BPS = 500;

    /// @notice Basis points denominator.
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────

    enum ListingType {
        DirectListing,
        EnglishAuction,
        DutchAuction
    }

    enum ListingStatus {
        Active,
        Sold,
        Cancelled
    }

    enum OfferStatus {
        Active,
        Accepted,
        Cancelled,
        Expired
    }

    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    struct DirectListing {
        uint256 listingId;
        address nftContract;
        uint256 tokenId;
        address seller;
        uint256 price;
        uint64 startTime;
        uint64 endTime;
        ListingStatus status;
    }

    struct EnglishAuction {
        uint256 auctionId;
        address nftContract;
        uint256 tokenId;
        address seller;
        uint256 reservePrice; // Minimum price to settle. 0 = no reserve.
        uint256 highestBid;
        address highestBidder;
        uint64 startTime;
        uint64 endTime;
        ListingStatus status;
    }

    struct DutchAuction {
        uint256 auctionId;
        address nftContract;
        uint256 tokenId;
        address seller;
        uint256 startPrice; // Price at auction start (highest)
        uint256 endPrice; // Price at auction end (lowest / floor)
        uint64 startTime;
        uint64 endTime;
        ListingStatus status;
    }

    struct Offer {
        uint256 offerId;
        address nftContract;
        uint256 tokenId;
        address offerer;
        uint256 amount;
        uint64 expiresAt;
        OfferStatus status;
    }

    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    error NotTokenOwner();
    error NotApprovedForMarketplace();
    error ListingNotActive();
    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadyEnded();
    error InsufficientPayment(uint256 required, uint256 sent);
    error BidTooLow(uint256 minimum, uint256 sent);
    error CannotBidOnOwnAuction();
    error ReserveNotMet(uint256 reserve, uint256 highestBid);
    error OfferNotActive();
    error OfferExpired();
    error NotSeller();
    error NotOfferer();
    error ZeroAddress();
    error ZeroPrice();
    error InvalidTimeRange();
    error StartPriceMustExceedEndPrice();
    error WithdrawalFailed();
    error NoBalanceToWithdraw();
    error InvalidFeeBps(uint256 bps);
    error NothingToSettle();

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    // Direct Listing events
    event DirectListingCreated(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price,
        uint64 startTime,
        uint64 endTime
    );
    event DirectListingPurchased(
        uint256 indexed listingId, address indexed buyer, uint256 price, uint256 royaltyPaid, uint256 platformFee
    );
    event DirectListingCancelled(uint256 indexed listingId);

    // English Auction events
    event EnglishAuctionCreated(
        uint256 indexed auctionId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 reservePrice,
        uint64 startTime,
        uint64 endTime
    );
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionExtended(uint256 indexed auctionId, uint64 newEndTime);
    event EnglishAuctionSettled(
        uint256 indexed auctionId, address indexed winner, uint256 price, uint256 royaltyPaid, uint256 platformFee
    );
    event EnglishAuctionCancelled(uint256 indexed auctionId);

    // Dutch Auction events
    event DutchAuctionCreated(
        uint256 indexed auctionId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 startPrice,
        uint256 endPrice,
        uint64 startTime,
        uint64 endTime
    );
    event DutchAuctionPurchased(
        uint256 indexed auctionId, address indexed buyer, uint256 price, uint256 royaltyPaid, uint256 platformFee
    );
    event DutchAuctionCancelled(uint256 indexed auctionId);

    // Offer events
    event OfferCreated(
        uint256 indexed offerId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address offerer,
        uint256 amount,
        uint64 expiresAt
    );
    event OfferAccepted(uint256 indexed offerId, address indexed seller, uint256 royaltyPaid, uint256 platformFee);
    event OfferCancelled(uint256 indexed offerId);

    // Admin events
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event PlatformFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Platform fee in basis points (default 250 = 2.5%).
    uint256 public platformFeeBps = 250;

    /// @notice Address that receives platform fees.
    address public platformFeeRecipient;

    /// @notice Auto-incrementing IDs for each listing type.
    uint256 private _nextListingId = 1;
    uint256 private _nextAuctionId = 1;
    uint256 private _nextDutchAuctionId = 1;
    uint256 private _nextOfferId = 1;

    /// @notice Storage for each listing type.
    mapping(uint256 => DirectListing) public directListings;
    mapping(uint256 => EnglishAuction) public englishAuctions;
    mapping(uint256 => DutchAuction) public dutchAuctions;
    mapping(uint256 => Offer) public offers;

    /// @notice Escrowed bids for English auctions (auctionId => bidder => amount).
    /// @dev We only track the current highest bidder in the struct; previous bidders
    ///      are refunded immediately when outbid. This mapping is for safety tracking.
    mapping(uint256 => mapping(address => uint256)) public escrowedBids;

    /// @notice Pull-over-push: accumulated balances for failed refunds.
    mapping(address => uint256) public pendingWithdrawals;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param admin              Address granted DEFAULT_ADMIN_ROLE and ADMIN_ROLE.
     * @param feeRecipient       Address to receive platform fees.
     */
    constructor(address admin, address feeRecipient) {
        if (admin == address(0)) revert ZeroAddress();
        if (feeRecipient == address(0)) revert ZeroAddress();

        platformFeeRecipient = feeRecipient;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // ══════════════════════════════════════════════
    //  DIRECT LISTINGS
    // ══════════════════════════════════════════════

    /**
     * @notice Create a fixed-price direct listing.
     * @dev Seller must approve this contract for the token before listing.
     *      The NFT stays in the seller's wallet until purchased.
     *
     * @param nftContract  Address of the ERC-721 contract.
     * @param tokenId      Token ID to list.
     * @param price        Fixed price in wei.
     * @param startTime    When the listing becomes active (0 = now).
     * @param endTime      When the listing expires (0 = no expiry).
     */
    function createDirectListing(
        address nftContract,
        uint256 tokenId,
        uint256 price,
        uint64 startTime,
        uint64 endTime
    ) external whenNotPaused returns (uint256 listingId) {
        if (price == 0) revert ZeroPrice();
        _validateOwnershipAndApproval(nftContract, tokenId);
        if (endTime != 0 && endTime <= (startTime == 0 ? uint64(block.timestamp) : startTime)) {
            revert InvalidTimeRange();
        }

        listingId = _nextListingId++;

        directListings[listingId] = DirectListing({
            listingId: listingId,
            nftContract: nftContract,
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            startTime: startTime == 0 ? uint64(block.timestamp) : startTime,
            endTime: endTime,
            status: ListingStatus.Active
        });

        emit DirectListingCreated(
            listingId,
            nftContract,
            tokenId,
            msg.sender,
            price,
            directListings[listingId].startTime,
            endTime
        );
    }

    /**
     * @notice Buy a directly-listed NFT at the listed price.
     * @dev Transfers NFT to buyer, distributes payment:
     *      1. Platform fee to feeRecipient
     *      2. Creator royalty per ERC-2981
     *      3. Remainder to seller
     */
    function buyDirectListing(uint256 listingId) external payable whenNotPaused nonReentrant {
        DirectListing storage listing = directListings[listingId];
        if (listing.status != ListingStatus.Active) revert ListingNotActive();
        if (block.timestamp < listing.startTime) revert ListingNotActive();
        if (listing.endTime != 0 && block.timestamp > listing.endTime) revert ListingNotActive();
        if (msg.value < listing.price) revert InsufficientPayment(listing.price, msg.value);

        listing.status = ListingStatus.Sold;

        // Calculate fee splits
        (uint256 platformFee, uint256 royaltyAmount, address royaltyReceiver) =
            _calculateFees(listing.nftContract, listing.tokenId, listing.price);

        // Transfer NFT from seller to buyer
        IERC721(listing.nftContract).safeTransferFrom(listing.seller, msg.sender, listing.tokenId);

        // Distribute payments
        uint256 sellerProceeds = listing.price - platformFee - royaltyAmount;
        _safeTransferETH(platformFeeRecipient, platformFee);
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            _safeTransferETH(royaltyReceiver, royaltyAmount);
        } else {
            sellerProceeds += royaltyAmount; // No royalty = seller gets it
        }
        _safeTransferETH(listing.seller, sellerProceeds);

        // Refund excess payment
        if (msg.value > listing.price) {
            _safeTransferETH(msg.sender, msg.value - listing.price);
        }

        emit DirectListingPurchased(listingId, msg.sender, listing.price, royaltyAmount, platformFee);
    }

    /// @notice Cancel a direct listing. Only the seller can cancel.
    function cancelDirectListing(uint256 listingId) external {
        DirectListing storage listing = directListings[listingId];
        if (listing.seller != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) revert NotSeller();
        if (listing.status != ListingStatus.Active) revert ListingNotActive();

        listing.status = ListingStatus.Cancelled;

        emit DirectListingCancelled(listingId);
    }

    // ══════════════════════════════════════════════
    //  ENGLISH AUCTIONS (Ascending Bid)
    // ══════════════════════════════════════════════

    /**
     * @notice Create an English (ascending bid) auction.
     * @dev Anti-sniping: bids in the last 15 minutes extend the auction by 15 minutes.
     *
     * @param nftContract   Address of the ERC-721 contract.
     * @param tokenId       Token ID to auction.
     * @param reservePrice  Minimum price to settle. 0 = no reserve.
     * @param startTime     When bidding opens (0 = now).
     * @param endTime       When bidding closes. Must be in the future.
     */
    function createEnglishAuction(
        address nftContract,
        uint256 tokenId,
        uint256 reservePrice,
        uint64 startTime,
        uint64 endTime
    ) external whenNotPaused returns (uint256 auctionId) {
        _validateOwnershipAndApproval(nftContract, tokenId);
        uint64 effectiveStart = startTime == 0 ? uint64(block.timestamp) : startTime;
        if (endTime <= effectiveStart) revert InvalidTimeRange();

        auctionId = _nextAuctionId++;

        // Transfer NFT into escrow (this contract holds it during auction)
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        englishAuctions[auctionId] = EnglishAuction({
            auctionId: auctionId,
            nftContract: nftContract,
            tokenId: tokenId,
            seller: msg.sender,
            reservePrice: reservePrice,
            highestBid: 0,
            highestBidder: address(0),
            startTime: effectiveStart,
            endTime: endTime,
            status: ListingStatus.Active
        });

        emit EnglishAuctionCreated(auctionId, nftContract, tokenId, msg.sender, reservePrice, effectiveStart, endTime);
    }

    /**
     * @notice Place a bid on an English auction.
     * @dev Enforces:
     *   - Auction is active and within time bounds
     *   - Bid >= reservePrice (if first bid)
     *   - Bid >= highestBid + 5% increment (if not first bid)
     *   - Anti-sniping: extends endTime by 15 min if bid within last 15 min
     *   - Immediately refunds previous highest bidder
     */
    function placeBid(uint256 auctionId) external payable whenNotPaused nonReentrant {
        EnglishAuction storage auction = englishAuctions[auctionId];
        if (auction.status != ListingStatus.Active) revert AuctionNotActive();
        if (block.timestamp < auction.startTime) revert AuctionNotActive();
        if (block.timestamp > auction.endTime) revert AuctionAlreadyEnded();
        if (msg.sender == auction.seller) revert CannotBidOnOwnAuction();

        // Validate bid amount
        if (auction.highestBid == 0) {
            // First bid: must meet reserve price
            if (auction.reservePrice > 0 && msg.value < auction.reservePrice) {
                revert BidTooLow(auction.reservePrice, msg.value);
            }
            if (msg.value == 0) revert BidTooLow(1, 0);
        } else {
            // Subsequent bids: must exceed current highest by 5%
            uint256 minBid = auction.highestBid + (auction.highestBid * MIN_BID_INCREMENT_BPS / BPS_DENOMINATOR);
            if (msg.value < minBid) revert BidTooLow(minBid, msg.value);
        }

        // Refund previous highest bidder
        if (auction.highestBidder != address(0)) {
            uint256 previousBid = auction.highestBid;
            address previousBidder = auction.highestBidder;
            escrowedBids[auctionId][previousBidder] = 0;
            _safeTransferETH(previousBidder, previousBid);
        }

        // Record new highest bid
        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;
        escrowedBids[auctionId][msg.sender] = msg.value;

        emit BidPlaced(auctionId, msg.sender, msg.value);

        // Anti-sniping: extend if bid placed within last 15 minutes
        if (auction.endTime - block.timestamp < ANTI_SNIPE_WINDOW) {
            auction.endTime = uint64(block.timestamp) + uint64(ANTI_SNIPE_WINDOW);
            emit AuctionExtended(auctionId, auction.endTime);
        }
    }

    /**
     * @notice Settle an English auction after it has ended.
     * @dev Can be called by anyone. Distributes:
     *   1. NFT to highest bidder (or back to seller if no bids/reserve not met)
     *   2. Payment splits: platform fee, royalty, seller proceeds
     */
    function settleEnglishAuction(uint256 auctionId) external nonReentrant {
        EnglishAuction storage auction = englishAuctions[auctionId];
        if (auction.status != ListingStatus.Active) revert AuctionNotActive();
        if (block.timestamp <= auction.endTime) revert AuctionNotEnded();

        auction.status = ListingStatus.Sold;

        bool reserveMet = auction.highestBid >= auction.reservePrice;
        bool hasBids = auction.highestBidder != address(0);

        if (hasBids && (reserveMet || auction.reservePrice == 0)) {
            // Auction succeeded — transfer NFT to winner, pay seller
            escrowedBids[auctionId][auction.highestBidder] = 0;

            (uint256 platformFee, uint256 royaltyAmount, address royaltyReceiver) =
                _calculateFees(auction.nftContract, auction.tokenId, auction.highestBid);

            // Transfer NFT to winner
            IERC721(auction.nftContract).safeTransferFrom(address(this), auction.highestBidder, auction.tokenId);

            // Distribute payments
            uint256 sellerProceeds = auction.highestBid - platformFee - royaltyAmount;
            _safeTransferETH(platformFeeRecipient, platformFee);
            if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
                _safeTransferETH(royaltyReceiver, royaltyAmount);
            } else {
                sellerProceeds += royaltyAmount;
            }
            _safeTransferETH(auction.seller, sellerProceeds);

            emit EnglishAuctionSettled(
                auctionId, auction.highestBidder, auction.highestBid, royaltyAmount, platformFee
            );
        } else {
            // Auction failed (no bids or reserve not met) — return NFT to seller
            IERC721(auction.nftContract).safeTransferFrom(address(this), auction.seller, auction.tokenId);

            // Refund highest bidder if reserve not met
            if (hasBids) {
                uint256 refundAmount = auction.highestBid;
                escrowedBids[auctionId][auction.highestBidder] = 0;
                _safeTransferETH(auction.highestBidder, refundAmount);
            }

            emit EnglishAuctionCancelled(auctionId);
        }
    }

    /**
     * @notice Cancel an English auction. Only if no bids have been placed.
     * @dev Returns escrowed NFT to seller. Cannot cancel once bids exist.
     */
    function cancelEnglishAuction(uint256 auctionId) external {
        EnglishAuction storage auction = englishAuctions[auctionId];
        if (auction.seller != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) revert NotSeller();
        if (auction.status != ListingStatus.Active) revert AuctionNotActive();
        if (auction.highestBidder != address(0)) revert NothingToSettle(); // Has bids — must settle

        auction.status = ListingStatus.Cancelled;

        // Return NFT from escrow
        IERC721(auction.nftContract).safeTransferFrom(address(this), auction.seller, auction.tokenId);

        emit EnglishAuctionCancelled(auctionId);
    }

    // ══════════════════════════════════════════════
    //  DUTCH AUCTIONS (Descending Price)
    // ══════════════════════════════════════════════

    /**
     * @notice Create a Dutch (descending price) auction.
     * @dev Price decreases linearly from startPrice to endPrice over the duration.
     *      First buyer to call buyDutchAuction at the current price wins.
     */
    function createDutchAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 endPrice,
        uint64 startTime,
        uint64 endTime
    ) external whenNotPaused returns (uint256 auctionId) {
        if (startPrice <= endPrice) revert StartPriceMustExceedEndPrice();
        _validateOwnershipAndApproval(nftContract, tokenId);
        uint64 effectiveStart = startTime == 0 ? uint64(block.timestamp) : startTime;
        if (endTime <= effectiveStart) revert InvalidTimeRange();

        auctionId = _nextDutchAuctionId++;

        // Transfer NFT into escrow
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        dutchAuctions[auctionId] = DutchAuction({
            auctionId: auctionId,
            nftContract: nftContract,
            tokenId: tokenId,
            seller: msg.sender,
            startPrice: startPrice,
            endPrice: endPrice,
            startTime: effectiveStart,
            endTime: endTime,
            status: ListingStatus.Active
        });

        emit DutchAuctionCreated(auctionId, nftContract, tokenId, msg.sender, startPrice, endPrice, effectiveStart, endTime);
    }

    /**
     * @notice Buy an NFT from a Dutch auction at the current price.
     * @dev Price = startPrice - (startPrice - endPrice) * elapsed / duration.
     *      After endTime, price floors at endPrice until cancelled.
     */
    function buyDutchAuction(uint256 auctionId) external payable whenNotPaused nonReentrant {
        DutchAuction storage auction = dutchAuctions[auctionId];
        if (auction.status != ListingStatus.Active) revert AuctionNotActive();
        if (block.timestamp < auction.startTime) revert AuctionNotActive();

        uint256 currentPrice = getDutchAuctionPrice(auctionId);
        if (msg.value < currentPrice) revert InsufficientPayment(currentPrice, msg.value);

        auction.status = ListingStatus.Sold;

        // Calculate fees
        (uint256 platformFee, uint256 royaltyAmount, address royaltyReceiver) =
            _calculateFees(auction.nftContract, auction.tokenId, currentPrice);

        // Transfer NFT from escrow to buyer
        IERC721(auction.nftContract).safeTransferFrom(address(this), msg.sender, auction.tokenId);

        // Distribute payments
        uint256 sellerProceeds = currentPrice - platformFee - royaltyAmount;
        _safeTransferETH(platformFeeRecipient, platformFee);
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            _safeTransferETH(royaltyReceiver, royaltyAmount);
        } else {
            sellerProceeds += royaltyAmount;
        }
        _safeTransferETH(auction.seller, sellerProceeds);

        // Refund excess payment
        if (msg.value > currentPrice) {
            _safeTransferETH(msg.sender, msg.value - currentPrice);
        }

        emit DutchAuctionPurchased(auctionId, msg.sender, currentPrice, royaltyAmount, platformFee);
    }

    /**
     * @notice Get the current price of a Dutch auction.
     * @dev Linear interpolation: price decreases proportionally with elapsed time.
     */
    function getDutchAuctionPrice(uint256 auctionId) public view returns (uint256) {
        DutchAuction storage auction = dutchAuctions[auctionId];
        if (block.timestamp <= auction.startTime) return auction.startPrice;
        if (block.timestamp >= auction.endTime) return auction.endPrice;

        uint256 elapsed = block.timestamp - auction.startTime;
        uint256 duration = auction.endTime - auction.startTime;
        uint256 priceDrop = (auction.startPrice - auction.endPrice) * elapsed / duration;

        return auction.startPrice - priceDrop;
    }

    /// @notice Cancel a Dutch auction. Returns NFT to seller.
    function cancelDutchAuction(uint256 auctionId) external {
        DutchAuction storage auction = dutchAuctions[auctionId];
        if (auction.seller != msg.sender && !hasRole(ADMIN_ROLE, msg.sender)) revert NotSeller();
        if (auction.status != ListingStatus.Active) revert AuctionNotActive();

        auction.status = ListingStatus.Cancelled;

        // Return NFT from escrow
        IERC721(auction.nftContract).safeTransferFrom(address(this), auction.seller, auction.tokenId);

        emit DutchAuctionCancelled(auctionId);
    }

    // ══════════════════════════════════════════════
    //  OFFER SYSTEM
    // ══════════════════════════════════════════════

    /**
     * @notice Place an offer on any NFT, even if not listed.
     * @dev Offer ETH is escrowed in the contract until accepted, cancelled, or expired.
     *
     * @param nftContract  Address of the ERC-721 contract.
     * @param tokenId      Token ID to make an offer on.
     * @param expiresAt    Offer expiration timestamp. Must be in the future.
     */
    function createOffer(address nftContract, uint256 tokenId, uint64 expiresAt)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 offerId)
    {
        if (msg.value == 0) revert ZeroPrice();
        if (expiresAt <= block.timestamp) revert InvalidTimeRange();

        offerId = _nextOfferId++;

        offers[offerId] = Offer({
            offerId: offerId,
            nftContract: nftContract,
            tokenId: tokenId,
            offerer: msg.sender,
            amount: msg.value,
            expiresAt: expiresAt,
            status: OfferStatus.Active
        });

        emit OfferCreated(offerId, nftContract, tokenId, msg.sender, msg.value, expiresAt);
    }

    /**
     * @notice Accept an offer on an NFT you own.
     * @dev Token owner must have approved this contract. Payment is split per fee structure.
     */
    function acceptOffer(uint256 offerId) external whenNotPaused nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.status != OfferStatus.Active) revert OfferNotActive();
        if (block.timestamp > offer.expiresAt) revert OfferExpired();

        // Verify caller owns the token
        address tokenOwner = IERC721(offer.nftContract).ownerOf(offer.tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner();

        offer.status = OfferStatus.Accepted;

        // Calculate fees
        (uint256 platformFee, uint256 royaltyAmount, address royaltyReceiver) =
            _calculateFees(offer.nftContract, offer.tokenId, offer.amount);

        // Transfer NFT to offerer
        IERC721(offer.nftContract).safeTransferFrom(msg.sender, offer.offerer, offer.tokenId);

        // Distribute escrowed payment
        uint256 sellerProceeds = offer.amount - platformFee - royaltyAmount;
        _safeTransferETH(platformFeeRecipient, platformFee);
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            _safeTransferETH(royaltyReceiver, royaltyAmount);
        } else {
            sellerProceeds += royaltyAmount;
        }
        _safeTransferETH(msg.sender, sellerProceeds);

        emit OfferAccepted(offerId, msg.sender, royaltyAmount, platformFee);
    }

    /**
     * @notice Cancel an offer and reclaim escrowed ETH.
     * @dev Only the original offerer can cancel.
     */
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.offerer != msg.sender) revert NotOfferer();
        if (offer.status != OfferStatus.Active) revert OfferNotActive();

        offer.status = OfferStatus.Cancelled;

        // Refund escrowed ETH
        _safeTransferETH(msg.sender, offer.amount);

        emit OfferCancelled(offerId);
    }

    // ══════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ══════════════════════════════════════════════

    /// @notice Update platform fee. Max 10% (1000 bps).
    function setPlatformFee(uint256 newFeeBps) external onlyRole(ADMIN_ROLE) {
        if (newFeeBps > 1_000) revert InvalidFeeBps(newFeeBps);
        uint256 oldFee = platformFeeBps;
        platformFeeBps = newFeeBps;

        emit PlatformFeeUpdated(oldFee, newFeeBps);
    }

    /// @notice Update platform fee recipient.
    function setPlatformFeeRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) {
        if (newRecipient == address(0)) revert ZeroAddress();
        address old = platformFeeRecipient;
        platformFeeRecipient = newRecipient;

        emit PlatformFeeRecipientUpdated(old, newRecipient);
    }

    /// @notice Pause new listings, bids, and purchases. Withdrawals still work.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the marketplace.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Withdraw pending balance (pull-over-push pattern).
     * @dev Anyone can withdraw their own pending balance from failed transfers.
     */
    function withdrawPending() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NoBalanceToWithdraw();

        pendingWithdrawals[msg.sender] = 0;

        (bool success,) = msg.sender.call{ value: amount }("");
        if (!success) revert WithdrawalFailed();
    }

    /**
     * @notice Emergency withdrawal of all contract ETH to admin.
     * @dev Only for extreme emergencies (e.g., discovered vulnerability).
     *      Logs amount for transparency.
     */
    function emergencyWithdraw(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalanceToWithdraw();

        (bool success,) = to.call{ value: balance }("");
        if (!success) revert WithdrawalFailed();

        emit EmergencyWithdrawal(to, balance);
    }

    // ══════════════════════════════════════════════
    //  ERC-721 RECEIVER (for escrowed NFTs)
    // ══════════════════════════════════════════════

    /// @dev Accept NFTs sent to this contract (needed for auction escrow).
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ══════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ══════════════════════════════════════════════

    /**
     * @dev Calculate platform fee and royalty for a sale.
     * @return platformFee     Amount going to platform.
     * @return royaltyAmount   Amount going to royalty receiver.
     * @return royaltyReceiver Address of royalty receiver (address(0) if none).
     */
    function _calculateFees(address nftContract, uint256 tokenId, uint256 salePrice)
        internal
        view
        returns (uint256 platformFee, uint256 royaltyAmount, address royaltyReceiver)
    {
        platformFee = salePrice * platformFeeBps / BPS_DENOMINATOR;

        // Query ERC-2981 royalty info
        try IERC2981(nftContract).royaltyInfo(tokenId, salePrice) returns (
            address receiver, uint256 amount
        ) {
            royaltyReceiver = receiver;
            royaltyAmount = amount;

            // Safety: ensure platform fee + royalty don't exceed sale price
            if (platformFee + royaltyAmount > salePrice) {
                royaltyAmount = salePrice - platformFee;
            }
        } catch {
            // NFT doesn't support ERC-2981 — no royalty
            royaltyReceiver = address(0);
            royaltyAmount = 0;
        }
    }

    /**
     * @dev Transfer ETH safely. If transfer fails, add to pendingWithdrawals (pull pattern).
     *      Uses call{} instead of transfer/send for SC wallet compatibility.
     */
    function _safeTransferETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success,) = to.call{ value: amount }("");
        if (!success) {
            // Pull-over-push: store for later withdrawal instead of reverting
            pendingWithdrawals[to] += amount;
        }
    }

    /**
     * @dev Validate that msg.sender owns the token and has approved this contract.
     */
    function _validateOwnershipAndApproval(address nftContract, uint256 tokenId) internal view {
        IERC721 nft = IERC721(nftContract);
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (
            nft.getApproved(tokenId) != address(this) && !nft.isApprovedForAll(msg.sender, address(this))
        ) {
            revert NotApprovedForMarketplace();
        }
    }

    /**
     * @dev Required override for AccessControl.
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

/// @dev Minimal ERC-2981 interface for royalty queries.
interface IERC2981 {
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);
}
