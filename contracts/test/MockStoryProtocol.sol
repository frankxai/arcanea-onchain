// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockStoryProtocol {
    mapping(address => bool) public registered;

    event MockRegistered(uint256 chainId, address tokenAddress, uint256 tokenId, address ipAsset);
    event MockLicenseAttached(address ipAsset, address licenseTemplate, uint256 termsId);

    function register(uint256 chainId, address tokenAddress, uint256 tokenId) external returns (address ipAsset) {
        ipAsset = address(uint160(uint256(keccak256(abi.encode(chainId, tokenAddress, tokenId)))));
        registered[ipAsset] = true;
        emit MockRegistered(chainId, tokenAddress, tokenId, ipAsset);
    }

    function isRegistered(address ipAsset) external view returns (bool) {
        return registered[ipAsset];
    }

    function attachLicenseTerms(address ipAsset, address licenseTemplate, uint256 termsId) external {
        require(registered[ipAsset], "not registered");
        emit MockLicenseAttached(ipAsset, licenseTemplate, termsId);
    }
}

