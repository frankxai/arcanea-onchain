// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Minimal interface for ERC-6551 Registry.
 */
interface IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenAddress,
        uint256 tokenId
    ) external returns (address);

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenAddress,
        uint256 tokenId
    ) external view returns (address);
}

/**
 * @title AgentIdentityTBA
 * @dev Certifies AI Agents / Luminors as ERC-721 NFTs and deploys their ERC-6551 Token Bound Accounts.
 */
contract AgentIdentityTBA is ERC721URIStorage, Ownable {
    // Canonical ERC-6551 Registry address
    address public immutable registry;
    // Implementation contract address for the agent's smart wallet (e.g. Safe, ZeroDev, or simple ERC6551 account proxy)
    address public implementation;

    uint256 private _nextTokenId;

    // Mapping from tokenId to its Token Bound Account address
    mapping(uint256 => address) public tokenAccounts;

    event AgentCertified(uint256 indexed tokenId, string agentName, address indexed accountAddress);
    event ImplementationUpdated(address newImplementation);

    constructor(
        address _registry,
        address _implementation
    ) ERC721("Arcanea Certified Agent", "ACA") Ownable(msg.sender) {
        require(_registry != address(0), "Invalid registry address");
        require(_implementation != address(0), "Invalid implementation address");
        registry = _registry;
        implementation = _implementation;
    }

    /**
     * @dev Updates the implementation contract for future Token Bound Accounts.
     */
    function setImplementation(address _implementation) external onlyOwner {
        require(_implementation != address(0), "Invalid implementation address");
        implementation = _implementation;
        emit ImplementationUpdated(_implementation);
    }

    /**
     * @dev Certifies an agent by minting an identity NFT and deploying its TBA wallet.
     * @param to The address of the developer or operator who owns this agent certification.
     * @param tokenURI Metadata URI containing details of the agent's skillset, gate, and elements.
     * @param agentName Human-readable name of the agent.
     */
    function certifyAgent(
        address to,
        string memory tokenURI,
        string memory agentName
    ) external onlyOwner returns (uint256, address) {
        uint256 tokenId = _nextTokenId++;
        
        // Mint identity certificate
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);

        // Compute salt and deploy ERC-6551 Account proxy via registry
        bytes32 salt = keccak256(abi.encodePacked(tokenId, block.timestamp));
        address account = IERC6551Registry(registry).createAccount(
            implementation,
            salt,
            block.chainid,
            address(this),
            tokenId
        );

        tokenAccounts[tokenId] = account;

        emit AgentCertified(tokenId, agentName, account);
        return (tokenId, account);
    }

    /**
     * @dev Query the TBA address for a given token ID without deploying it.
     */
    function getAccountAddress(uint256 tokenId, bytes32 salt) external view returns (address) {
        _requireOwned(tokenId);
        return IERC6551Registry(registry).account(
            implementation,
            salt,
            block.chainid,
            address(this),
            tokenId
        );
    }
}
