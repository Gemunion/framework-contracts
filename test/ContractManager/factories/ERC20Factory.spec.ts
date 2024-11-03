import { expect } from "chai";
import { ethers } from "hardhat";
import { getCreate2Address } from "ethers";

import { DEFAULT_ADMIN_ROLE, nonce, tokenName, tokenSymbol } from "@ethberry/contracts-constants";

import { cap, contractTemplate, externalId } from "../../constants";
import { getInitCodeHash } from "../../utils";
import { deployDiamond } from "../../Exchange/shared";

describe("ERC20FactoryDiamond", function () {
  const factory = async (facetName = "ERC20FactoryFacet"): Promise<any> => {
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

  describe("deployERC20Token", function () {
    it("should deploy contract", async function () {
      const [owner] = await ethers.getSigners();
      const network = await ethers.provider.getNetwork();
      const { bytecode } = await ethers.getContractFactory("ERC20Simple");

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
            { name: "args", type: "Erc20Args" },
          ],
          Params: [
            { name: "nonce", type: "bytes32" },
            { name: "bytecode", type: "bytes" },
            { name: "externalId", type: "uint256" },
          ],
          Erc20Args: [
            { name: "name", type: "string" },
            { name: "symbol", type: "string" },
            { name: "cap", type: "uint256" },
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
            cap,
            contractTemplate,
          },
        },
      );

      const tx = contractInstance.deployERC20Token(
        {
          nonce,
          bytecode,
          externalId,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          cap,
          contractTemplate,
        },
        signature,
      );

      const initCodeHash = getInitCodeHash(["string", "string", "uint256"], [tokenName, tokenSymbol, cap], bytecode);
      const address = getCreate2Address(await contractInstance.getAddress(), nonce, initCodeHash);

      await expect(tx)
        .to.emit(contractInstance, "ERC20TokenDeployed")
        .withArgs(address, externalId, [tokenName, tokenSymbol, cap, contractTemplate]);

      const erc20Instance = await ethers.getContractAt("ERC20Simple", address);

      const hasRole1 = await erc20Instance.hasRole(DEFAULT_ADMIN_ROLE, contractInstance);
      expect(hasRole1).to.equal(false);

      const hasRole2 = await erc20Instance.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
      expect(hasRole2).to.equal(true);
    });

    it("should fail: SignerMissingRole", async function () {
      const [owner] = await ethers.getSigners();
      const network = await ethers.provider.getNetwork();
      const { bytecode } = await ethers.getContractFactory("ERC20Simple");

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
            { name: "args", type: "Erc20Args" },
          ],
          Params: [
            { name: "nonce", type: "bytes32" },
            { name: "bytecode", type: "bytes" },
            { name: "externalId", type: "uint256" },
          ],
          Erc20Args: [
            { name: "name", type: "string" },
            { name: "symbol", type: "string" },
            { name: "cap", type: "uint256" },
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
            cap,
            contractTemplate,
          },
        },
      );

      const accessInstance = await ethers.getContractAt("AccessControlFacet", contractInstance);
      await accessInstance.renounceRole(DEFAULT_ADMIN_ROLE, owner.address);

      const tx = contractInstance.deployERC20Token(
        {
          nonce,
          bytecode,
          externalId,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          cap,
          contractTemplate,
        },
        signature,
      );

      await expect(tx).to.be.revertedWithCustomError(contractInstance, "SignerMissingRole");
    });
  });
});
