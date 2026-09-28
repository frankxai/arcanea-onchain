// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { ArcaneaNFT } from "../src/ArcaneaNFT.sol";
import { ArcaneaMarketplace } from "../src/ArcaneaMarketplace.sol";

contract ArcaneaMarketplaceTest is Test {
    ArcaneaNFT internal nft;
    ArcaneaMarketplace internal market;

    address internal admin = makeAddr("admin");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal royaltyReceiver = makeAddr("royaltyReceiver");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal bidder2 = makeAddr("bidder2");

    uint256 internal tokenId;

    function setUp() public {
        vm.warp(1_700_000_000);
        nft = new ArcaneaNFT("Arcanea", "ARC", 0, 0, royaltyReceiver, 500, admin); // 5% royalty
        market = new ArcaneaMarketplace(admin, feeRecipient); // 2.5% default platform fee

        vm.prank(admin);
        tokenId = nft.mint(
            seller,
            ArcaneaNFT.Element.Water,
            ArcaneaNFT.Guardian.Leyla,
            ArcaneaNFT.House.Aqualis,
            ArcaneaNFT.Tier.Epic,
            false
        );

        vm.prank(seller);
        nft.setApprovalForAll(address(market), true);

        vm.deal(buyer, 10 ether);
        vm.deal(bidder2, 10 ether);
    }

    function _list() internal returns (uint256 listingId) {
        vm.prank(seller);
        listingId = market.createDirectListing(address(nft), tokenId, 1 ether, 0, 0);
    }

    function _auction(uint256 reserve, uint64 end) internal returns (uint256 auctionId) {
        vm.prank(seller);
        auctionId = market.createEnglishAuction(address(nft), tokenId, reserve, 0, end);
    }

    function test_DirectListingSplitsProceeds() public {
        uint256 listingId = _list();

        vm.prank(buyer);
        market.buyDirectListing{ value: 1 ether }(listingId);

        assertEq(nft.ownerOf(tokenId), buyer);
        assertEq(feeRecipient.balance, 0.025 ether);
        assertEq(royaltyReceiver.balance, 0.05 ether);
        assertEq(seller.balance, 0.925 ether);
    }

    function test_DirectListingRefundsOverpayment() public {
        uint256 listingId = _list();

        vm.prank(buyer);
        market.buyDirectListing{ value: 1.5 ether }(listingId);

        assertEq(buyer.balance, 9 ether);
    }

    function test_DirectListingRejectsUnderpayment() public {
        uint256 listingId = _list();

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaMarketplace.InsufficientPayment.selector, 1 ether, 0.5 ether));
        market.buyDirectListing{ value: 0.5 ether }(listingId);
    }

    function test_CancelledListingCannotBeBought() public {
        uint256 listingId = _list();

        vm.prank(seller);
        market.cancelDirectListing(listingId);

        vm.prank(buyer);
        vm.expectRevert(ArcaneaMarketplace.ListingNotActive.selector);
        market.buyDirectListing{ value: 1 ether }(listingId);
    }

    function test_OnlySellerCanCancelListing() public {
        uint256 listingId = _list();

        vm.prank(buyer);
        vm.expectRevert(ArcaneaMarketplace.NotSeller.selector);
        market.cancelDirectListing(listingId);
    }

    function test_EnglishAuctionOutbidRefundsAndSettles() public {
        uint256 auctionId = _auction(1 ether, uint64(block.timestamp + 1 days));
        assertEq(nft.ownerOf(tokenId), address(market));

        vm.prank(buyer);
        market.placeBid{ value: 1 ether }(auctionId);

        // A new bid must beat the previous one by at least 5%.
        vm.prank(bidder2);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaMarketplace.BidTooLow.selector, 1.05 ether, 1.01 ether));
        market.placeBid{ value: 1.01 ether }(auctionId);

        vm.prank(bidder2);
        market.placeBid{ value: 2 ether }(auctionId);
        assertEq(market.pendingWithdrawals(buyer), 1 ether, "outbid bid credited as a pull refund");

        vm.prank(buyer);
        market.withdrawPending();
        assertEq(buyer.balance, 10 ether, "outbid bidder refunded");

        vm.warp(block.timestamp + 1 days + 1);
        market.settleEnglishAuction(auctionId);

        assertEq(nft.ownerOf(tokenId), bidder2);
        assertEq(feeRecipient.balance, 0.05 ether);
        assertEq(royaltyReceiver.balance, 0.1 ether);
        assertEq(seller.balance, 1.85 ether);
    }

    function test_EnglishAuctionWithoutBidsReturnsToken() public {
        uint256 auctionId = _auction(1 ether, uint64(block.timestamp + 1 days));

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ArcaneaMarketplace.BidTooLow.selector, 1 ether, 0.5 ether));
        market.placeBid{ value: 0.5 ether }(auctionId);

        vm.warp(block.timestamp + 1 days + 1);
        market.settleEnglishAuction(auctionId);
        assertEq(nft.ownerOf(tokenId), seller);
    }

    function test_CannotSettleBeforeEnd() public {
        uint256 auctionId = _auction(0, uint64(block.timestamp + 1 days));

        vm.expectRevert(ArcaneaMarketplace.AuctionNotEnded.selector);
        market.settleEnglishAuction(auctionId);
    }

    function test_SellerCannotBidOnOwnAuction() public {
        uint256 auctionId = _auction(0, uint64(block.timestamp + 1 days));

        vm.deal(seller, 1 ether);
        vm.prank(seller);
        vm.expectRevert(ArcaneaMarketplace.CannotBidOnOwnAuction.selector);
        market.placeBid{ value: 1 ether }(auctionId);
    }

    function test_PlatformFeeChangeRequiresAdmin() public {
        bytes32 adminRole = market.ADMIN_ROLE();
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, buyer, adminRole)
        );
        market.setPlatformFee(100);

        vm.prank(admin);
        market.setPlatformFee(100);
        assertEq(market.platformFeeBps(), 100);
    }

    // ── M4: settlement must not depend on the winner's receiver callback ──

    function test_M4_WinnerWithRevertingReceiverCannotBlockSettlement() public {
        uint256 auctionId = _auction(1 ether, uint64(block.timestamp + 1 days));

        RevertingReceiverBidder winner = new RevertingReceiverBidder(market);
        vm.deal(address(winner), 2 ether);
        winner.bid(auctionId, 2 ether);

        vm.warp(block.timestamp + 1 days + 1);
        market.settleEnglishAuction(auctionId);

        assertEq(nft.ownerOf(tokenId), address(winner), "winner receives the NFT");
        assertEq(seller.balance, 1.85 ether, "seller is paid");
    }

    // ── M5: refunds are pull-based; emergencyWithdraw cannot take escrow ──

    /// Pre-fix, placeBid pushed the refund to the previous bidder with all gas.
    /// A bidder contract that burns gas in receive() made every later bid run
    /// out of gas, freezing the auction on its own (low) bid.
    function test_M5_GasGriefingBidderCannotBlockOutbid() public {
        uint256 auctionId = _auction(1 ether, uint64(block.timestamp + 1 days));

        GasGriefingBidder griefer = new GasGriefingBidder(market);
        vm.deal(address(griefer), 1 ether);
        griefer.bid(auctionId, 1 ether);

        vm.prank(bidder2);
        market.placeBid{ value: 2 ether, gas: 300_000 }(auctionId);

        (,,,,, uint256 highestBid, address highestBidder,,,) = market.englishAuctions(auctionId);
        assertEq(highestBidder, bidder2);
        assertEq(highestBid, 2 ether);
        assertEq(market.pendingWithdrawals(address(griefer)), 1 ether, "refund is claimable, not pushed");
    }

    function test_M5_EmergencyWithdrawCannotTakeEscrowedBidsOffersOrPending() public {
        uint256 auctionId = _auction(1 ether, uint64(block.timestamp + 1 days));
        vm.prank(buyer);
        market.placeBid{ value: 1 ether }(auctionId);
        vm.prank(bidder2);
        market.placeBid{ value: 2 ether }(auctionId); // buyer now has a 1 ether pull refund

        vm.prank(buyer);
        market.createOffer{ value: 0.5 ether }(address(nft), 999, uint64(block.timestamp + 1 days));

        // 1 ether of stray (force-sent) ETH that belongs to nobody.
        vm.deal(address(market), address(market).balance + 1 ether);

        address payable treasury = payable(makeAddr("treasury"));
        vm.prank(admin);
        market.emergencyWithdraw(treasury);

        assertEq(treasury.balance, 1 ether, "only surplus is withdrawable");
        assertEq(address(market).balance, 3.5 ether, "bids, offers and pending refunds remain");

        // Users can still get every wei back.
        vm.prank(buyer);
        market.withdrawPending();
        vm.prank(buyer);
        market.cancelOffer(1);
        vm.warp(block.timestamp + 1 days + 1);
        market.settleEnglishAuction(auctionId);
        assertEq(address(market).balance, 0, "every escrowed wei was paid out");
    }

    function test_M5_EmergencyWithdrawRevertsWhenOnlyEscrowIsHeld() public {
        vm.prank(buyer);
        market.createOffer{ value: 1 ether }(address(nft), tokenId, uint64(block.timestamp + 1 days));

        vm.prank(admin);
        vm.expectRevert(ArcaneaMarketplace.NoBalanceToWithdraw.selector);
        market.emergencyWithdraw(payable(admin));
    }
}

/// @dev Bids from a contract whose ERC-721 receiver hook always reverts.
contract RevertingReceiverBidder {
    ArcaneaMarketplace internal immutable market;

    constructor(ArcaneaMarketplace market_) {
        market = market_;
    }

    function bid(uint256 auctionId, uint256 amount) external {
        market.placeBid{ value: amount }(auctionId);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("no NFTs, thanks");
    }

    receive() external payable { }
}

/// @dev Bids, then burns all forwarded gas whenever it is sent ETH.
contract GasGriefingBidder {
    ArcaneaMarketplace internal immutable market;

    constructor(ArcaneaMarketplace market_) {
        market = market_;
    }

    function bid(uint256 auctionId, uint256 amount) external {
        market.placeBid{ value: amount }(auctionId);
    }

    receive() external payable {
        while (true) { }
    }
}
