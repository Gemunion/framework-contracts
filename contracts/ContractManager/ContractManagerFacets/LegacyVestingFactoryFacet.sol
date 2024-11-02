// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

import { MINTER_ROLE, DEFAULT_ADMIN_ROLE } from "@ethberry/contracts-utils/contracts/roles.sol";

import { SignatureValidatorCM } from "../override/SignatureValidator.sol";
import { AbstractFactoryFacet } from "./AbstractFactoryFacet.sol";
import { ExchangeUtils } from "../../Exchange/lib/ExchangeUtils.sol";

/**
 * @title VestingFactory
 * @dev Extension that provides functionality for deployment of Vesting contracts
 */
contract LegacyVestingFactoryFacet is AbstractFactoryFacet, SignatureValidatorCM {
  constructor() SignatureValidatorCM() {}

  bytes private constant VESTING_ARGUMENTS_SIGNATURE =
    "VestingArgs(address owner,uint64 startTimestamp,uint16 cliffInMonth,uint16 monthlyRelease,string contractTemplate)";
  bytes32 private constant VESTING_ARGUMENTS_TYPEHASH = keccak256(VESTING_ARGUMENTS_SIGNATURE);

  bytes32 private immutable VESTING_PERMIT_SIGNATURE =
    keccak256(
      bytes.concat(
        "EIP712(Params params,VestingArgs args)",
        PARAMS_SIGNATURE,
        VESTING_ARGUMENTS_SIGNATURE
      )
    );

  // Structure representing Vesting template and arguments
  struct VestingArgs {
    address owner;
    uint64 startTimestamp; // in sec
    uint16 cliffInMonth; // in sec
    uint16 monthlyRelease;
    string contractTemplate;
  }

  event LegacyVestingDeployed(address account, uint256 externalId, VestingArgs args);

  /**
   * @dev Deploys a vesting contract with the specified arguments.
   *
   * @param params struct containing bytecode and nonce.
   * @param args The arguments for the vesting contract deployment.
   * @param signature The signature provided to verify the transaction.
   * @return account address of the deployed vesting contract
   */
  function deployVesting(
    Params calldata params,
    VestingArgs calldata args,
    bytes calldata signature
  ) external returns (address account) {
    _validateParams(params);

    address signer = _recoverSigner(_hashVesting(params, args), signature);
    if (!_hasRole(DEFAULT_ADMIN_ROLE, signer)) {
      revert SignerMissingRole();
    }

    bytes memory argument = abi.encode(args.owner, args.startTimestamp, args.cliffInMonth, args.monthlyRelease);
    bytes memory bytecode = abi.encodePacked(params.bytecode, argument);
    account = Create2.computeAddress(params.nonce, keccak256(bytecode));
    emit LegacyVestingDeployed(account, params.externalId, args);
    Create2.deploy(0, params.nonce, bytecode);
  }

  /**
   * @dev Computes the hash of the vesting contract arguments and deployment params.
   *
   * @param params struct containing bytecode and nonce
   * @param args The arguments for the vesting contract deployment.
   * @return bytes32 The keccak256 hash of the arguments and params.
   */
  function _hashVesting(
    Params calldata params,
    VestingArgs calldata args
  ) internal view returns (bytes32) {
    return
      _hashTypedDataV4(
        keccak256(
          abi.encodePacked(
            VESTING_PERMIT_SIGNATURE,
            _hashParamsStruct(params),
            _hashVestingStruct(args)
          )
        )
      );
  }

  /**
   * @dev Computes the hash of the vesting contract arguments.
   *
   * @param args The arguments for the vesting contract deployment.
   * @return bytes32 The keccak256 hash of the arguments.
   */
  function _hashVestingStruct(VestingArgs calldata args) private pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          VESTING_ARGUMENTS_TYPEHASH,
          args.owner,
          args.startTimestamp,
          args.cliffInMonth,
          args.monthlyRelease,
          keccak256(bytes(args.contractTemplate))
        )
      );
  }
}
