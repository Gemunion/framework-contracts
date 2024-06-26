// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gemunion.io
// Website: https://gemunion.io/

pragma solidity ^0.8.20;

import { Asset } from "../../../Exchange/lib/interfaces/IAsset.sol";

struct BoxConfig {
  uint128 min;
  uint128 max;
}

interface IERC721LootBox {
  function mintBox(address to, uint256 templateId, Asset[] memory items, BoxConfig calldata boxConfig) external;
}

interface IERC721LootBoxA {
  function mintBox(address to, uint256 templateId, Asset[] memory items, BoxConfig[] calldata boxConfig) external;
}