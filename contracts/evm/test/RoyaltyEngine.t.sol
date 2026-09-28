// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { RoyaltyEngine } from "../src/RoyaltyEngine.sol";

contract RoyaltyEngineTest is Test {
    RoyaltyEngine internal engine;

    address internal admin = makeAddr("admin");
    address internal collection = makeAddr("collection");
    address payable internal creator = payable(makeAddr("creator"));
    address payable internal guild = payable(makeAddr("guild"));

    function setUp() public {
        engine = new RoyaltyEngine(admin);
    }

    function _pair(uint256 a, uint256 b) internal view returns (address payable[] memory r, uint256[] memory s) {
        r = new address payable[](2);
        r[0] = creator;
        r[1] = guild;
        s = new uint256[](2);
        s[0] = a;
        s[1] = b;
    }

    function _register(uint256 creatorShare, uint256 guildShare) internal {
        (address payable[] memory r, uint256[] memory s) = _pair(creatorShare, guildShare);
        vm.prank(admin);
        engine.registerCollection(collection, 1000, r, s);
    }

    function test_RegisterRequiresSharesToSumTo10000() public {
        (address payable[] memory r, uint256[] memory s) = _pair(5000, 4000);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyEngine.SharesMustSumTo10000.selector, uint256(9000)));
        engine.registerCollection(collection, 1000, r, s);
    }

    function test_RegisterRequiresRegistrarRole() public {
        (address payable[] memory r, uint256[] memory s) = _pair(5000, 5000);
        bytes32 registrarRole = engine.REGISTRAR_ROLE();
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, creator, registrarRole)
        );
        engine.registerCollection(collection, 1000, r, s);
    }

    function test_DistributeCreditsRecipientsProportionally() public {
        _register(7000, 3000);

        engine.distributeRoyalty{ value: 1 ether }(collection, 1);

        assertEq(engine.earnings(creator), 0.7 ether);
        assertEq(engine.earnings(guild), 0.3 ether);
        assertEq(engine.totalDistributed(collection), 1 ether);
        assertEq(engine.tokenDistributed(collection, 1), 1 ether);
    }

    function test_LastRecipientReceivesRoundingDust() public {
        _register(3333, 6667);

        engine.distributeRoyalty{ value: 1 }(collection, 1);

        assertEq(engine.earnings(creator), 0);
        assertEq(engine.earnings(guild), 1);
    }

    function test_WithdrawEarningsPaysOutAndZeroes() public {
        _register(7000, 3000);
        engine.distributeRoyalty{ value: 1 ether }(collection, 1);

        vm.prank(creator);
        engine.withdrawEarnings();

        assertEq(creator.balance, 0.7 ether);
        assertEq(engine.earnings(creator), 0);

        vm.prank(creator);
        vm.expectRevert(RoyaltyEngine.NoBalanceToWithdraw.selector);
        engine.withdrawEarnings();
    }

    function test_LockedSplitsCannotBeUpdated() public {
        _register(5000, 5000);

        vm.prank(admin);
        engine.lockSplits(collection);

        address payable[] memory r = new address payable[](1);
        r[0] = creator;
        uint256[] memory s = new uint256[](1);
        s[0] = 10_000;

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyEngine.CollectionSplitsLocked.selector, collection));
        engine.updateSplits(collection, r, s);
    }

    function test_DistributeToUnregisteredCollectionReverts() public {
        vm.expectRevert(abi.encodeWithSelector(RoyaltyEngine.CollectionNotRegistered.selector, collection));
        engine.distributeRoyalty{ value: 1 ether }(collection, 1);
    }
}
