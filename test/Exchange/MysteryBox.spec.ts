import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, Contract, encodeBytes32String, keccak256, ZeroAddress } from "ethers";

import { amount, MINTER_ROLE } from "@ethberry/contracts-constants";

import { deployDiamond, deployErc20Base, deployErc721Base, wrapOneToManyToManySignature } from "./shared";
import { isEqualEventArgArrObj, isEqualEventArgObj } from "../utils";
import { expiresAt, externalId, extra, params, tokenId } from "../constants";

describe("Diamond Exchange MysteryBox", function () {
  const factory = async (facetName = "ExchangeMysteryBoxFacet"): Promise<any> => {
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

  describe("MysteryBox", function () {
    describe("NATIVE > MYSTERYBOX > ERC721", function () {
      it("should purchase mysterybox", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);

        const erc721Instance = await deployErc721Base("ERC721Random", exchangeInstance);
        const mysteryBoxInstance = await deployErc721Base("ERC721MysteryBoxSimple", exchangeInstance);

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
            token: await mysteryBoxInstance.getAddress(),
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
          config: keccak256(AbiCoder.defaultAbiCoder().encode([], [])),
        });

        const tx1 = exchangeInstance.connect(receiver).purchaseMystery(
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
            token: mysteryBoxInstance,
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
          signature,
          {
            value: amount,
          },
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "PurchaseMysteryBox")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgObj({
              tokenType: 2n,
              token: await mysteryBoxInstance.getAddress(),
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
          .to.emit(mysteryBoxInstance, "Transfer")
          .withArgs(ZeroAddress, receiver.address, tokenId);

        await expect(tx1).to.changeEtherBalances([owner, receiver], [amount, -amount]);
      });
    });

    describe("NATIVE + ERC20 > MYSTERYBOX > ERC721 + ERC998", function () {
      it("should purchase mysterybox", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);

        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Random", exchangeInstance);
        const erc998Instance = await deployErc721Base("ERC998Random", exchangeInstance);

        const mysteryBoxInstance = await deployErc721Base("ERC721MysteryBoxSimple", exchangeInstance);

        await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

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
            token: await mysteryBoxInstance.getAddress(),
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
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
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
            {
              tokenType: 3,
              token: await erc998Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          config: keccak256(AbiCoder.defaultAbiCoder().encode([], [])),
        });

        const tx1 = exchangeInstance.connect(receiver).purchaseMystery(
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
            token: mysteryBoxInstance,
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
            {
              tokenType: 1,
              token: erc20Instance,
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
            {
              tokenType: 3,
              token: erc998Instance,
              tokenId,
              amount: 1,
            },
          ],
          signature,
          {
            value: amount,
          },
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "PurchaseMysteryBox")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgObj({
              tokenType: 2n,
              token: await mysteryBoxInstance.getAddress(),
              tokenId,
              amount: 1n,
            }),
            isEqualEventArgArrObj(
              {
                tokenType: 0n,
                token: ZeroAddress,
                tokenId,
                amount,
              },
              {
                tokenType: 1n,
                token: await erc20Instance.getAddress(),
                tokenId,
                amount,
              },
            ),
            isEqualEventArgArrObj(
              {
                tokenType: 2n,
                token: await erc721Instance.getAddress(),
                tokenId,
                amount: 1n,
              },
              {
                tokenType: 3n,
                token: await erc998Instance.getAddress(),
                tokenId,
                amount: 1n,
              },
            ),
          )
          .to.emit(mysteryBoxInstance, "Transfer")
          .withArgs(ZeroAddress, receiver.address, tokenId)
          .to.emit(erc20Instance, "Transfer")
          .withArgs(receiver.address, owner.address, amount);
        await expect(tx1).changeEtherBalances([owner, receiver], [amount, -amount]);
        await expect(tx1).changeTokenBalances(erc20Instance, [owner, receiver], [amount, -amount]);
      });
    });
  });

  describe("ERROR", function () {
    it("should fail: SignerMissingRole", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);
      const mysteryBoxInstance = await deployErc721Base("ERC721MysteryBoxSimple", exchangeInstance);

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
          token: await mysteryBoxInstance.getAddress(),
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
        config: keccak256(AbiCoder.defaultAbiCoder().encode([], [])),
      });

      const accessInstance = await ethers.getContractAt("AccessControlFacet", exchangeInstance);
      await accessInstance.renounceRole(MINTER_ROLE, owner.address);

      const tx1 = exchangeInstance.connect(receiver).purchaseMystery(
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
          token: mysteryBoxInstance,
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
      const mysteryBoxInstance = await deployErc721Base("ERC721MysteryBoxSimple", exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params,
        item: {
          tokenType: 2,
          token: await mysteryBoxInstance.getAddress(),
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
        config: keccak256(AbiCoder.defaultAbiCoder().encode([], [])),
      });

      const tx1 = exchangeInstance.connect(receiver).purchaseMystery(
        params,
        {
          tokenType: 2,
          token: mysteryBoxInstance,
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
        signature,
        {
          value: amount,
        },
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "EnforcedPause");
    });
  });
});
