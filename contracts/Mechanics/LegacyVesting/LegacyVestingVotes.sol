// SPDX-License-Identifier: MIT

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { Multicall } from "@openzeppelin/contracts/utils/Multicall.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";

import {LegacyVesting} from "./LegacyVesting.sol";

contract LegacyVestingVotes is LegacyVesting, Multicall {
  constructor(
    address beneficiary,
    uint64 startTimestamp,
    uint16 cliffInSeconds,
    uint16 monthlyRelease
  ) LegacyVesting(beneficiary, startTimestamp, cliffInSeconds, monthlyRelease) {}

  // Allow delegation of votes
  function delegate(IVotes token, address delegatee) public virtual onlyOwner {
    token.delegate(delegatee);
  }
}
