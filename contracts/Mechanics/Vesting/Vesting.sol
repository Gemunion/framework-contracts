// SPDX-License-Identifier: MIT

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { VestingWallet } from "@openzeppelin/contracts/finance/VestingWallet.sol";
import { NativeRejector, CoinHolder } from "@ethberry/contracts-finance/contracts/Holder.sol";

import { TopUp } from "../../utils/TopUp.sol";
import { ExchangeUtils } from "../../Exchange/lib/ExchangeUtils.sol";
import { Asset, TokenType, AllowedTokenTypes } from "../../Exchange/lib/interfaces/IAsset.sol";

/**
 * @title Monthly Vesting
 * @dev Basic preset of Vesting contract that includes the following extensions:
 *      - Ownable (OpenZeppelin)
 *      - VestingWallet (OpenZeppelin)
 *      - TopUp (EthBerry)
 *      This contract abstracts all common functions and is used as an foundation for other vesting contracts
 */
contract Vesting is VestingWallet, NativeRejector, CoinHolder, TopUp {
  using SafeCast for uint256;

  uint64 public constant _monthInSeconds = 2592000; // The number of seconds in month
  uint16 private immutable _cliffInMonth; // The number of days before the cliff period ends
  uint16 private immutable _monthlyRelease; // The amount of tokens that can be released daily

  constructor(
    address beneficiary,
    uint64 startTimestamp,
    uint16 cliffInMonth,
    uint16 monthlyRelease
  ) VestingWallet(beneficiary, startTimestamp, (10000 * _monthInSeconds) / monthlyRelease) {
    _cliffInMonth = cliffInMonth;
    _monthlyRelease = monthlyRelease;
  }

  /**
   * @dev Computes the vesting schedule based on the total allocation and the timestamp.
   * @param totalAllocation The total allocation of tokens for vesting
   * @param timestamp The timestamp for which the vesting schedule is computed
   * @return The vesting schedule for the given total allocation and timestamp
   */
  function _vestingSchedule(uint256 totalAllocation, uint64 timestamp) internal view override returns (uint256) {
    uint256 _start = start() + _cliffInMonth * _monthInSeconds;
    uint256 period = timestamp > _start ? (timestamp - _start) / _monthInSeconds : 0;

    if (timestamp < _start) {
      return 0;
    } else if (timestamp > _start + duration()) {
      return totalAllocation;
    } else {
      return (totalAllocation * period * _monthlyRelease) / 10000;
    }
  }

  /**
   * @notice No tipping!
   * @dev Rejects any incoming ETH transfers. Use TopUp instead
   */
  receive() external payable virtual override(VestingWallet, NativeRejector) {
    revert PaymentRejected(_msgSender(), msg.value);
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
