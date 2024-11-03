// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import "hardhat/console.sol";

import { IERC721Simple } from "../../ERC721/interfaces/IERC721Simple.sol";
import { IERC721Discrete } from "../../Mechanics/Discrete/interfaces/IERC721Discrete.sol";
import { IERC721Random } from "../../Mechanics/Random/interfaces/IERC721Random.sol";
import { IERC721Genes } from "../../Mechanics/Genes/interfaces/IERC721Genes.sol";

import { IERC721MysteryBox } from "../../Mechanics/MysteryBox/interfaces/IERC721MysteryBox.sol";
import { IERC721LootBox } from "../../Mechanics/LootBox/interfaces/IERC721LootBox.sol";
import { IERC721Vesting } from "../../Mechanics/Vesting/interfaces/IERC721Vesting.sol";
import { IDispenser } from "../../Mechanics/Dispenser/interfaces/IDispenser.sol";
import { IERC721LotteryTicket } from "../../Mechanics/Lottery/interfaces/IERC721LotteryTicket.sol";
import { IERC721RaffleTicket } from "../../Mechanics/Raffle/interfaces/IERC721RaffleTicket.sol";

contract InterfaceIdCalculator {
  function test() public pure {
    console.logString("IERC721Simple");
    console.logBytes4(type(IERC721Simple).interfaceId);
    console.logString("IERC721Discrete");
    console.logBytes4(type(IERC721Discrete).interfaceId);
    console.logString("IERC721Random");
    console.logBytes4(type(IERC721Random).interfaceId);
    console.logString("IERC721Genes");
    console.logBytes4(type(IERC721Genes).interfaceId);

    console.logString("IERC721MysteryBox");
    console.logBytes4(type(IERC721MysteryBox).interfaceId);
    console.logString("IERC721LootBox");
    console.logBytes4(type(IERC721LootBox).interfaceId);
    console.logString("IERC721Vesting");
    console.logBytes4(type(IERC721Vesting).interfaceId);

    console.logString("IERC721LotteryTicket");
    console.logBytes4(type(IERC721LotteryTicket).interfaceId);
    console.logString("IERC721RaffleTicket");
    console.logBytes4(type(IERC721RaffleTicket).interfaceId);

    console.logString("IDispenser");
    console.logBytes4(type(IDispenser).interfaceId);
  }
}
