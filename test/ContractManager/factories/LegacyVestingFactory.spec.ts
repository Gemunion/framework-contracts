import { expect } from "chai";
import { ethers } from "hardhat";
import { getCreate2Address } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { amount, DEFAULT_ADMIN_ROLE, nonce } from "@ethberry/contracts-constants";
import { deployERC20Mock } from "@ethberry/contracts-mocks";

import { getInitCodeHash, isEqualEventArgObj } from "../../utils";
import { contractTemplate, externalId, userId } from "../../constants";
import { deployDiamond } from "../../Exchange/shared";

describe("LegacyVestingFactoryDiamond", function () {
  const factory = async (facetName = "LegacyVestingFactoryFacet"): Promise<any> => {
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

  describe("deployVesting", function () {
    it("should deploy contract", async function () {
      const [owner] = await ethers.getSigners();
      const network = await ethers.provider.getNetwork();
      const { bytecode } = await ethers.getContractFactory("LegacyVesting");

      const contractInstance = await factory();

      const current = await time.latest();

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
            { name: "args", type: "VestingArgs" },
          ],
          Params: [
            { name: "nonce", type: "bytes32" },
            { name: "bytecode", type: "bytes" },
            { name: "externalId", type: "uint256" },
          ],
          VestingArgs: [
            { name: "owner", type: "address" },
            { name: "startTimestamp", type: "uint64" },
            { name: "cliffInMonth", type: "uint16" },
            { name: "monthlyRelease", type: "uint16" },
            { name: "contractTemplate", type: "string" },
          ],
        },
        // Values
        {
          params: {
            nonce,
            bytecode,
            externalId: userId,
          },
          args: {
            owner: owner.address,
            startTimestamp: current,
            cliffInMonth: 12,
            monthlyRelease: 417,
            contractTemplate,
          },
        },
      );

      const tx = contractInstance.deployVesting(
        {
          nonce,
          bytecode,
          externalId: userId,
        },
        {
          owner: owner.address,
          startTimestamp: current,
          cliffInMonth: 12,
          monthlyRelease: 417,
          contractTemplate,
        },
        signature,
      );

      const initCodeHash = getInitCodeHash(
        ["address", "uint256", "uint256", "uint256"],
        [owner.address, current, 12, 417],
        bytecode,
      );
      const address = getCreate2Address(await contractInstance.getAddress(), nonce, initCodeHash);

      await expect(tx)
        .to.emit(contractInstance, "LegacyVestingDeployed")
        .withArgs(
          address,
          userId,
          isEqualEventArgObj({
            owner: owner.address,
            startTimestamp: current.toString(),
            cliffInMonth: "12",
            monthlyRelease: "417",
            contractTemplate,
          }),
        );
    });

    it("should fail: SignerMissingRole", async function () {
      const [owner] = await ethers.getSigners();
      const network = await ethers.provider.getNetwork();
      const { bytecode } = await ethers.getContractFactory("LegacyVesting");

      const contractInstance = await factory();

      const erc20Instance = await deployERC20Mock();
      await erc20Instance.mint(owner.address, amount);
      await erc20Instance.approve(contractInstance, amount);

      const current = await time.latest();
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
            { name: "args", type: "VestingArgs" },
          ],
          Params: [
            { name: "nonce", type: "bytes32" },
            { name: "bytecode", type: "bytes" },
            { name: "externalId", type: "uint256" },
          ],
          VestingArgs: [
            { name: "owner", type: "address" },
            { name: "startTimestamp", type: "uint64" },
            { name: "cliffInMonth", type: "uint16" },
            { name: "monthlyRelease", type: "uint16" },
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
            owner: owner.address,
            startTimestamp: current,
            cliffInMonth: 12,
            monthlyRelease: 417,
            contractTemplate,
          },
        },
      );

      const accessInstance = await ethers.getContractAt("AccessControlFacet", contractInstance);
      await accessInstance.renounceRole(DEFAULT_ADMIN_ROLE, owner.address);

      const tx = contractInstance.deployVesting(
        {
          nonce,
          bytecode,
          externalId,
        },
        {
          owner: owner.address,
          startTimestamp: current,
          cliffInMonth: 12,
          monthlyRelease: 417,
          contractTemplate,
        },
        signature,
      );

      await expect(tx).to.be.revertedWithCustomError(contractInstance, "SignerMissingRole");
    });
  });
});
