import { expect } from "chai";
import { ethers, network } from "hardhat";
import { ZeroAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { amount, MINTER_ROLE } from "@ethberry/contracts-constants";

import { VRFCoordinatorV2PlusMock } from "../../../../../../typechain-types";
import { templateId, tokenId } from "../../../../../constants";
import { randomRequest } from "../../../../../shared/randomRequest";
import { deployLinkVrfFixture } from "../../../../../shared/link";
import { deployERC1155 } from "../../../../../ERC1155/shared/fixtures";
import { deployERC721 } from "../../../../../ERC721/shared/fixtures";
import { deployERC1363 } from "../../../../../ERC20/shared/fixtures";

export function shouldUnpackBox(factory: () => Promise<any>) {
  let vrfInstance: VRFCoordinatorV2PlusMock;
  let subId: bigint;

  const erc20Factory = (name: string) => deployERC1363(name);
  const erc721Factory = (name: string) => deployERC721(name);
  const erc998Factory = (name: string) => deployERC721(name);
  const erc1155Factory = (name: string) => deployERC1155(name);

  describe("Unpack box", function () {
    before(async function () {
      if (network.name === "hardhat") {
        await network.provider.send("hardhat_reset");

        // https://github.com/NomicFoundation/hardhat/issues/2980
        ({ vrfInstance, subId } = await loadFixture(function mysterybox() {
          return deployLinkVrfFixture();
        }));
      }
    });

    it("should fail to unpack: caller is not owner nor approved", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const mysteryBoxInstance = await factory();
      const erc721RandomInstance = await erc721Factory("ERC721Random");
      await erc721RandomInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);

      const tx1 = mysteryBoxInstance.mintBox(owner.address, templateId, [
        {
          tokenType: 2,
          token: erc721RandomInstance,
          tokenId: templateId,
          amount,
        },
      ]);
      await expect(tx1).to.emit(mysteryBoxInstance, "Transfer").withArgs(ZeroAddress, owner.address, tokenId);

      const tx2 = mysteryBoxInstance.connect(receiver).unpack(tokenId);
      await expect(tx2)
        .to.be.revertedWithCustomError(mysteryBoxInstance, "ERC721InsufficientApproval")
        .withArgs(receiver.address, tokenId);
    });

    describe("NATIVE", function () {
      it("should mint/unpack", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const mysteryBoxInstance = await factory();

        const tx1 = mysteryBoxInstance.mintBox(receiver.address, templateId, [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId: templateId,
            amount,
          },
        ]);
        await expect(tx1).to.revertedWithCustomError(mysteryBoxInstance, "UnsupportedTokenType");
      });
    });

    describe("ERC20", function () {
      it("should mint/unpack", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const mysteryBoxInstance = await factory();
        const erc20SimpleInstance = await erc20Factory("ERC20Simple");
        await erc20SimpleInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);
        await erc20SimpleInstance.mint(mysteryBoxInstance, amount);

        const tx1 = mysteryBoxInstance.mintBox(receiver.address, templateId, [
          {
            tokenType: 1,
            token: erc20SimpleInstance,
            tokenId: templateId,
            amount,
          },
        ]);
        await expect(tx1).to.revertedWithCustomError(mysteryBoxInstance, "UnsupportedTokenType");
      });
    });

    describe("ERC721", function () {
      it("should mint/unpack", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const mysteryBoxInstance = await factory();
        const erc721RandomInstance = await erc721Factory("ERC721Random");
        await erc721RandomInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);

        // Set VRFV2 Subscription
        const tx01 = erc721RandomInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(erc721RandomInstance, "VrfSubscriptionSet").withArgs(subId);

        const tx02 = vrfInstance.addConsumer(subId, erc721RandomInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721RandomInstance);

        const tx1 = mysteryBoxInstance.mintBox(receiver.address, templateId, [
          {
            tokenType: 2,
            token: erc721RandomInstance,
            tokenId: templateId,
            amount: 1n,
          },
        ]);

        await expect(tx1).to.emit(mysteryBoxInstance, "Transfer").withArgs(ZeroAddress, receiver.address, tokenId);

        const tx2 = mysteryBoxInstance.connect(receiver).unpack(tokenId);
        await expect(tx2)
          .to.emit(mysteryBoxInstance, "Transfer")
          .withArgs(receiver.address, ZeroAddress, tokenId)
          .to.emit(mysteryBoxInstance, "UnpackMysteryBox")
          .withArgs(receiver.address, tokenId);

        // RANDOM
        await randomRequest(erc721RandomInstance, vrfInstance);

        const balance = await erc721RandomInstance.balanceOf(receiver.address);
        expect(balance).to.equal(1);
      });
    });

    describe("ERC998", function () {
      it("should mint/unpack", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const mysteryBoxInstance = await factory();
        const erc998RandomInstance = await erc998Factory("ERC998Random");
        await erc998RandomInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);

        // Set VRFV2 Subscription
        const tx01 = erc998RandomInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(erc998RandomInstance, "VrfSubscriptionSet").withArgs(subId);

        const tx02 = vrfInstance.addConsumer(subId, erc998RandomInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc998RandomInstance);

        const tx1 = mysteryBoxInstance.mintBox(receiver.address, templateId, [
          {
            tokenType: 2,
            token: erc998RandomInstance,
            tokenId: templateId,
            amount: 1n,
          },
        ]);

        await expect(tx1).to.emit(mysteryBoxInstance, "Transfer").withArgs(ZeroAddress, receiver.address, tokenId);

        const tx2 = mysteryBoxInstance.connect(receiver).unpack(tokenId);
        await expect(tx2)
          .to.emit(mysteryBoxInstance, "Transfer")
          .withArgs(receiver.address, ZeroAddress, tokenId)
          .to.emit(mysteryBoxInstance, "UnpackMysteryBox")
          .withArgs(receiver.address, tokenId);

        await randomRequest(erc998RandomInstance, vrfInstance);

        const balance = await erc998RandomInstance.balanceOf(receiver.address);
        expect(balance).to.equal(1);
      });
    });

    describe("ERC1155", function () {
      it("should mint/unpack", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const mysteryBoxInstance = await factory();
        const erc1155SimpleInstance = await erc1155Factory("ERC1155Simple");

        await erc1155SimpleInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);

        const tx1 = mysteryBoxInstance.mintBox(receiver.address, templateId, [
          {
            tokenType: 4,
            token: erc1155SimpleInstance,
            tokenId: templateId,
            amount,
          },
        ]);
        await expect(tx1).to.revertedWithCustomError(mysteryBoxInstance, "UnsupportedTokenType");
      });
    });

    describe("MIX", function () {
      it("should mint/unpack multiple", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const mysteryBoxInstance = await factory();

        const erc721RandomInstance = await erc721Factory("ERC721Random");
        const erc998RandomInstance = await erc721Factory("ERC998Random");

        // Set VRFV2 Subscription
        const tx01 = erc721RandomInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(erc721RandomInstance, "VrfSubscriptionSet").withArgs(subId);

        const tx02 = vrfInstance.addConsumer(subId, erc721RandomInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721RandomInstance);

        // Set VRFV2 Subscription
        const tx03 = erc998RandomInstance.setSubscriptionId(subId);
        await expect(tx03).to.emit(erc998RandomInstance, "VrfSubscriptionSet").withArgs(subId);

        const tx04 = vrfInstance.addConsumer(subId, erc998RandomInstance);
        await expect(tx04).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc998RandomInstance);

        await erc721RandomInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);
        await erc998RandomInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);

        const tx1 = mysteryBoxInstance.mintBox(receiver.address, templateId, [
          {
            tokenType: 2,
            token: erc721RandomInstance,
            tokenId: templateId,
            amount: 1n,
          },
          {
            tokenType: 3,
            token: erc998RandomInstance,
            tokenId: templateId,
            amount: 1n,
          },
        ]);

        await expect(tx1).to.emit(mysteryBoxInstance, "Transfer").withArgs(ZeroAddress, receiver.address, tokenId);

        const tx2 = mysteryBoxInstance.connect(receiver).unpack(tokenId);
        await expect(tx2)
          .to.emit(mysteryBoxInstance, "Transfer")
          .withArgs(receiver.address, ZeroAddress, tokenId)
          .to.emit(mysteryBoxInstance, "UnpackMysteryBox")
          .withArgs(receiver.address, tokenId)

        // RANDOM
        await randomRequest(erc721RandomInstance, vrfInstance);

        const balance1 = await erc721RandomInstance.balanceOf(receiver.address);
        expect(balance1).to.equal(1);
        const balance2 = await erc998RandomInstance.balanceOf(receiver.address);
        expect(balance2).to.equal(1);
      });
    });
  });
}
