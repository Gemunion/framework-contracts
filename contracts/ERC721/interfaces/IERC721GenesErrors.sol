// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

interface IERC721GenesErrors {
  error NotOwnerNorApproved(address account);
  error InvalidGenes();
}