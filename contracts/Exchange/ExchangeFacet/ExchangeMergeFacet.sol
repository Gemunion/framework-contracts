// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { MINTER_ROLE } from "@ethberry/contracts-utils/contracts/roles.sol";
import { TEMPLATE_ID } from "@ethberry/contracts-utils/contracts/attributes.sol";
import { IERC721GeneralizedCollection } from "@ethberry/contracts-erc721/contracts/interfaces/IERC721GeneralizedCollection.sol";

import { SignatureValidator } from "../override/SignatureValidator.sol";

import { DiamondOverride } from "../../Diamond/override/DiamondOverride.sol";
import { ExchangeUtils } from "../../Exchange/lib/ExchangeUtils.sol";
import { Asset, Params, AllowedTokenTypes } from "../lib/interfaces/IAsset.sol";
import { IMergeErrors } from "../interfaces/IMergeErrors.sol";

contract ExchangeMergeFacet is IMergeErrors, SignatureValidator, DiamondOverride {
  event Merge(address account, uint256 externalId, Asset[] items, Asset[] price);

  constructor() SignatureValidator() {}

  function merge(
    Params memory params,
    Asset[] memory items,
    Asset[] memory price,
    bytes calldata signature
  ) external payable whenNotPaused {
    _validateParams(params);

    address signer = _recoverManyToManySignature(params, items, price, signature);
    if (!_hasRole(MINTER_ROLE, signer)) {
      revert SignerMissingRole();
    }

    uint256 expectedId = uint256(params.extra);

    uint256 length = price.length;
    for (uint256 i = 0; i < length; ) {
      Asset memory el = price[i];

      // check for same contract
      if (i > 0 && el.token != price[0].token) {
        revert MergeDifferentContracts();
      }

      if (expectedId != 0) {
        // check for token existence with correct metadata
        uint256 templateId = IERC721GeneralizedCollection(el.token).getRecordFieldValue(el.tokenId, TEMPLATE_ID);

        // check for same template
        if (templateId != expectedId) {
          revert MergeDifferentTemplate();
        }
      }

      unchecked {
        i++;
      }
    }

    ExchangeUtils.burnFrom(price, _msgSender(), AllowedTokenTypes(false, false, true, true, false));

    ExchangeUtils.acquireFrom(items, params.receiver, _msgSender(), AllowedTokenTypes(false, false, true, true, false));

    emit Merge(_msgSender(), params.externalId, items, price);
  }
}
