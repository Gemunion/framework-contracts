// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun@gemunion.io
// Website: https://gemunion.io/

pragma solidity ^0.8.20;

import { DEFAULT_ADMIN_ROLE, MINTER_ROLE, METADATA_ROLE } from "@gemunion/contracts-utils/contracts/roles.sol";

import { SignerMissingRole } from "../../utils/errors.sol";
import { SignatureValidatorCM } from "../override/SignatureValidator.sol";
import { AbstractFactoryFacet } from "./AbstractFactoryFacet.sol";

contract ERC998FactoryFacet is AbstractFactoryFacet, SignatureValidatorCM {
  constructor() SignatureValidatorCM() {}

  bytes private constant ERC998_ARGUMENTS_SIGNATURE =
    "Erc998Args(string name,string symbol,uint96 royalty,string baseTokenURI,string contractTemplate)";
  bytes32 private constant ERC998_ARGUMENTS_TYPEHASH = keccak256(ERC998_ARGUMENTS_SIGNATURE);

  bytes32 private immutable ERC998_PERMIT_SIGNATURE =
    keccak256(bytes.concat("EIP712(Params params,Erc998Args args)", ERC998_ARGUMENTS_SIGNATURE, PARAMS_SIGNATURE));

  struct Erc998Args {
    string name;
    string symbol;
    uint96 royalty;
    string baseTokenURI;
    string contractTemplate;
  }

  event ERC998TokenDeployed(address account, uint256 externalId, Erc998Args args);

  function deployERC998Token(
    Params calldata params,
    Erc998Args calldata args,
    bytes calldata signature
  ) external returns (address account) {
    _validateParams(params);

    address signer = _recoverSigner(_hashERC998(params, args), signature);
    if (!_hasRole(DEFAULT_ADMIN_ROLE, signer)) {
      revert SignerMissingRole();
    }

    account = deploy2(
      params.bytecode,
      abi.encode(args.name, args.symbol, args.royalty, args.baseTokenURI),
      params.nonce
    );

    emit ERC998TokenDeployed(account, params.externalId, args);

    bytes32[] memory roles = new bytes32[](3);
    roles[0] = MINTER_ROLE;
    roles[1] = METADATA_ROLE;
    roles[2] = DEFAULT_ADMIN_ROLE;

    grantFactoryMintPermission(account);
    grantFactoryMetadataPermission(account);
    fixPermissions(account, roles);
  }

  function _hashERC998(Params calldata params, Erc998Args calldata args) internal view returns (bytes32) {
    return
      _hashTypedDataV4(
        keccak256(abi.encodePacked(ERC998_PERMIT_SIGNATURE, _hashParamsStruct(params), _hashErc998Struct(args)))
      );
  }

  function _hashErc998Struct(Erc998Args calldata args) private pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          ERC998_ARGUMENTS_TYPEHASH,
          keccak256(bytes(args.name)),
          keccak256(bytes(args.symbol)),
          args.royalty,
          keccak256(bytes(args.baseTokenURI)),
          keccak256(bytes(args.contractTemplate))
        )
      );
  }
}
