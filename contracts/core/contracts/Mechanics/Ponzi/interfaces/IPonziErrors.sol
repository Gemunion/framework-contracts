// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gemunion.io
// Website: https://gemunion.io/

pragma solidity ^0.8.20;
import { Asset } from "../../../Exchange/lib/interfaces/IAsset.sol";

interface IPonziErrors {
  error PonziNotAnOwner(address account);
  error PonziRuleNotExist();
  error PonziRuleNotActive();
  error PonziStakeLimitExceed();
  error PonziBalanceExceed();
  error PonziStakeNotExist();
  error PonziStakeAlreadyWithdrawn();
  error PonziZeroBalance();
  error PonziDepositNotComplete();
  error PonziWrongTemplate();
}