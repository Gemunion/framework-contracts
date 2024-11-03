// SPDX-License-Identifier: UNLICENSED

// Author: 7flash
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

  enum FunctionType {
    LINEAR,
    HYPERBOLIC,
    EXPONENTIAL
  }

  struct VestingBoxConfig {
    FunctionType functionType;
    uint128 cliff; // in seconds
    uint64 startTimestamp; // in seconds since UNIX epoch
    uint64 duration; // in seconds
    uint64 period; // size of the period in seconds
    uint16 afterCliffBasisPoints; // basis points of the total allocation to be released after the cliff
    uint16 growthRate; // growth rate for exponential vesting
  }

library VestingLibrary {
  /**
   * @dev Calculates the vested amount based on vesting configuration and timestamp.
   * @param boxConfig The configuration of the vesting box.
   * @param timestamp The current timestamp.
   * @param totalAllocation The total amount allocated for vesting.
   * @return The amount that can be released based on the current timestamp.
   */
  function calc(VestingBoxConfig memory boxConfig, uint256 timestamp, uint256 totalAllocation) internal pure returns (uint256) {
    uint256 start = boxConfig.startTimestamp + uint256(boxConfig.cliff);
    uint256 end = start + uint256(boxConfig.duration);
    uint256 immediateRelease = (totalAllocation * boxConfig.afterCliffBasisPoints) / 10000;

    if (timestamp < start) {
      return 0;
    } else if (timestamp > end) {
      return totalAllocation;
    }

    uint256 vestedAmount = _calculateVesting(boxConfig, timestamp, start, totalAllocation - immediateRelease);

    return immediateRelease + vestedAmount;
  }

  /**
   * @dev Helper function to calculate specific vesting based on vesting function type.
   * @param boxConfig The configuration of the vesting box.
   * @param timestamp The current timestamp.
   * @param start The start time of the vesting period.
   * @param residualAllocation The remaining allocation after immediate release.
   * @return The vested amount based on the vesting function type.
   */
  function _calculateVesting(
    VestingBoxConfig memory boxConfig,
    uint256 timestamp,
    uint256 start,
    uint256 residualAllocation
  ) internal pure returns (uint256) {
    uint256 periodsSinceStart = (timestamp - start) / uint256(boxConfig.period);

    if (boxConfig.functionType == FunctionType.LINEAR) {
      return (residualAllocation * periodsSinceStart) / (uint256(boxConfig.duration) / uint256(boxConfig.period));
    } else if (boxConfig.functionType == FunctionType.EXPONENTIAL) {
      uint256 growthRateFixedPoint = Math.mulDiv(boxConfig.growthRate, 1e18, 1e2);
      uint256 growthAtPeriod = power(growthRateFixedPoint, periodsSinceStart);
      uint256 totalGrowth = power(growthRateFixedPoint, boxConfig.duration / boxConfig.period);

      return Math.mulDiv(residualAllocation, growthAtPeriod, totalGrowth);
    } else if (boxConfig.functionType == FunctionType.HYPERBOLIC) {
      return (residualAllocation * periodsSinceStart) / (periodsSinceStart + 1);
    }

    return 0;
  }

  function power(uint256 base, uint256 exponent) internal pure returns (uint256) {
    uint256 result = 1e18;
    uint256 x = base;
    uint256 n = exponent;

    while (n > 0) {
      if (n % 2 == 1) {
        result = Math.mulDiv(result, x, 1e18);
      }
      x = Math.mulDiv(x, x, 1e18);
      n /= 2;
    }

    return result;
  }
}
