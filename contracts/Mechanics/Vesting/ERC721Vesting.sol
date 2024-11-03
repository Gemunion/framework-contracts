// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { MINTER_ROLE } from "@ethberry/contracts-utils/contracts/roles.sol";
import { TEMPLATE_ID } from "@ethberry/contracts-utils/contracts/attributes.sol";
import { CoinHolder, NativeReceiver, NativeRejector } from "@ethberry/contracts-finance/contracts/Holder.sol";

import { ERC721Simple } from "../../ERC721/ERC721Simple.sol";
import { ExchangeUtils } from "../../Exchange/lib/ExchangeUtils.sol";
import { Asset, AllowedTokenTypes, TokenType } from "../../Exchange/lib/interfaces/IAsset.sol";
import { VestingBoxConfig, IERC721Vesting } from "./interfaces/IERC721Vesting.sol";
import { VestingLibrary } from "./VestingLibrary.sol";

contract ERC721Vesting is IERC721Vesting, ERC721Simple, CoinHolder, NativeReceiver {
  mapping(uint256 => VestingBoxConfig) internal _boxConfig;
  mapping(uint256 => Asset[]) internal _itemData;
  mapping(uint256 => Asset[]) internal _withdrawnData;

  constructor(
    string memory name,
    string memory symbol,
    uint96 royalty,
    string memory baseTokenURI
  ) ERC721Simple(name, symbol, royalty, baseTokenURI) {}

  /**
   * @dev Handler for receiving Ether.
   */
  receive() external override(NativeRejector, NativeReceiver) payable {
    emit PaymentReceived(_msgSender(), msg.value);
  }

  /**
   * @dev Throws an error as this method is not supported for vesting.
   */
  function mintCommon(address, uint256) external virtual override onlyRole(MINTER_ROLE) returns (uint256) {
    revert MethodNotSupported();
  }

  /**
   * @dev Mints a new vesting box with the given template and content.
   * @param receiver The address receiving the minted token.
   * @param templateId The template ID associated with the token.
   * @param content The assets to be associated with the token.
   * @param boxConfig The configuration of the vesting box.
   * @return tokenId The ID of the minted token.
   */
  function mintBox(
    address receiver,
    uint256 templateId,
    Asset[] calldata content,
    VestingBoxConfig calldata boxConfig
  ) external payable onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
    uint256 length = content.length;
    if (length == 0) {
      revert NoContent();
    }

    if (boxConfig.startTimestamp < block.timestamp) {
      revert VestingInvalidStartTimestamp(boxConfig.startTimestamp);
    }
    if (boxConfig.afterCliffBasisPoints > 10000) {
      revert VestingInvalidAfterCliffBasisPoints(boxConfig.afterCliffBasisPoints);
    }
    if (boxConfig.period > boxConfig.duration) {
      revert VestingInvalidPeriod(boxConfig.period, boxConfig.duration);
    }

    tokenId = _mintCommon(receiver, templateId);

    _fundBox(content);

    _boxConfig[tokenId] = boxConfig;

    for (uint256 i = 0; i < content.length; ) {
      _itemData[tokenId].push(content[i]);
      _withdrawnData[tokenId].push(Asset(content[i].tokenType, content[i].token, content[i].tokenId, 0));
      unchecked {
        i++;
      }
    }

    return tokenId;
  }

  /**
   * @dev Internal method to fund the vesting box with the content.
   * @param content The assets to be added.
   */
  function _fundBox(Asset[] memory content) internal {
    ExchangeUtils.spendFrom(
      content,
      _msgSender(),
      address(this),
      AllowedTokenTypes(true, true, false, false, false)
    );
  }

  /**
   * @dev Expands an existing vesting box with additional content.
   * @param tokenId The ID of the token to be expanded.
   * @param content The additional assets to be added.
   */
  function expand(uint256 tokenId, Asset[] calldata content) external payable onlyRole(MINTER_ROLE) {
    _requireOwned(tokenId);

    _fundBox(content);

    for (uint256 i = 0; i < content.length; i++) {
      Asset memory item = content[i];
      bool found = false;
      for (uint256 j = 0; j < _itemData[tokenId].length; j++) {
        Asset storage existingItem = _itemData[tokenId][j];
        if (existingItem.token == item.token) {
          existingItem.amount += item.amount;
          found = true;
          break;
        }
      }
      if (!found) {
        _itemData[tokenId].push(item);
        _withdrawnData[tokenId].push(Asset(content[i].tokenType, content[i].token, content[i].tokenId, 0));
      }
    }
  }

  /**
   * @dev Releases the vesting box assets that are allowed to be withdrawn.
   * @param tokenId The ID of the token to release assets from.
   */
  function release(uint256 tokenId) public virtual {
    _checkAuthorized(ownerOf(tokenId), _msgSender(), tokenId);

    Asset[] memory releasableAssets = _releasableAssets(tokenId);

    bool hasReleasable = false;
    for (uint256 i = 0; i < releasableAssets.length; i++) {
      if (releasableAssets[i].amount > 0) {
        hasReleasable = true;
        break;
      }
    }

    if (!hasReleasable) {
      revert VestingNoReleasableAssets();
    }

    for (uint256 i = 0; i < releasableAssets.length; i++) {
      _withdrawnData[tokenId][i].amount += releasableAssets[i].amount;
    }

    ExchangeUtils.spend(releasableAssets, _msgSender(), AllowedTokenTypes(true, true, false, false, false));
  }

  /**
   * @dev Returns an array of releasable assets for a given tokenId.
   * @param tokenId The ID of the token.
   * @return The array of assets which are releasable.
   */
  function releasable(uint256 tokenId) public view returns (Asset[] memory) {
    return _releasableAssets(tokenId);
  }

  /**
   * @dev Calculates the releasable amount for a given tokenId based on vesting configuration.
   * @param tokenId The ID of the token.
   * @return The array of assets which are releasable.
   */
  function _releasableAssets(uint256 tokenId) internal view returns (Asset[] memory) {
    uint256 length = _itemData[tokenId].length;
    Asset[] memory releasableAssets = new Asset[](length);

    for (uint256 i = 0; i < length; i++) {
      Asset storage item = _itemData[tokenId][i];
      uint256 releasableAmount = VestingLibrary.calc(
        _boxConfig[tokenId],
        block.timestamp,
        item.amount
      );

      uint256 unWithdrawnAmount = releasableAmount - _withdrawnData[tokenId][i].amount;

      releasableAssets[i] = Asset(item.tokenType, item.token, item.tokenId, unWithdrawnAmount);
    }

    return releasableAssets;
  }

  /**
   * @dev Splits the vesting box into a new box with a specified percentage of the assets.
   * @param tokenId The ID of the token to be split.
   * @param percentage The percentage of assets to split into a new token.
   */
  function split(uint256 tokenId, uint8 percentage) public virtual {
    _checkAuthorized(_ownerOf(tokenId), _msgSender(), tokenId);

    if (percentage == 0 || percentage >= 100) {
      revert VestingInvalidPercentage(percentage);
    }

    uint256 templateId = _getRecordFieldValue(tokenId, TEMPLATE_ID);
    uint256 newTokenId = _mintCommon(_msgSender(), templateId);

    for (uint256 i = 0; i < _itemData[tokenId].length; i++) {
      Asset storage item = _itemData[tokenId][i];
      uint256 newAmount = item.amount / 100 * percentage;
      uint256 remainingAmount = item.amount - newAmount;

      item.amount = remainingAmount;

      Asset memory newItem = Asset(item.tokenType, item.token, item.tokenId, newAmount);
      _itemData[newTokenId].push(newItem);
    }

    _boxConfig[newTokenId] = _boxConfig[tokenId];
  }

  /**
   * @dev Retrieves the item data for a specified tokenId.
   * @param tokenId The ID of the token.
   * @return The array of assets associated with the tokenId.
   */
  function getItemData(uint256 tokenId) external view returns (Asset[] memory) {
    return _itemData[tokenId];
  }

  /**
   * @dev Retrieves the withdrawn amounts for a specified tokenId.
   * @param tokenId The ID of the token.
   * @return The array of assets with their withdrawn amounts.
   */
  function getWithdrawnAmounts(uint256 tokenId) external view returns (Asset[] memory) {
    return _withdrawnData[tokenId];
  }

  /**
   * @dev Checks if the contract supports an interface.
   * @param interfaceId The ID of the interface.
   * @return True if the interface is supported, false otherwise.
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override(CoinHolder, ERC721Simple) returns (bool) {
    return interfaceId == type(IERC721Vesting).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @dev Retrieves the vesting box configuration for a specified tokenId.
   * @param tokenId The ID of the token.
   * @return The vesting box configuration.
   */
  function getVestingData(uint256 tokenId) public view returns (VestingBoxConfig memory) {
    return _boxConfig[tokenId];
  }
}
