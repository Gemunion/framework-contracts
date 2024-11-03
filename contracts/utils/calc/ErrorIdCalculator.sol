// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { IERC20Errors, IERC721Errors, IERC1155Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { IGeneralizedCollectionErrors } from "@ethberry/contracts-utils/contracts/interfaces/IGeneralizedCollectionErrors.sol";

import { IERC998TopDownErrors } from "@ethberry/contracts-erc998td/contracts/interfaces/IERC998TopDownErrors.sol";
import { IERC998ERC20TopDownError } from "@ethberry/contracts-erc998td/contracts/interfaces/IERC998ERC20TopDownError.sol";
import { IStateHashError } from "@ethberry/contracts-erc998td/contracts/interfaces/IStateHashError.sol";
import { IWhiteListChildError } from "@ethberry/contracts-erc998td/contracts/interfaces/IWhiteListChildError.sol";

import { IDiamondErrors } from "../../Diamond/interfaces/IDiamondErrors.sol";
import { IDiamondInitErrors } from "../../Diamond/interfaces/IDiamondInitErrors.sol";
import { ISignatureValidatorErrors } from "../../Exchange/interfaces/ISignatureValidatorErrors.sol";
import { ITokenValidationErrors } from "../../Exchange/interfaces/ITokenValidationErrors.sol";
import { IGenesErrors } from "../../Exchange/interfaces/IGenesErrors.sol";
import { IRentableErrors } from "../../Exchange/interfaces/IRentableErrors.sol";
import { IMergeErrors } from "../../Exchange/interfaces/IMergeErrors.sol";
import { IERC721SimpleErrors } from "../../ERC721/interfaces/IERC721SimpleErrors.sol";
import { IERC721BoxErrors } from "../../ERC721/interfaces/IERC721BoxErrors.sol";
import { IERC721GenesErrors } from "../../Mechanics/Genes/interfaces/IERC721GenesErrors.sol";
import { IPredictionErrors } from "../../Mechanics/Prediction/interfaces/IPredictionErrors.sol";
import { ILotteryErrors } from "../../Mechanics/Lottery/interfaces/ILotteryErrors.sol";
import { IRaffleErrors } from "../../Mechanics/Raffle/interfaces/IRaffleErrors.sol";
import { IStakingErrors } from "../../Mechanics/Staking/interfaces/IStakingErrors.sol";
import { IPonziErrors } from "../../Mechanics/Ponzi/interfaces/IPonziErrors.sol";
import { IWaitListErrors } from "../../Mechanics/WaitList/interfaces/IWaitListErrors.sol";
import { IDispenserErrors } from "../../Mechanics/Dispenser/interfaces/IDispenserErrors.sol";
import { IERC721VestingErrors } from "../../Mechanics/Vesting/interfaces/IERC721VestingErrors.sol";

interface IAccessControl {
  error AccessControlUnauthorizedAccount(address account, bytes32 neededRole);
  error AccessControlBadConfirmation();
}

interface IPausable {
  error EnforcedPause();
  error ExpectedPause();
}

interface IErc20Capped {
  error ERC20ExceededCap(uint256 increasedSupply, uint256 cap);
  error ERC20InvalidCap(uint256 cap);
}

interface IErc2981Royalty {
  error ERC2981InvalidDefaultRoyalty(uint256 numerator, uint256 denominator);
  error ERC2981InvalidDefaultRoyaltyReceiver(address receiver);
  error ERC2981InvalidTokenRoyalty(uint256 tokenId, uint256 numerator, uint256 denominator);
  error ERC2981InvalidTokenRoyaltyReceiver(uint256 tokenId, address receiver);
}

contract ErrorsIdCalculator is
  IERC20Errors,
  IERC721Errors,
  IERC1155Errors,
  IERC998TopDownErrors,
  IERC998ERC20TopDownError,
  IStateHashError,
  IWhiteListChildError,
  IAccessControl,
  IPausable,
  IErc20Capped,
  IErc2981Royalty,
  IGeneralizedCollectionErrors,
  IDiamondErrors,
  IDiamondInitErrors,
  ISignatureValidatorErrors,
  ITokenValidationErrors,
  IMergeErrors,
  IGenesErrors,
  IRentableErrors,
  IERC721SimpleErrors,
  IERC721BoxErrors,
  IERC721GenesErrors,
  IERC721VestingErrors,
  IPredictionErrors,
  ILotteryErrors,
  IRaffleErrors,
  IStakingErrors,
  IPonziErrors,
  IWaitListErrors,
  IDispenserErrors
{}
