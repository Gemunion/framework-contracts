// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { Asset } from "../../../Exchange/lib/interfaces/IAsset.sol";
import { ITokenValidationErrors } from "../../../Exchange/interfaces/ITokenValidationErrors.sol";
import { VestingBoxConfig, FunctionType } from "../../../Mechanics/Vesting/VestingLibrary.sol";
import { IERC721BoxErrors } from "../../../ERC721/interfaces/IERC721BoxErrors.sol";
import { IERC721VestingErrors } from "./IERC721VestingErrors.sol";

interface IERC721Vesting is IERC721VestingErrors, IERC721BoxErrors, ITokenValidationErrors {
    function mintBox(address receiver, uint256 templateId, Asset[] memory content, VestingBoxConfig calldata boxConfig) external payable returns (uint256 tokenId);
    function expand(uint256 tokenId, Asset[] calldata additionalContent) external payable;
}
