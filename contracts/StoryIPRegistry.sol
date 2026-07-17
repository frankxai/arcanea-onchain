// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @dev Story Protocol IPAssetRegistry minimal interface.
 */
interface IIPAssetRegistry {
    function register(
        uint256 chainId,
        address tokenAddress,
        uint256 tokenId
    ) external returns (address ipAsset);

    function isRegistered(address ipAsset) external view returns (bool);
}

/**
 * @dev Story Protocol LicensingModule minimal interface.
 */
interface ILicensingModule {
    function attachLicenseTerms(
        address ipAsset,
        address licenseTemplate,
        uint256 termsId
    ) external;
}

/**
 * @title StoryIPRegistry
 * @dev Registers World Engine narrative assets (characters, lore, items) as Programmable IP on Story Protocol.
 */
contract StoryIPRegistry is Ownable {
    // Canonical IPAssetRegistry address on Base Sepolia
    address public immutable ipAssetRegistry;
    // Canonical LicensingModule address on Base Sepolia
    address public immutable licensingModule;

    // Maps NFT contract -> tokenId -> IPAsset Address
    mapping(address => mapping(uint256 => address)) public ipAssets;

    event IPAssetRegistered(
        address indexed nftContract,
        uint256 indexed tokenId,
        address ipAssetAddress,
        string metadataURI
    );

    event LicenseAttached(
        address indexed ipAsset,
        address licenseTemplate,
        uint256 termsId
    );

    constructor(
        address _ipAssetRegistry,
        address _licensingModule
    ) Ownable(msg.sender) {
        require(_ipAssetRegistry != address(0), "Invalid IPAssetRegistry");
        require(_licensingModule != address(0), "Invalid LicensingModule");
        ipAssetRegistry = _ipAssetRegistry;
        licensingModule = _licensingModule;
    }

    /**
     * @dev Registers an NFT representing a creative asset as an IP Asset (IPA) on Story Protocol.
     * @param nftContract Address of the ERC-721 token representing the asset.
     * @param tokenId ID of the token to register.
     * @param metadataURI IPFS/Arweave URI containing the asset description and provenance data.
     */
    function registerWorldAsset(
        address nftContract,
        uint256 tokenId,
        string memory metadataURI
    ) external returns (address) {
        // Enforce that msg.sender is owner or authorized if needed.
        // For simplicity, we require that the caller holds the NFT or is approved.
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender ||
            IERC721(nftContract).isApprovedForAll(IERC721(nftContract).ownerOf(tokenId), msg.sender),
            "Not owner or approved"
        );

        address ipAsset = IIPAssetRegistry(ipAssetRegistry).register(
            block.chainid,
            nftContract,
            tokenId
        );

        ipAssets[nftContract][tokenId] = ipAsset;

        emit IPAssetRegistered(nftContract, tokenId, ipAsset, metadataURI);
        return ipAsset;
    }

    /**
     * @dev Attaches pre-registered license terms (e.g. Non-Commercial Remix) to the IP Asset.
     * @param ipAsset The address of the registered IP Asset.
     * @param licenseTemplate Address of the license template (e.g. PILTemplate).
     * @param termsId The ID of the terms to attach (e.g. commercial vs non-commercial terms).
     */
    function attachLicenseToAsset(
        address ipAsset,
        address licenseTemplate,
        uint256 termsId
    ) external {
        // Enforce registration check
        require(IIPAssetRegistry(ipAssetRegistry).isRegistered(ipAsset), "IP Asset not registered");

        ILicensingModule(licensingModule).attachLicenseTerms(
            ipAsset,
            licenseTemplate,
            termsId
        );

        emit LicenseAttached(ipAsset, licenseTemplate, termsId);
    }
}
