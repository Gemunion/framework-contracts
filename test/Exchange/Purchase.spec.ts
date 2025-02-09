import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ZeroAddress, ZeroHash } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { amount, METADATA_ROLE, MINTER_ROLE, nonce } from "@ethberry/contracts-constants";
import { recursivelyDecodeResult } from "@framework/utils-eth";

import { deployDiamond, deployErc20Base, deployErc721Base, wrapOneToManySignature } from "./shared";
import { expiresAt, externalId, extra, params, tokenId } from "../constants";
import { isEqualEventArgArrObj, isEqualEventArgObj } from "../utils";
import { deployERC1363 } from "../ERC20/shared/fixtures";
import { decodeMetadata } from "../shared/metadata";

describe("Diamond Exchange Purchase", function () {
  const factory = async (facetName = "ExchangePurchaseFacet"): Promise<any> => {
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
    return wrapOneToManySignature(network, contractInstance, "EXCHANGE", owner);
  };

  describe("exchange purchase", function () {
    it("should purchase ERC721 Simple for ERC20 (no ref)", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const erc20Instance = await deployERC1363("ERC20Simple");
      await erc20Instance.mint(receiver.address, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      const erc20Allowance = await erc20Instance.allowance(receiver.address, exchangeInstance);
      expect(erc20Allowance).to.equal(amount);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1,
        },
        price: [
          {
            tokenType: 1,
            token: await erc20Instance.getAddress(),
            tokenId: 0,
            amount,
          },
        ],
      });

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId: 0,
            amount,
          },
        ],
        signature,
      );
      await expect(tx1).to.emit(exchangeInstance, "Purchase");
      await expect(tx1).not.to.emit(exchangeInstance, "ReferralEvent");

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721Instance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.TEMPLATE_ID).to.equal(tokenId);

      const balance = await erc721Instance.balanceOf(receiver.address);
      expect(balance).to.equal(1);
    });

    it("should purchase ERC721 Simple for ERC20 (ref)", async function () {
      const [owner, receiver, stranger] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const erc20Instance = await deployERC1363("ERC20Simple");
      await erc20Instance.mint(receiver.address, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      const erc20Allowance = await erc20Instance.allowance(receiver.address, exchangeInstance);
      expect(erc20Allowance).to.equal(amount);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: stranger.address,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1,
        },
        price: [
          {
            tokenType: 1,
            token: await erc20Instance.getAddress(),
            tokenId: 0,
            amount,
          },
        ],
      });

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: stranger.address,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId: 0,
            amount,
          },
        ],
        signature,
      );

      await expect(tx1)
        .to.emit(exchangeInstance, "Purchase")
        .to.emit(exchangeInstance, "ReferralEvent")
        .withArgs(
          receiver,
          stranger.address,
          isEqualEventArgArrObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount,
          }),
        );
      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721Instance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.TEMPLATE_ID).to.equal(tokenId);

      const balance = await erc721Instance.balanceOf(receiver.address);
      expect(balance).to.equal(1);
    });

    it("should purchase, spend ERC20", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1n,
        },
        price: [
          {
            tokenType: 1,
            token: await erc20Instance.getAddress(),
            tokenId,
            amount,
          },
        ],
      });

      await erc20Instance.mint(receiver.address, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        signature,
      );

      await expect(tx1)
        .to.emit(exchangeInstance, "Purchase")
        .withArgs(
          receiver.address,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgArrObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId,
            amount,
          }),
        );
    });

    it("should purchase, spend ETH", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1n,
        },
        price: [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
      });

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        signature,
        { value: 123000000000000000n },
      );

      await expect(tx1)
        .to.emit(exchangeInstance, "Purchase")
        .withArgs(
          receiver.address,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgArrObj({
            tokenType: 0n,
            token: ZeroAddress,
            tokenId,
            amount,
          }),
        );
    });

    it("should fail: ExpiredNonce", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
      await erc20Instance.mint(receiver.address, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1n,
        },
        price: [
          {
            tokenType: 1,
            token: await erc20Instance.getAddress(),
            tokenId,
            amount,
          },
        ],
      });

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        signature,
      );

      await expect(tx1).to.emit(exchangeInstance, "Purchase");

      const tx2 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        signature,
      );
      await expect(tx2).to.be.revertedWithCustomError(exchangeInstance, "ExpiredNonce");
    });

    it("should fail: SignerMissingRole", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1n,
        },
        price: [
          {
            tokenType: 1,
            token: await erc20Instance.getAddress(),
            tokenId,
            amount,
          },
        ],
      });

      const accessInstance = await ethers.getContractAt("AccessControlFacet", exchangeInstance);
      await accessInstance.renounceRole(MINTER_ROLE, owner.address);

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        signature,
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "SignerMissingRole");
    });

    it("should fail: ERC20InsufficientAllowance", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1n,
        },
        price: [
          {
            tokenType: 1,
            token: await erc20Instance.getAddress(),
            tokenId,
            amount,
          },
        ],
      });

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        signature,
      );

      await expect(tx1)
        .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientAllowance")
        .withArgs(exchangeInstance, 0, amount);
    });

    it("should fail: ECDSAInvalidSignatureLength", async function () {
      const [owner] = await ethers.getSigners();

      const exchangeInstance = await factory();

      const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const tx = exchangeInstance.purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        ZeroHash,
      );

      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "ECDSAInvalidSignatureLength");
    });

    it("should fail: ExpiredSignature", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      const expiresAt = (await time.latest()).toString();

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1n,
        },
        price: [
          {
            tokenType: 1,
            token: await erc20Instance.getAddress(),
            tokenId,
            amount,
          },
        ],
      });

      const tx = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        signature,
      );

      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "ExpiredSignature");
    });

    it("should purchase", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

      await erc721Instance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721Instance.grantRole(METADATA_ROLE, exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId,
          amount: 1n,
        },
        price: [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
      });

      const tx1 = exchangeInstance.connect(receiver).purchase(
        {
          externalId,
          expiresAt,
          nonce,
          extra,
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        },
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        signature,
        { value: amount, gasLimit: 500000 },
      );

      await expect(tx1)
        .to.emit(exchangeInstance, "Purchase")
        .withArgs(
          receiver.address,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgArrObj({
            tokenType: 0n,
            token: ZeroAddress,
            tokenId,
            amount,
          }),
        );

      await expect(tx1).to.changeEtherBalances([receiver, owner], [-amount, amount]);
    });
  });

  describe("ERROR", function () {
    it("should fail: EnforcedPause", async function () {
      const exchangeInstance = await factory();
      const pausableInstance = await ethers.getContractAt("PausableFacet", exchangeInstance);

      await pausableInstance.pause();

      const tx1 = exchangeInstance.purchase(
        params,
        {
          tokenType: 0,
          token: ZeroAddress,
          tokenId,
          amount,
        },
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        ZeroHash,
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "EnforcedPause");
    });
  });
});
