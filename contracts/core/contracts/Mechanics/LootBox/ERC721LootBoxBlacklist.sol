// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gemunion.io
// Website: https://gemunion.io/

pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

import { BlackList } from "@gemunion/contracts-access/contracts/extension/BlackList.sol";

import {ERC721LootBoxSimple} from "./ERC721LootBoxSimple.sol";

abstract contract ERC721LootBoxBlacklist is ERC721LootBoxSimple, BlackList {
  constructor(
    string memory name,
    string memory symbol,
    uint96 royalty,
    string memory baseTokenURI
  ) ERC721LootBoxSimple(name, symbol, royalty, baseTokenURI) {}

  /**
   * @dev See {ERC721-_update}.
   */
  function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
    address from = super._update(to, tokenId, auth);

    if (from != address(0) && _isBlacklisted(from)) {
      revert BlackListError(from);
    }

    if (to != address(0) && _isBlacklisted(to)) {
      revert BlackListError(to);
    }

    return from;
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(BlackList, ERC721LootBoxSimple) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
