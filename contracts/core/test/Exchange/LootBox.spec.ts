import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, Contract, encodeBytes32String, keccak256, ZeroAddress } from "ethers";

import { amount, MINTER_ROLE } from "@gemunion/contracts-constants";

import { deployDiamond, deployErc721Base, wrapOneToManyToManySignature } from "./shared";
import { isEqualEventArgArrObj, isEqualEventArgObj } from "../utils";
import { expiresAt, externalId, extra, params, tokenId } from "../constants";

describe("Diamond Exchange LootBox", function () {
  const factory = async (facetName = "ExchangeLootBoxFacet"): Promise<any> => {
    const diamondInstance = await deployDiamond(
      "DiamondExchange",
      [facetName, "AccessControlFacet", "PausableFacet"],
      "DiamondExchangeInit",
      {
        logSelectors: false,
      },
    );
    return ethers.getContractAt(facetName, diamondInstance);
  };

  const getSignatures = async (contractInstance: Contract) => {
    const [owner] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    return wrapOneToManyToManySignature(network, contractInstance, "EXCHANGE", owner);
  };

  describe("LootBox", function () {
    describe("NATIVE > LOOTBOX > ERC721", function () {
      it("should purchase lootbox", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);

        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);
        const lootBoxInstance = await deployErc721Base("ERC721LootBoxSimpleHardhat", exchangeInstance);

        const boxConfig = {
          max: 1,
          min: 1,
        };

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          item: {
            tokenType: 2,
            token: await lootBoxInstance.getAddress(),
            tokenId,
            amount: 1,
          },
          price: [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount,
            },
          ],
          content: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          config: keccak256(AbiCoder.defaultAbiCoder().encode(["uint128", "uint128"], [boxConfig.min, boxConfig.max])),
        });

        const tx1 = exchangeInstance.connect(receiver).purchaseLoot(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          {
            tokenType: 2,
            token: lootBoxInstance,
            tokenId,
            amount: 1,
          },
          [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount,
            },
          ],
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          boxConfig,
          signature,
          {
            value: amount,
          },
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "PurchaseLootBox")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgObj({
              tokenType: 2n,
              token: await lootBoxInstance.getAddress(),
              tokenId,
              amount: 1n,
            }),
            isEqualEventArgArrObj({
              tokenType: 0n,
              token: ZeroAddress,
              tokenId,
              amount,
            }),
            isEqualEventArgArrObj({
              tokenType: 2n,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1n,
            }),
          )
          .to.emit(lootBoxInstance, "Transfer")
          .withArgs(ZeroAddress, receiver.address, tokenId);

        await expect(tx1).to.changeEtherBalances([owner, receiver], [amount, -amount]);
      });
    });

    describe("ERROR", function () {
      it("should fail: SignerMissingRole", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);

        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);
        const lootBoxInstance = await deployErc721Base("ERC721LootBoxSimpleHardhat", exchangeInstance);

        const boxConfig = {
          min: 1,
          max: 5,
        };

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          item: {
            tokenType: 2,
            token: await lootBoxInstance.getAddress(),
            tokenId,
            amount: 1,
          },
          price: [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount,
            },
          ],
          content: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          config: keccak256(AbiCoder.defaultAbiCoder().encode(["uint128", "uint128"], [boxConfig.min, boxConfig.max])),
        });

        const accessInstance = await ethers.getContractAt("AccessControlFacet", exchangeInstance);
        await accessInstance.renounceRole(MINTER_ROLE, owner.address);

        const tx1 = exchangeInstance.connect(receiver).purchaseLoot(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          {
            tokenType: 2,
            token: lootBoxInstance,
            tokenId,
            amount: 1,
          },
          [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount,
            },
          ],
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          boxConfig,
          signature,
          {
            value: amount,
          },
        );

        await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "SignerMissingRole");
      });

      it("should fail: EnforcedPause", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);

        const pausableInstance = await ethers.getContractAt("PausableFacet", exchangeInstance);
        await pausableInstance.pause();

        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);
        const lootBoxInstance = await deployErc721Base("ERC721LootBoxSimpleHardhat", exchangeInstance);

        const boxConfig = {
          min: 1,
          max: 5,
        };

        const signature = await generateSignature({
          account: receiver.address,
          params,
          item: {
            tokenType: 2,
            token: await lootBoxInstance.getAddress(),
            tokenId,
            amount: 1,
          },
          price: [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount,
            },
          ],
          content: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          config: keccak256(AbiCoder.defaultAbiCoder().encode(["uint128", "uint128"], [boxConfig.min, boxConfig.max])),
        });

        const tx1 = exchangeInstance.connect(receiver).purchaseLoot(
          params,
          {
            tokenType: 2,
            token: lootBoxInstance,
            tokenId,
            amount: 1,
          },
          [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount,
            },
          ],
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          boxConfig,
          signature,
          {
            value: amount,
          },
        );

        await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "EnforcedPause");
      });
    });
  });
});
