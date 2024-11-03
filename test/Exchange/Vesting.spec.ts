import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, Contract, keccak256, ZeroAddress } from "ethers";

import { amount, nonce } from "@ethberry/contracts-constants";
import { recursivelyDecodeResult } from "@ethberry/utils-eth";

import { deployDiamond, deployErc721Base, wrapOneToManyToManySignature } from "./shared";
import { expiresAt, externalId, extra, tokenId } from "../constants";
import { isEqualEventArgArrObj, isEqualEventArgObj } from "../utils";
import { deployERC1363 } from "../ERC20/shared/fixtures";

describe("Diamond Exchange Vesting", function () {
  const factory = async (facetName = "ExchangeVestingFacet"): Promise<any> => {
    const diamondInstance = await deployDiamond(
      "DiamondExchange",
      [facetName, "AccessControlFacet", "PausableFacet", "WalletFacet", "DiamondLoupeFacet"],
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

  describe("exchange purchase", function () {
    it("should purchase, spend NATIVE for ERC20", async function () {
      const [_owner, merchant, buyer] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployERC1363("ERC20Simple");

      const erc721Instance = await deployErc721Base("ERC721Vesting", exchangeInstance);

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const boxConfig = {
        functionType: 1n,
        cliff: 1n,
        startTimestamp: currentTimestamp + 3600,
        duration: 3600n * 10n,
        period: 3600n,
        afterCliffBasisPoints: 10n,
        growthRate: 200n,
      };

      const params = {
        externalId,
        expiresAt,
        nonce,
        extra,
        receiver: merchant.address,
        referrer: ZeroAddress,
      };

      const item = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId,
        amount: 1n,
      };

      const price = [
        {
          tokenType: 0,
          token: ZeroAddress,
          tokenId,
          amount,
        },
      ];

      const content = [
        {
          tokenType: 1,
          token: erc20Instance.target,
          tokenId,
          amount,
        },
      ];

      const signature = await generateSignature({
        account: buyer.address,
        params,
        item,
        price,
        content,
        config: keccak256(
          AbiCoder.defaultAbiCoder().encode(
            ["uint8", "uint128", "uint64", "uint64", "uint64", "uint16", "uint16"],
            [
              boxConfig.functionType,
              boxConfig.cliff,
              boxConfig.startTimestamp,
              boxConfig.duration,
              boxConfig.period,
              boxConfig.afterCliffBasisPoints,
              boxConfig.growthRate,
            ],
          ),
        ),
      });

      await erc20Instance.mint(merchant, amount);
      await erc20Instance.connect(merchant).approve(exchangeInstance, amount);

      const tx1 = exchangeInstance.connect(buyer).purchaseVesting(params, item, price, content, boxConfig, signature, {
        value: amount,
      });

      await expect(tx1)
        .to.emit(exchangeInstance, "PurchaseVesting")
        .withArgs(
          buyer,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: erc721Instance.target,
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
            tokenType: 1n,
            token: erc20Instance.target,
            tokenId,
            amount,
          }),
        );

      await expect(tx1).to.emit(erc20Instance, "Approval").withArgs(exchangeInstance, erc721Instance, amount);
      await expect(tx1).to.emit(erc721Instance, "Transfer").withArgs(ZeroAddress, buyer, tokenId);
      await expect(tx1).to.changeEtherBalances([buyer, merchant], [-amount, amount]);
      await expect(tx1).to.changeTokenBalances(erc20Instance, [merchant, erc721Instance], [-amount, amount]);

      const boxConfigData = recursivelyDecodeResult(await erc721Instance.getVestingData(tokenId));
      expect(boxConfigData).to.deep.equal(boxConfig);
    });

    it("should purchase, spend ERC20 for ERC20", async function () {
      const [_owner, merchant, buyer] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployERC1363("ERC20Simple");
      const priceErc20Instance = await deployERC1363("ERC20Simple");

      const erc721Instance = await deployErc721Base("ERC721Vesting", exchangeInstance);

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const boxConfig = {
        functionType: 1n,
        cliff: 1n,
        startTimestamp: currentTimestamp + 3600,
        duration: 3600n * 10n,
        period: 3600n,
        afterCliffBasisPoints: 10n,
        growthRate: 200n,
      };

      await erc20Instance.mint(merchant, amount);
      await erc20Instance.connect(merchant).approve(exchangeInstance, amount);

      const params = {
        externalId,
        expiresAt,
        nonce,
        extra,
        receiver: merchant.address,
        referrer: ZeroAddress,
      };

      const item = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId,
        amount: 1n,
      };

      const price = [
        {
          tokenType: 1,
          token: priceErc20Instance.target,
          tokenId,
          amount,
        },
      ];

      const content = [
        {
          tokenType: 1,
          token: erc20Instance.target,
          tokenId,
          amount,
        },
      ];

      const signature = await generateSignature({
        account: buyer.address,
        params,
        item,
        price,
        content,
        config: keccak256(
          AbiCoder.defaultAbiCoder().encode(
            ["uint8", "uint128", "uint64", "uint64", "uint64", "uint16", "uint16"],
            [
              boxConfig.functionType,
              boxConfig.cliff,
              boxConfig.startTimestamp,
              boxConfig.duration,
              boxConfig.period,
              boxConfig.afterCliffBasisPoints,
              boxConfig.growthRate,
            ],
          ),
        ),
      });

      await priceErc20Instance.mint(buyer, amount);
      await priceErc20Instance.connect(buyer).approve(exchangeInstance, amount);

      const tx1 = exchangeInstance.connect(buyer).purchaseVesting(params, item, price, content, boxConfig, signature);

      await expect(tx1)
        .to.emit(exchangeInstance, "PurchaseVesting")
        .withArgs(
          buyer,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: erc721Instance.target,
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgArrObj({
            tokenType: 1n,
            token: priceErc20Instance.target,
            tokenId,
            amount,
          }),
          isEqualEventArgArrObj({
            tokenType: 1n,
            token: erc20Instance.target,
            tokenId,
            amount,
          }),
        );

      await expect(tx1).to.emit(erc20Instance, "Approval").withArgs(exchangeInstance, erc721Instance, amount);
      await expect(tx1).to.emit(erc721Instance, "Transfer").withArgs(ZeroAddress, buyer, tokenId);
      await expect(tx1).to.changeTokenBalances(priceErc20Instance, [buyer, merchant], [-amount, amount]);
      await expect(tx1).to.changeTokenBalances(erc20Instance, [merchant, erc721Instance], [-amount, amount]);

      const boxConfigData = recursivelyDecodeResult(await erc721Instance.getVestingData(tokenId));
      expect(boxConfigData).to.deep.equal(boxConfig);
    });

    it("should fail: ETHInsufficientBalance when NATIVE payment less than price", async function () {
      const [_owner, merchant, buyer] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployERC1363("ERC20Simple");

      const erc721Instance = await deployErc721Base("ERC721Vesting", exchangeInstance);

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const boxConfig = {
        functionType: 1n,
        cliff: 1n,
        startTimestamp: currentTimestamp + 3600,
        duration: 3600n * 10n,
        period: 3600n,
        afterCliffBasisPoints: 10n,
        growthRate: 200n,
      };

      const params = {
        externalId,
        expiresAt,
        nonce,
        extra,
        receiver: merchant.address,
        referrer: ZeroAddress,
      };

      const item = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId,
        amount: 1n,
      };

      const price = [
        {
          tokenType: 0,
          token: ZeroAddress,
          tokenId,
          amount,
        },
      ];

      const content = [
        {
          tokenType: 1,
          token: erc20Instance.target,
          tokenId,
          amount,
        },
      ];

      const signature = await generateSignature({
        account: buyer.address,
        params,
        item,
        price,
        content,
        config: keccak256(
          AbiCoder.defaultAbiCoder().encode(
            ["uint8", "uint128", "uint64", "uint64", "uint64", "uint16", "uint16"],
            [
              boxConfig.functionType,
              boxConfig.cliff,
              boxConfig.startTimestamp,
              boxConfig.duration,
              boxConfig.period,
              boxConfig.afterCliffBasisPoints,
              boxConfig.growthRate,
            ],
          ),
        ),
      });

      await erc20Instance.mint(merchant, amount);
      await erc20Instance.connect(merchant).approve(exchangeInstance, amount);

      const insufficientAmount = amount - 1n;

      await expect(
        exchangeInstance.connect(buyer).purchaseVesting(params, item, price, content, boxConfig, signature, {
          value: insufficientAmount,
        }),
      ).to.be.revertedWithCustomError(exchangeInstance, "ETHInsufficientBalance");
    });

    it("should fail: ERC20InsufficientBalance when ERC20 payment less than price", async function () {
      const [_owner, merchant, buyer] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployERC1363("ERC20Simple");
      const priceErc20Instance = await deployERC1363("ERC20Simple");

      const erc721Instance = await deployErc721Base("ERC721Vesting", exchangeInstance);

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const boxConfig = {
        functionType: 1n,
        cliff: 1n,
        startTimestamp: currentTimestamp + 3600,
        duration: 3600n * 10n,
        period: 3600n,
        afterCliffBasisPoints: 10n,
        growthRate: 200n,
      };

      await erc20Instance.mint(merchant, amount);
      await erc20Instance.connect(merchant).approve(exchangeInstance, amount);

      const params = {
        externalId,
        expiresAt,
        nonce,
        extra,
        receiver: merchant.address,
        referrer: ZeroAddress,
      };

      const item = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId,
        amount: 1n,
      };

      const price = [
        {
          tokenType: 1,
          token: priceErc20Instance.target,
          tokenId,
          amount,
        },
      ];

      const content = [
        {
          tokenType: 1,
          token: erc20Instance.target,
          tokenId,
          amount,
        },
      ];

      const signature = await generateSignature({
        account: buyer.address,
        params,
        item,
        price,
        content,
        config: keccak256(
          AbiCoder.defaultAbiCoder().encode(
            ["uint8", "uint128", "uint64", "uint64", "uint64", "uint16", "uint16"],
            [
              boxConfig.functionType,
              boxConfig.cliff,
              boxConfig.startTimestamp,
              boxConfig.duration,
              boxConfig.period,
              boxConfig.afterCliffBasisPoints,
              boxConfig.growthRate,
            ],
          ),
        ),
      });

      const insufficientAmount = amount - 1n;
      await priceErc20Instance.mint(buyer, insufficientAmount);
      await priceErc20Instance.connect(buyer).approve(exchangeInstance, amount);

      await expect(
        exchangeInstance.connect(buyer).purchaseVesting(params, item, price, content, boxConfig, signature),
      ).to.be.revertedWithCustomError(priceErc20Instance, "ERC20InsufficientBalance");
    });
  });
});
