// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { Asset } from "../../../Exchange/lib/interfaces/IAsset.sol";
import { VestingBoxConfig, FunctionType } from "../../../Mechanics/Vesting/VestingLibrary.sol";

interface IERC721VestingErrors {
  error VestingInvalidPercentage(uint256 percentage);
  error VestingInsufficientNativeBalance(uint256 currentBalance, uint256 requiredBalance);
  error VestingInsufficientTokenBalance(uint256 currentBalance, uint256 requiredBalance);
  error VestingNoReleasableAssets();
  error VestingInvalidStartTimestamp(uint256 start);
  error VestingInvalidAfterCliffBasisPoints(uint16 afterCliffBasisPoints);
  error VestingInvalidPeriod(uint64 period, uint64 duration);
}
