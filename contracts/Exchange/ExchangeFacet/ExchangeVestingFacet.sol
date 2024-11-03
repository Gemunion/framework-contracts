// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { MINTER_ROLE } from "@ethberry/contracts-utils/contracts/roles.sol";

import { DiamondOverride } from "../../Diamond/override/DiamondOverride.sol";
import { ExchangeUtils } from "../../Exchange/lib/ExchangeUtils.sol";
import { SignatureValidator } from "../override/SignatureValidator.sol";
import { Asset, Params, AllowedTokenTypes, TokenType } from "../lib/interfaces/IAsset.sol";
import { VestingBoxConfig, IERC721Vesting } from "../../Mechanics/Vesting/interfaces/IERC721Vesting.sol";

contract ExchangeVestingFacet is SignatureValidator, DiamondOverride {
  event PurchaseVesting(address account, uint256 externalId, Asset item, Asset[] price, Asset[] content);

  constructor() SignatureValidator() {}

  function purchaseVesting(
    Params memory params,
    Asset memory item, // NFT
    Asset[] memory price, // USDT
    Asset[] memory content, // ERC20
    VestingBoxConfig calldata boxConfig,
    bytes calldata signature
  ) external payable whenNotPaused {
    _validateParams(params);

    bytes32 config = keccak256(
      abi.encode(
        boxConfig.functionType,
        boxConfig.cliff,
        boxConfig.startTimestamp,
        boxConfig.duration,
        boxConfig.period,
        boxConfig.afterCliffBasisPoints,
        boxConfig.growthRate
      )
    );

    address signer = _recoverOneToManyToManySignature(params, item, price, content, config, signature);
    if (!_hasRole(MINTER_ROLE, signer)) {
      revert SignerMissingRole();
    }

    ExchangeUtils.spendFrom(
      price,
      _msgSender(),
      params.receiver,
      AllowedTokenTypes(true, true, false, false, false)
    );

    ExchangeUtils.spendFrom(
      content,
      params.receiver,
      address(this),
      AllowedTokenTypes(false, true, false, false, false)
    );

    uint256 length = content.length;
    for (uint256 i = 0; i < length; ) {
      Asset memory asset = content[i];
      if (asset.tokenType == TokenType.ERC20) {
        IERC20(asset.token).approve(item.token, asset.amount);
      }
      unchecked {
        i++;
      }
    }

    uint256 tokenId = IERC721Vesting(item.token).mintBox(_msgSender(), item.tokenId, content, boxConfig);

    item.tokenId = tokenId;

    emit PurchaseVesting(_msgSender(), params.externalId, item, price, content);
  }
}
