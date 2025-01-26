import { expect } from "chai";
import { ethers } from "hardhat";
import { ZeroAddress } from "ethers";

import { amount, InterfaceId } from "@ethberry/contracts-constants";
import { deployContract, shouldSupportsInterface } from "@ethberry/contracts-utils";

import { FrameworkInterfaceId, templateId, tokenId } from "../../constants";
import { deployERC20 } from "../../ERC20/shared/fixtures";
import { deployERC721 } from "../../ERC721/shared/fixtures";
import { deployERC1155 } from "../../ERC1155/shared/fixtures";
import { shouldReceive } from "../../shared/receive";

describe("Dispenser", function () {
  const factory = () => deployContract("Dispenser");

  shouldReceive(factory);

  shouldSupportsInterface(factory)([InterfaceId.IERC165, FrameworkInterfaceId.Dispenser]);

  describe("NATIVE", function () {
    it("should send ETH", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const contractInstance = await factory();

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        [receiver.address],
        { value: amount },
      );

      const lib = await ethers.getContractAt("ExchangeUtils", contractInstance, owner);
      await expect(tx).to.emit(lib, "PaymentReleased").withArgs(receiver.address, amount);

      await expect(tx).to.changeEtherBalances([owner, receiver], [-amount, amount]);
    });

    it("should send ETH (multiple)", async function () {
      const [owner, receiver, stranger] = await ethers.getSigners();

      const contractInstance = await factory();

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        [receiver.address, stranger.address],
        { value: amount * 2n },
      );

      const lib = await ethers.getContractAt("ExchangeUtils", contractInstance, owner);
      await expect(tx)
        .to.emit(lib, "PaymentReleased")
        .withArgs(receiver.address, amount)
        .to.emit(lib, "PaymentReleased")
        .withArgs(stranger.address, amount);
    });

    it("should fail: ETHInsufficientBalance", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const contractInstance = await factory();

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        [receiver.address],
        { value: amount / 2n },
      );

      await expect(tx)
        .to.be.revertedWithCustomError(contractInstance, "ETHInsufficientBalance")
        .withArgs(owner, amount / 2n, amount);
    });

    it("should fail: InsufficientBalance", async function () {
      const [_owner, receiver, stranger] = await ethers.getSigners();

      const contractInstance = await factory();

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        [receiver.address, stranger.address],
        { value: amount },
      );

      await expect(tx).to.be.revertedWithCustomError(contractInstance, "InsufficientBalance").withArgs(0, amount);
    });

    it("should fail: DispenserWrongArrayLength", async function () {
      const [_owner, receiver, stranger] = await ethers.getSigners();
      const contractInstance = await factory();

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        [receiver.address, stranger.address],
        { value: amount },
      );

      await expect(tx).to.be.revertedWithCustomError(contractInstance, "DispenserWrongArrayLength");
    });

    it("should have reentrancy guard", async function () {
      const [owner] = await ethers.getSigners();

      const contractInstance = await factory();

      const attackerFactory = await ethers.getContractFactory("ReentrancyDispenser");
      const attackerInstance = await attackerFactory.deploy(contractInstance, ZeroAddress);
      await owner.sendTransaction({
        to: attackerInstance,
        value: amount * 5n,
      });

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        [attackerInstance],
        { value: amount * 5n },
      );

      const lib = await ethers.getContractAt("ExchangeUtils", contractInstance, owner);
      await expect(tx).to.emit(lib, "PaymentReleased").withArgs(attackerInstance, amount);

      await expect(tx).to.changeEtherBalances([owner, contractInstance, attackerInstance], [-amount, 0, amount]);
    });
  });

  describe("ERC20", function () {
    it("should send ERC20", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const contractInstance = await factory();

      const erc20Instance = await deployERC20();
      await erc20Instance.mint(owner.address, amount);
      await erc20Instance.approve(contractInstance, amount);

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        [receiver.address],
      );

      await expect(tx).to.emit(erc20Instance, "Transfer").withArgs(owner.address, receiver.address, amount);
    });
  });

  describe("ERC721", function () {
    it("should transfer to AOE", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const contractInstance = await factory();

      const erc721Instance = await deployERC721();
      await erc721Instance.mintCommon(owner.address, templateId);
      await erc721Instance.approve(contractInstance, tokenId);

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 2,
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        [receiver.address],
      );

      await expect(tx).to.emit(erc721Instance, "Transfer").withArgs(owner.address, receiver.address, tokenId);
    });

    it("should have reentrancy guard", async function () {
      const [owner] = await ethers.getSigners();
      const contractInstance = await factory();
      const erc721Instance = await deployERC721();

      const attackerFactory = await ethers.getContractFactory("ReentrancyDispenser");
      const attackerInstance = await attackerFactory.deploy(contractInstance, erc721Instance);

      await erc721Instance.mintCommon(owner.address, templateId);
      await erc721Instance.mintCommon(owner.address, templateId);
      await erc721Instance.setApprovalForAll(contractInstance, true);

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 2,
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        [attackerInstance],
      );

      await expect(tx).to.emit(erc721Instance, "Transfer").withArgs(owner.address, attackerInstance, tokenId);

      const ownerOf = await erc721Instance.ownerOf(2);
      expect(ownerOf).to.be.equal(owner.address);
    });
  });

  describe("ERC1155", function () {
    it("should transfer to AOE", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const contractInstance = await factory();

      const erc1155Instance = await deployERC1155();
      await erc1155Instance.mint(owner.address, tokenId, amount, "0x");
      await erc1155Instance.setApprovalForAll(contractInstance, true);

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 4,
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        [receiver.address],
      );

      await expect(tx)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(contractInstance, owner.address, receiver.address, tokenId, amount);
    });

    it("should have reentrancy guard", async function () {
      const [owner] = await ethers.getSigners();
      const contractInstance = await factory();
      const erc1155Instance = await deployERC1155();

      const attackerFactory = await ethers.getContractFactory("ReentrancyDispenser");
      const attackerInstance = await attackerFactory.deploy(contractInstance, erc1155Instance);

      await erc1155Instance.mint(owner.address, tokenId, amount * 2n, "0x");
      await erc1155Instance.setApprovalForAll(contractInstance, true);

      const tx = contractInstance.disperse(
        [
          {
            tokenType: 4,
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        [attackerInstance],
      );

      await expect(tx)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(contractInstance, owner.address, attackerInstance, tokenId, amount);
    });
  });

  shouldSupportsInterface(factory)([InterfaceId.IERC165, FrameworkInterfaceId.Dispenser]);
});
