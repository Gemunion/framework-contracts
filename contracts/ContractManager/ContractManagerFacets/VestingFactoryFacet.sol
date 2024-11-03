// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gmail.com
// Website: https://ethberry.io/

pragma solidity ^0.8.20;

import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import { METADATA_ROLE, MINTER_ROLE, DEFAULT_ADMIN_ROLE, PAUSER_ROLE } from "@ethberry/contracts-utils/contracts/roles.sol";

import { SignatureValidatorCM } from "../override/SignatureValidator.sol";
import { CMStorage } from "../storage/CMStorage.sol";
import { AbstractFactoryFacet } from "./AbstractFactoryFacet.sol";

contract VestingFactoryFacet is AbstractFactoryFacet, SignatureValidatorCM {
  constructor() SignatureValidatorCM() {}

  bytes private constant VESTINGBOX_ARGUMENTS_SIGNATURE =
    "VestingArgs(string name,string symbol,uint96 royalty,string baseTokenURI,string contractTemplate)";
  bytes32 private constant VESTINGBOX_ARGUMENTS_TYPEHASH = keccak256(VESTINGBOX_ARGUMENTS_SIGNATURE);

  bytes32 private immutable VESTINGBOX_PERMIT_SIGNATURE =
    keccak256(bytes.concat("EIP712(Params params,VestingArgs args)", PARAMS_SIGNATURE, VESTINGBOX_ARGUMENTS_SIGNATURE));

  struct VestingArgs {
    string name;
    string symbol;
    uint96 royalty;
    string baseTokenURI;
    string contractTemplate;
  }

  event VestingBoxDeployed(address account, uint256 externalId, VestingArgs args);

  function deployVestingBox(
    Params calldata params,
    VestingArgs calldata args,
    bytes calldata signature
  ) external returns (address account) {
    _validateParams(params);

    address signer = _recoverSigner(_hashVestingBox(params, args), signature);
    if (!_hasRole(DEFAULT_ADMIN_ROLE, signer)) {
      revert SignerMissingRole();
    }

    account = deploy2(
      params.bytecode,
      abi.encode(args.name, args.symbol, args.royalty, args.baseTokenURI),
      params.nonce
    );

    emit VestingBoxDeployed(account, params.externalId, args);

    bytes32[] memory roles = new bytes32[](2);
    roles[0] = MINTER_ROLE;
    roles[1] = DEFAULT_ADMIN_ROLE;

    grantFactoryMintPermission(account);
    fixPermissions(account, roles);
  }

  function _hashVestingBox(Params calldata params, VestingArgs calldata args) internal view returns (bytes32) {
    return
      _hashTypedDataV4(
        keccak256(abi.encodePacked(VESTINGBOX_PERMIT_SIGNATURE, _hashParamsStruct(params), _hashVestingStruct(args)))
      );
  }

  function _hashVestingStruct(VestingArgs calldata args) private pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          VESTINGBOX_ARGUMENTS_TYPEHASH,
          keccak256(bytes(args.name)),
          keccak256(bytes(args.symbol)),
          args.royalty,
          keccak256(bytes(args.baseTokenURI)),
          keccak256(bytes(args.contractTemplate))
        )
      );
  }
}
