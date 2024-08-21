// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gemunion.io
// Website: https://gemunion.io/

pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

import { VRFConsumerBaseV2 } from "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";

import { ChainLinkEthereumGoerliV2 } from "@gemunion/contracts-chain-link-v2/contracts/extensions/ChainLinkEthereumGoerliV2.sol";
import { ChainLinkBaseV2 } from "@gemunion/contracts-chain-link-v2/contracts/extensions/ChainLinkBaseV2.sol";

import { RaffleRandom } from "../RaffleRandom.sol";
import { Asset } from "../../../Exchange/lib/interfaces/IAsset.sol";

contract RaffleRandomEthereumGoerli is RaffleRandom, ChainLinkEthereumGoerliV2 {
  constructor() RaffleRandom() ChainLinkEthereumGoerliV2(uint64(0), uint16(6), uint32(600000), uint32(1)) {}

  function getRandomNumber() internal override(RaffleRandom, ChainLinkBaseV2) returns (uint256 requestId) {
    return super.getRandomNumber();
  }

  function fulfillRandomWords(
    uint256 requestId,
    uint256[] memory randomWords
  ) internal override(RaffleRandom, VRFConsumerBaseV2) {
    return super.fulfillRandomWords(requestId, randomWords);
  }

  function setDummyRound(
    uint256 prizeNumber,
    uint256 requestId,
    Asset memory item,
    Asset memory price,
    uint256 maxTicket
  ) external {
    Round memory dummyRound;
    _rounds.push(dummyRound);

    uint256 roundNumber = _rounds.length - 1;
    Round storage currentRound = _rounds[roundNumber];

    currentRound.roundId = roundNumber;
    currentRound.maxTicket = maxTicket;
    currentRound.startTimestamp = block.timestamp;
    currentRound.endTimestamp = block.timestamp + 1;
    currentRound.balance = 10000 ether;
    currentRound.total = 10000 ether;
    currentRound.ticketAsset = item;
    currentRound.acceptedAsset = price;
    // prize numbers
    currentRound.tickets.push(prizeNumber);
    currentRound.prizeNumber = prizeNumber;
    currentRound.requestId = requestId;
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(AccessControl, RaffleRandom) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}