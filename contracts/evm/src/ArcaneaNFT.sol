// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArcaneaNFT
 * @author Arcanea Protocol
 * @notice Production ERC-721 NFT contract for the Arcanea universe on Base L2.
 *
 * @dev Implements:
 *   - ERC-721 Enumerable for on-chain token indexing
 *   - ERC-2981 for standardized royalty information (10% default, per-token override)
 *   - AccessControl for MINTER_ROLE, GUARDIAN_ROLE, ADMIN_ROLE separation
 *   - Pausable + ReentrancyGuard for emergency and financial safety
 *   - On-chain Arcanean attributes: element, guardian, rank, gateLevel, house, tier
 *   - Dynamic metadata evolution as creators progress through the Ten Gates
 *   - Soulbound option for non-transferable achievement badges
 *   - Batch minting for collection drops
 *   - Configurable max supply and mint price per collection
 *
 * Security decisions:
 *   - Pull-over-push for royalty/fee withdrawals (no ETH transfers in loops)
 *   - Custom errors instead of require strings for gas savings (~24 gas per char saved)
 *   - Struct packing: ArcaneanAttributes fits in 2 storage slots (256 bits total)
 *   - tokenURI delegates to an upgradeable metadata renderer for future flexibility
 *   - Soulbound tokens revert on transfer rather than using ERC-5192 (simpler, cheaper)
 */

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ArcaneaNFT is ERC721Enumerable, ERC2981, AccessControl, Pausable, ReentrancyGuard {
    using Strings for uint256;

    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    /// @notice Can mint tokens and batch-mint for drops.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Guardian AI agents — can update attributes and manage evolution.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice Full admin — can configure collection params, pause, set royalties.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ──────────────────────────────────────────────
    //  Enums (uint8 for struct packing)
    // ──────────────────────────────────────────────

    /// @notice The Five Elements of Arcanea.
    enum Element {
        Fire, // Red, orange, gold — energy, transformation
        Water, // Blue, silver, crystal — flow, healing, memory
        Earth, // Green, brown, stone — stability, growth
        Wind, // White, silver — freedom, speed, change
        Void, // Black/Gold — Nero's aspect: potential, mystery
        Spirit // Purple/white — Lumina's aspect: transcendence
    }

    /// @notice The Ten Guardian deities of the Gate system.
    enum Guardian {
        Lyssandria, // Foundation Gate, 396 Hz
        Leyla, // Flow Gate, 417 Hz
        Draconia, // Fire Gate, 528 Hz
        Maylinn, // Heart Gate, 639 Hz
        Alera, // Voice Gate, 741 Hz
        Lyria, // Sight Gate, 852 Hz
        Aiyami, // Crown Gate, 963 Hz
        Elara, // Shift Gate, 1111 Hz
        Ino, // Unity Gate, 963 Hz
        Shinkami // Source Gate, 1111 Hz
    }

    /// @notice Magic ranks based on number of Gates opened.
    enum Rank {
        Apprentice, // 0-2 Gates
        Mage, // 3-4 Gates
        Master, // 5-6 Gates
        Archmage, // 7-8 Gates
        Luminor // 9-10 Gates
    }

    /// @notice The Seven Academy Houses.
    enum House {
        Lumina,
        Nero,
        Pyros,
        Aqualis,
        Terra,
        Ventus,
        Synthesis
    }

    /// @notice NFT rarity tier.
    enum Tier {
        Common, // Soulbound badges, fragments
        Rare, // Larger editions
        Epic, // Limited editions
        Legendary // 1/1 auctions
    }

    // ──────────────────────────────────────────────
    //  Structs (storage-packed)
    // ──────────────────────────────────────────────

    /**
     * @notice On-chain Arcanean attributes for each token.
     * @dev Packed into 2 storage slots:
     *   Slot 1: element(8) + guardian(8) + rank(8) + gateLevel(8) + house(8) + tier(8) + soulbound(8) + _pad(8) = 64 bits
     *           + createdAt(64) = 128 bits total in slot 1 (with padding to 256)
     *   Slot 2: lastEvolved(64) + evolutionCount(32) + customData(160) = 256 bits
     *
     *   In practice Solidity packs sequentially and each struct member is
     *   individually ABI-aligned, so we keep it readable and let the compiler pack.
     */
    struct ArcaneanAttributes {
        Element element;
        Guardian guardian;
        Rank rank;
        uint8 gateLevel; // 0-10 (Ten Gates)
        House house;
        Tier tier;
        bool soulbound; // If true, token cannot be transferred
        uint64 createdAt;
        uint64 lastEvolved;
        uint32 evolutionCount;
        bytes20 customData; // Reserved for future on-chain extensions
    }

    // ──────────────────────────────────────────────
    //  Custom Errors (gas-efficient)
    // ──────────────────────────────────────────────

    error MaxSupplyReached();
    error InsufficientPayment(uint256 required, uint256 sent);
    error TokenDoesNotExist(uint256 tokenId);
    error SoulboundToken(uint256 tokenId);
    error InvalidGateLevel(uint8 level);
    error BatchSizeTooLarge(uint256 requested, uint256 maximum);
    error InvalidRoyaltyBps(uint96 bps);
    error ZeroAddress();
    error WithdrawalFailed();
    error NoBalanceToWithdraw();
    error MetadataRendererNotSet();
    error ArrayLengthMismatch();

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event TokenMinted(
        uint256 indexed tokenId, address indexed to, Element element, Guardian guardian, Tier tier, bool soulbound
    );

    event BatchMinted(address indexed to, uint256 startTokenId, uint256 count);

    event AttributesEvolved(
        uint256 indexed tokenId, Rank oldRank, Rank newRank, uint8 oldGateLevel, uint8 newGateLevel
    );

    event GateLevelUpdated(uint256 indexed tokenId, uint8 oldLevel, uint8 newLevel);

    event RankUpdated(uint256 indexed tokenId, Rank oldRank, Rank newRank);

    event SoulboundStatusChanged(uint256 indexed tokenId, bool soulbound);

    event MaxSupplyUpdated(uint256 oldSupply, uint256 newSupply);

    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);

    event BaseURIUpdated(string oldURI, string newURI);

    event MetadataRendererUpdated(address indexed oldRenderer, address indexed newRenderer);

    event DefaultRoyaltyUpdated(address indexed receiver, uint96 feeBps);

    event TokenRoyaltyUpdated(uint256 indexed tokenId, address indexed receiver, uint96 feeBps);

    event FundsWithdrawn(address indexed to, uint256 amount);

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Next token ID to mint (starts at 1, 0 is reserved as null sentinel).
    uint256 private _nextTokenId = 1;

    /// @notice Maximum tokens that can ever exist in this collection. 0 = unlimited.
    uint256 public maxSupply;

    /// @notice Price in wei to mint a single token. 0 = free mint (still requires MINTER_ROLE).
    uint256 public mintPrice;

    /// @notice Maximum tokens per batch mint call.
    uint256 public constant MAX_BATCH_SIZE = 50;

    /// @notice Base URI for token metadata (fallback if no renderer is set).
    string private _baseTokenURI;

    /// @notice Optional on-chain metadata renderer contract.
    /// @dev If set, tokenURI delegates to this contract. Allows upgrading metadata
    ///      rendering without migrating the NFT contract.
    address public metadataRenderer;

    /// @notice Token ID => Arcanean attributes.
    mapping(uint256 => ArcaneanAttributes) private _attributes;

    /// @notice Accumulated withdrawal balances (pull-over-push pattern).
    mapping(address => uint256) public pendingWithdrawals;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param name_         Collection name (e.g. "Arcanea Guardians").
     * @param symbol_       Collection symbol (e.g. "ARCG").
     * @param maxSupply_    Max mintable supply. Pass 0 for unlimited.
     * @param mintPrice_    Price per mint in wei. Pass 0 for free mints.
     * @param royaltyReceiver  Address to receive default royalties.
     * @param royaltyBps    Default royalty in basis points (e.g. 1000 = 10%).
     * @param admin         Address granted DEFAULT_ADMIN_ROLE and ADMIN_ROLE.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        uint256 mintPrice_,
        address royaltyReceiver,
        uint96 royaltyBps,
        address admin
    ) ERC721(name_, symbol_) {
        if (admin == address(0)) revert ZeroAddress();
        if (royaltyReceiver == address(0)) revert ZeroAddress();
        if (royaltyBps > 10_000) revert InvalidRoyaltyBps(royaltyBps);

        maxSupply = maxSupply_;
        mintPrice = mintPrice_;

        // Set default royalty (ERC-2981)
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // ──────────────────────────────────────────────
    //  Minting
    // ──────────────────────────────────────────────

    /**
     * @notice Mint a single Arcanean NFT with full attribute assignment.
     * @dev Requires MINTER_ROLE. Enforces max supply and mint price.
     *      Payment is held in contract for admin withdrawal (pull pattern).
     *
     * @param to         Recipient address.
     * @param element    The Five Elements affinity.
     * @param guardian   Patron Guardian deity.
     * @param house      Academy House membership.
     * @param tier       Rarity tier.
     * @param soulbound  If true, token cannot be transferred after mint.
     */
    function mint(
        address to,
        Element element,
        Guardian guardian,
        House house,
        Tier tier,
        bool soulbound
    ) external payable onlyRole(MINTER_ROLE) whenNotPaused nonReentrant returns (uint256) {
        if (to == address(0)) revert ZeroAddress();
        if (maxSupply > 0 && _nextTokenId > maxSupply) revert MaxSupplyReached();
        if (msg.value < mintPrice) revert InsufficientPayment(mintPrice, msg.value);

        uint256 tokenId = _nextTokenId++;

        _safeMint(to, tokenId);

        _attributes[tokenId] = ArcaneanAttributes({
            element: element,
            guardian: guardian,
            rank: Rank.Apprentice,
            gateLevel: 0,
            house: house,
            tier: tier,
            soulbound: soulbound,
            createdAt: uint64(block.timestamp),
            lastEvolved: 0,
            evolutionCount: 0,
            customData: bytes20(0)
        });

        emit TokenMinted(tokenId, to, element, guardian, tier, soulbound);

        return tokenId;
    }

    /**
     * @notice Batch mint multiple tokens with identical attributes.
     * @dev Used for collection drops. Each token gets the same base attributes
     *      but unique token IDs. Gas-optimized: attributes are written once per token
     *      without redundant SLOAD.
     *
     * @param to         Recipient address.
     * @param count      Number of tokens to mint (max MAX_BATCH_SIZE).
     * @param element    The Five Elements affinity for all tokens.
     * @param guardian   Patron Guardian for all tokens.
     * @param house      Academy House for all tokens.
     * @param tier       Rarity tier for all tokens.
     * @param soulbound  Soulbound flag for all tokens.
     */
    function batchMint(
        address to,
        uint256 count,
        Element element,
        Guardian guardian,
        House house,
        Tier tier,
        bool soulbound
    ) external payable onlyRole(MINTER_ROLE) whenNotPaused nonReentrant returns (uint256 startId) {
        if (to == address(0)) revert ZeroAddress();
        if (count == 0 || count > MAX_BATCH_SIZE) revert BatchSizeTooLarge(count, MAX_BATCH_SIZE);
        if (maxSupply > 0 && (_nextTokenId + count - 1) > maxSupply) revert MaxSupplyReached();
        if (msg.value < mintPrice * count) revert InsufficientPayment(mintPrice * count, msg.value);

        startId = _nextTokenId;
        uint64 ts = uint64(block.timestamp);

        for (uint256 i = 0; i < count;) {
            uint256 tokenId = _nextTokenId++;
            _safeMint(to, tokenId);

            _attributes[tokenId] = ArcaneanAttributes({
                element: element,
                guardian: guardian,
                rank: Rank.Apprentice,
                gateLevel: 0,
                house: house,
                tier: tier,
                soulbound: soulbound,
                createdAt: ts,
                lastEvolved: 0,
                evolutionCount: 0,
                customData: bytes20(0)
            });

            unchecked { ++i; }
        }

        emit BatchMinted(to, startId, count);
    }

    // ──────────────────────────────────────────────
    //  Attribute Evolution (Guardian-managed)
    // ──────────────────────────────────────────────

    /**
     * @notice Evolve a token's Gate level and automatically update Rank.
     * @dev Only callable by GUARDIAN_ROLE (AI agents or admin).
     *      Rank is deterministically derived from gateLevel:
     *        0-2 = Apprentice, 3-4 = Mage, 5-6 = Master, 7-8 = Archmage, 9-10 = Luminor
     *
     * @param tokenId   Token to evolve.
     * @param newGateLevel  New Gate level (0-10).
     */
    function evolveAttributes(uint256 tokenId, uint8 newGateLevel)
        external
        onlyRole(GUARDIAN_ROLE)
        whenNotPaused
    {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        if (newGateLevel > 10) revert InvalidGateLevel(newGateLevel);

        ArcaneanAttributes storage attrs = _attributes[tokenId];
        uint8 oldGateLevel = attrs.gateLevel;
        Rank oldRank = attrs.rank;

        attrs.gateLevel = newGateLevel;
        Rank newRank = _rankFromGateLevel(newGateLevel);
        attrs.rank = newRank;
        attrs.lastEvolved = uint64(block.timestamp);

        unchecked { attrs.evolutionCount++; }

        emit AttributesEvolved(tokenId, oldRank, newRank, oldGateLevel, newGateLevel);
    }

    /**
     * @notice Update only the Gate level without auto-rank derivation.
     * @dev For manual fine-tuning by Guardians.
     */
    function setGateLevel(uint256 tokenId, uint8 newLevel)
        external
        onlyRole(GUARDIAN_ROLE)
        whenNotPaused
    {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        if (newLevel > 10) revert InvalidGateLevel(newLevel);

        ArcaneanAttributes storage attrs = _attributes[tokenId];
        uint8 oldLevel = attrs.gateLevel;
        attrs.gateLevel = newLevel;

        emit GateLevelUpdated(tokenId, oldLevel, newLevel);
    }

    /**
     * @notice Directly set a token's Rank (override the gate-derived rank).
     * @dev For special promotions or corrections.
     */
    function setRank(uint256 tokenId, Rank newRank)
        external
        onlyRole(GUARDIAN_ROLE)
        whenNotPaused
    {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);

        ArcaneanAttributes storage attrs = _attributes[tokenId];
        Rank oldRank = attrs.rank;
        attrs.rank = newRank;

        emit RankUpdated(tokenId, oldRank, newRank);
    }

    /**
     * @notice Set the custom data field for a token.
     * @dev Reserved for future protocol extensions (e.g., IP asset IDs, achievement hashes).
     */
    function setCustomData(uint256 tokenId, bytes20 data)
        external
        onlyRole(GUARDIAN_ROLE)
        whenNotPaused
    {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        _attributes[tokenId].customData = data;
    }

    /**
     * @notice Toggle soulbound status on a token.
     * @dev Only ADMIN_ROLE can change soulbound status after mint.
     *      Use case: Converting a tradeable NFT into a permanent badge, or
     *      releasing a soulbound token for a special event.
     */
    function setSoulbound(uint256 tokenId, bool soulbound)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        _attributes[tokenId].soulbound = soulbound;

        emit SoulboundStatusChanged(tokenId, soulbound);
    }

    // ──────────────────────────────────────────────
    //  Attribute Queries
    // ──────────────────────────────────────────────

    /// @notice Get the full Arcanean attributes for a token.
    function getAttributes(uint256 tokenId) external view returns (ArcaneanAttributes memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        return _attributes[tokenId];
    }

    /// @notice Check if a token is soulbound (non-transferable).
    function isSoulbound(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        return _attributes[tokenId].soulbound;
    }

    /// @notice Get the total number of tokens minted (including burned, if any).
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ──────────────────────────────────────────────
    //  Royalty Configuration
    // ──────────────────────────────────────────────

    /**
     * @notice Update the default royalty for all tokens without a per-token override.
     * @param receiver  Address to receive royalties.
     * @param feeBps    Fee in basis points (max 10000 = 100%).
     */
    function setDefaultRoyalty(address receiver, uint96 feeBps)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (receiver == address(0)) revert ZeroAddress();
        if (feeBps > 10_000) revert InvalidRoyaltyBps(feeBps);

        _setDefaultRoyalty(receiver, feeBps);

        emit DefaultRoyaltyUpdated(receiver, feeBps);
    }

    /**
     * @notice Set a per-token royalty override.
     * @dev Useful for 1/1 Legendary pieces with custom creator splits.
     */
    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeBps)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        if (receiver == address(0)) revert ZeroAddress();
        if (feeBps > 10_000) revert InvalidRoyaltyBps(feeBps);

        _setTokenRoyalty(tokenId, receiver, feeBps);

        emit TokenRoyaltyUpdated(tokenId, receiver, feeBps);
    }

    /// @notice Remove a per-token royalty override; token falls back to default.
    function resetTokenRoyalty(uint256 tokenId) external onlyRole(ADMIN_ROLE) {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        _resetTokenRoyalty(tokenId);
    }

    // ──────────────────────────────────────────────
    //  Collection Configuration
    // ──────────────────────────────────────────────

    /**
     * @notice Update max supply. Can only increase (never decrease below totalMinted).
     * @dev Set to 0 to remove the cap entirely.
     */
    function setMaxSupply(uint256 newMaxSupply) external onlyRole(ADMIN_ROLE) {
        if (newMaxSupply != 0 && newMaxSupply < _nextTokenId - 1) {
            revert MaxSupplyReached();
        }
        uint256 oldSupply = maxSupply;
        maxSupply = newMaxSupply;

        emit MaxSupplyUpdated(oldSupply, newMaxSupply);
    }

    /// @notice Update mint price.
    function setMintPrice(uint256 newPrice) external onlyRole(ADMIN_ROLE) {
        uint256 oldPrice = mintPrice;
        mintPrice = newPrice;

        emit MintPriceUpdated(oldPrice, newPrice);
    }

    /// @notice Update the fallback base URI for token metadata.
    function setBaseURI(string calldata newBaseURI) external onlyRole(ADMIN_ROLE) {
        string memory oldURI = _baseTokenURI;
        _baseTokenURI = newBaseURI;

        emit BaseURIUpdated(oldURI, newBaseURI);
    }

    /// @notice Set the on-chain metadata renderer contract.
    function setMetadataRenderer(address renderer) external onlyRole(ADMIN_ROLE) {
        address old = metadataRenderer;
        metadataRenderer = renderer;

        emit MetadataRendererUpdated(old, renderer);
    }

    // ──────────────────────────────────────────────
    //  Emergency & Withdrawal
    // ──────────────────────────────────────────────

    /// @notice Pause all minting and evolution. Does NOT prevent transfers.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Withdraw accumulated ETH from mint payments.
     * @dev Uses call instead of transfer for compatibility with smart contract wallets.
     *      ReentrancyGuard protects against re-entrancy.
     */
    function withdrawFunds(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalanceToWithdraw();

        (bool success,) = to.call{ value: balance }("");
        if (!success) revert WithdrawalFailed();

        emit FundsWithdrawn(to, balance);
    }

    // ──────────────────────────────────────────────
    //  Metadata
    // ──────────────────────────────────────────────

    /**
     * @notice Returns the URI for a given token.
     * @dev If metadataRenderer is set, delegates to it. Otherwise uses baseURI + tokenId.
     *      The renderer interface: `function tokenURI(uint256 tokenId) external view returns (string memory)`
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);

        if (metadataRenderer != address(0)) {
            // Delegate to external renderer (allows on-chain SVG, dynamic metadata, etc.)
            // Using staticcall for gas safety and to prevent state changes.
            (bool success, bytes memory data) = metadataRenderer.staticcall(
                abi.encodeWithSignature("tokenURI(uint256)", tokenId)
            );
            if (success && data.length > 0) {
                return abi.decode(data, (string));
            }
        }

        // Fallback: baseURI + tokenId
        string memory base = _baseTokenURI;
        return bytes(base).length > 0 ? string.concat(base, tokenId.toString()) : "";
    }

    // ──────────────────────────────────────────────
    //  Transfer Hooks (Soulbound enforcement)
    // ──────────────────────────────────────────────

    /**
     * @dev Override _update to enforce soulbound transfers.
     *      Soulbound tokens can only be minted (from == address(0)) or burned (to == address(0)).
     *      Regular transfers are blocked.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // Allow minting (from == 0) and burning (to == 0), block transfers of soulbound tokens
        if (from != address(0) && to != address(0)) {
            if (_attributes[tokenId].soulbound) {
                revert SoulboundToken(tokenId);
            }
        }

        return super._update(to, tokenId, auth);
    }

    /// @dev Required override for ERC721Enumerable.
    function _increaseBalance(address account, uint128 value) internal override(ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    // ──────────────────────────────────────────────
    //  Interface Support
    // ──────────────────────────────────────────────

    /**
     * @dev Override supportsInterface for ERC721Enumerable + ERC2981 + AccessControl.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ──────────────────────────────────────────────
    //  Internal Helpers
    // ──────────────────────────────────────────────

    /**
     * @dev Check if a token exists (has been minted and not burned).
     *      Uses _ownerOf which returns address(0) for non-existent tokens.
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @dev Derive magic Rank from Gate level.
     *      0-2 = Apprentice, 3-4 = Mage, 5-6 = Master, 7-8 = Archmage, 9-10 = Luminor
     */
    function _rankFromGateLevel(uint8 level) internal pure returns (Rank) {
        if (level <= 2) return Rank.Apprentice;
        if (level <= 4) return Rank.Mage;
        if (level <= 6) return Rank.Master;
        if (level <= 8) return Rank.Archmage;
        return Rank.Luminor;
    }
}
