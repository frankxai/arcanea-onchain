// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ClawSkillLicense
 * @dev Starlight operator-pack license contract.
 *
 * ERC-1155 tokens represent software access licenses. Primary sales accrue
 * pull-based payout balances instead of pushing funds during purchase. ERC-2981
 * is a royalty signal for secondary markets; primary-sale licensing and support
 * are the core economics.
 */
contract ClawSkillLicense is ERC1155, ERC2981, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PACK_MANAGER_ROLE = keccak256("PACK_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant WITHDRAWER_ROLE = keccak256("WITHDRAWER_ROLE");

    uint16 public constant BPS_DENOMINATOR = 10_000;
    address public constant NATIVE_TOKEN = address(0);

    struct SplitBps {
        uint16 developer;
        uint16 operatorPool;
        uint16 protocol;
    }

    struct PackDetails {
        address developer;
        uint256 nativePrice;
        uint256 erc20Price;
        uint256 maxSupply;
        uint256 minted;
        bool active;
        string manifestHash;
        string termsHash;
        string version;
        SplitBps splitBps;
    }

    mapping(uint256 => PackDetails) public packs;
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;

    address public protocolTreasury;
    address public operatorPool;
    IERC20 public acceptedPaymentToken;

    event PackRegistered(
        uint256 indexed packId,
        address indexed developer,
        uint256 nativePrice,
        uint256 erc20Price,
        uint256 maxSupply,
        string manifestHash,
        string termsHash,
        string version
    );
    event LicensePurchased(
        uint256 indexed packId,
        address indexed buyer,
        uint256 quantity,
        address indexed paymentToken,
        uint256 totalPaid
    );
    event PayoutAccrued(
        uint256 indexed packId,
        address indexed paymentToken,
        address developer,
        uint256 developerShare,
        address operatorPool,
        uint256 operatorShare,
        address protocolTreasury,
        uint256 protocolShare
    );
    event Withdrawal(address indexed account, address indexed paymentToken, uint256 amount);
    event PackStatusUpdated(uint256 indexed packId, bool active);
    event PayoutWalletsUpdated(address protocolTreasury, address operatorPool);
    event AcceptedPaymentTokenUpdated(address token);

    error InvalidAddress();
    error InvalidSplit();
    error PackAlreadyExists();
    error PackNotFound();
    error PackInactive();
    error InvalidQuantity();
    error InsufficientPayment();
    error SupplyExceeded();
    error TokenPaymentNotConfigured();
    error NothingToWithdraw();
    error NativeTransferFailed();

    constructor(
        string memory uri_,
        address admin,
        address protocolTreasury_,
        address operatorPool_,
        address acceptedPaymentToken_
    ) ERC1155(uri_) {
        if (admin == address(0) || protocolTreasury_ == address(0)) revert InvalidAddress();

        protocolTreasury = protocolTreasury_;
        operatorPool = operatorPool_;
        acceptedPaymentToken = IERC20(acceptedPaymentToken_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PACK_MANAGER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(WITHDRAWER_ROLE, admin);
    }

    function registerPack(
        uint256 packId,
        address developer,
        uint256 nativePrice,
        uint256 erc20Price,
        uint256 maxSupply,
        string memory manifestHash,
        string memory termsHash,
        string memory version,
        SplitBps memory splitBps
    ) external onlyRole(PACK_MANAGER_ROLE) {
        if (developer == address(0)) revert InvalidAddress();
        if (packs[packId].developer != address(0)) revert PackAlreadyExists();
        if (splitBps.developer + splitBps.operatorPool + splitBps.protocol != BPS_DENOMINATOR) {
            revert InvalidSplit();
        }

        packs[packId] = PackDetails({
            developer: developer,
            nativePrice: nativePrice,
            erc20Price: erc20Price,
            maxSupply: maxSupply,
            minted: 0,
            active: true,
            manifestHash: manifestHash,
            termsHash: termsHash,
            version: version,
            splitBps: splitBps
        });

        emit PackRegistered(packId, developer, nativePrice, erc20Price, maxSupply, manifestHash, termsHash, version);
    }

    function purchaseLicense(uint256 packId, uint256 quantity) external payable nonReentrant whenNotPaused {
        PackDetails storage pack = _requirePurchasablePack(packId, quantity);
        uint256 expected = pack.nativePrice * quantity;
        if (msg.value < expected) revert InsufficientPayment();

        pack.minted += quantity;
        _mint(msg.sender, packId, quantity, "");
        _accrue(packId, NATIVE_TOKEN, expected, pack);

        uint256 refund = msg.value - expected;
        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert NativeTransferFailed();
        }

        emit LicensePurchased(packId, msg.sender, quantity, NATIVE_TOKEN, expected);
    }

    function purchaseLicenseWithToken(uint256 packId, uint256 quantity) external nonReentrant whenNotPaused {
        if (address(acceptedPaymentToken) == address(0)) revert TokenPaymentNotConfigured();
        PackDetails storage pack = _requirePurchasablePack(packId, quantity);
        uint256 total = pack.erc20Price * quantity;
        if (total == 0) revert InsufficientPayment();

        pack.minted += quantity;
        acceptedPaymentToken.safeTransferFrom(msg.sender, address(this), total);
        _mint(msg.sender, packId, quantity, "");
        _accrue(packId, address(acceptedPaymentToken), total, pack);

        emit LicensePurchased(packId, msg.sender, quantity, address(acceptedPaymentToken), total);
    }

    function withdraw(address paymentToken) external nonReentrant {
        uint256 amount = pendingWithdrawals[paymentToken][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[paymentToken][msg.sender] = 0;

        if (paymentToken == NATIVE_TOKEN) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(paymentToken).safeTransfer(msg.sender, amount);
        }

        emit Withdrawal(msg.sender, paymentToken, amount);
    }

    function setPackStatus(uint256 packId, bool active) external onlyRole(PACK_MANAGER_ROLE) {
        if (packs[packId].developer == address(0)) revert PackNotFound();
        packs[packId].active = active;
        emit PackStatusUpdated(packId, active);
    }

    function setPayoutWallets(address protocolTreasury_, address operatorPool_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (protocolTreasury_ == address(0)) revert InvalidAddress();
        protocolTreasury = protocolTreasury_;
        operatorPool = operatorPool_;
        emit PayoutWalletsUpdated(protocolTreasury_, operatorPool_);
    }

    function setAcceptedPaymentToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        acceptedPaymentToken = IERC20(token);
        emit AcceptedPaymentTokenUpdated(token);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _requirePurchasablePack(uint256 packId, uint256 quantity) private view returns (PackDetails storage pack) {
        pack = packs[packId];
        if (pack.developer == address(0)) revert PackNotFound();
        if (!pack.active) revert PackInactive();
        if (quantity == 0) revert InvalidQuantity();
        if (pack.maxSupply > 0 && pack.minted + quantity > pack.maxSupply) revert SupplyExceeded();
    }

    function _accrue(uint256 packId, address paymentToken, uint256 total, PackDetails storage pack) private {
        uint256 developerShare = (total * pack.splitBps.developer) / BPS_DENOMINATOR;
        uint256 operatorShare = (total * pack.splitBps.operatorPool) / BPS_DENOMINATOR;
        uint256 protocolShare = total - developerShare - operatorShare;

        pendingWithdrawals[paymentToken][pack.developer] += developerShare;
        if (operatorShare > 0) {
            if (operatorPool == address(0)) revert InvalidAddress();
            pendingWithdrawals[paymentToken][operatorPool] += operatorShare;
        }
        pendingWithdrawals[paymentToken][protocolTreasury] += protocolShare;

        emit PayoutAccrued(
            packId,
            paymentToken,
            pack.developer,
            developerShare,
            operatorPool,
            operatorShare,
            protocolTreasury,
            protocolShare
        );
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
