import { expect } from "chai";
import { ethers } from "hardhat";
import { getCreate2Address } from "ethers";

import {
  baseTokenURI,
  DEFAULT_ADMIN_ROLE,
  METADATA_ROLE,
  nonce,
  royalty,
  tokenName,
  tokenSymbol
} from "@ethberry/contracts-constants";

import { contractTemplate, externalId } from "../../constants";
import { getInitCodeHash } from "../../utils";
import { deployDiamond } from "../../Exchange/shared";

describe("MysteryBoxFactoryDiamond", function () {
  const factory = async (facetName = "MysteryBoxFactoryFacet"): Promise<any> => {
    const diamondInstance = await deployDiamond(
      "DiamondCM",
      [facetName, "AccessControlFacet", "PausableFacet"],
      "DiamondCMInit",
      {
        logSelectors: false,
      },
    );
    return ethers.getContractAt(facetName, diamondInstance);
  };

  describe("deployMysteryToken", function () {
    it("should deploy contract", async function () {
      const [owner] = await ethers.getSigners();
      const network = await ethers.provider.getNetwork();
      const { bytecode } = await ethers.getContractFactory("ERC721MysteryBoxSimple");

      const contractInstance = await factory();

      const signature = await owner.signTypedData(
        // Domain
        {
          name: "CONTRACT_MANAGER",
          version: "1.0.0",
          chainId: network.chainId,
          verifyingContract: await contractInstance.getAddress(),
        },
        // Types
        {
          EIP712: [
            { name: "params", type: "Params" },
            { name: "args", type: "MysteryArgs" },
          ],
          Params: [
            { name: "nonce", type: "bytes32" },
            { name: "bytecode", type: "bytes" },
            { name: "externalId", type: "uint256" },
          ],
          MysteryArgs: [
            { name: "name", type: "string" },
            { name: "symbol", type: "string" },
            { name: "royalty", type: "uint96" },
            { name: "baseTokenURI", type: "string" },
            { name: "contractTemplate", type: "string" },
          ],
        },
        // Values
        {
          params: {
            nonce,
            bytecode,
            externalId,
          },
          args: {
            name: tokenName,
            symbol: tokenSymbol,
            royalty,
            baseTokenURI,
            contractTemplate,
          },
        },
      );

      const tx = contractInstance.deployMysteryBox(
        {
          nonce,
          bytecode,
          externalId,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          royalty,
          baseTokenURI,
          contractTemplate,
        },
        signature,
      );

      const initCodeHash = getInitCodeHash(
        ["string", "string", "uint256", "string"],
        [tokenName, tokenSymbol, royalty, baseTokenURI],
        bytecode,
      );
      const address = getCreate2Address(await contractInstance.getAddress(), nonce, initCodeHash);

      await expect(tx)
        .to.emit(contractInstance, "MysteryBoxDeployed")
        .withArgs(address, externalId, [tokenName, tokenSymbol, royalty, baseTokenURI, contractTemplate]);

      const erc721Instance = await ethers.getContractAt("ERC721MysteryBoxSimple", address);

      const hasRole1 = await erc721Instance.hasRole(DEFAULT_ADMIN_ROLE, contractInstance);
      expect(hasRole1).to.equal(false);

      const hasRole2 = await erc721Instance.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
      expect(hasRole2).to.equal(true);

      const hasRole3 = await erc721Instance.hasRole(METADATA_ROLE, owner.address);
      expect(hasRole3).to.equal(true);

      const hasRole4 = await erc721Instance.hasRole(METADATA_ROLE, contractInstance);
      expect(hasRole4).to.equal(false);
    });

    it("should fail: SignerMissingRole", async function () {
      const [owner] = await ethers.getSigners();
      const network = await ethers.provider.getNetwork();
      const { bytecode } = await ethers.getContractFactory("ERC721MysteryBoxSimple");

      const contractInstance = await factory();

      const signature = await owner.signTypedData(
        // Domain
        {
          name: "CONTRACT_MANAGER",
          version: "1.0.0",
          chainId: network.chainId,
          verifyingContract: await contractInstance.getAddress(),
        },
        // Types
        {
          EIP712: [
            { name: "params", type: "Params" },
            { name: "args", type: "MysteryArgs" },
          ],
          Params: [
            { name: "nonce", type: "bytes32" },
            { name: "bytecode", type: "bytes" },
            { name: "externalId", type: "uint256" },
          ],
          MysteryArgs: [
            { name: "name", type: "string" },
            { name: "symbol", type: "string" },
            { name: "royalty", type: "uint96" },
            { name: "baseTokenURI", type: "string" },
            { name: "contractTemplate", type: "string" },
          ],
        },
        // Values
        {
          params: {
            nonce,
            bytecode,
            externalId,
          },
          args: {
            name: tokenName,
            symbol: tokenSymbol,
            royalty,
            baseTokenURI,
            contractTemplate,
          },
        },
      );

      const accessInstance = await ethers.getContractAt("AccessControlFacet", contractInstance);
      await accessInstance.renounceRole(DEFAULT_ADMIN_ROLE, owner.address);

      const tx = contractInstance.deployMysteryBox(
        {
          nonce,
          bytecode,
          externalId,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          royalty,
          baseTokenURI,
          contractTemplate,
        },
        signature,
      );

      await expect(tx).to.be.revertedWithCustomError(contractInstance, "SignerMissingRole");
    });
  });
});
