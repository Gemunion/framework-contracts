import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, encodeBytes32String, ZeroAddress, ZeroHash, toBeHex } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";
import { amount, MINTER_ROLE } from "@ethberry/contracts-constants";

import { expiresAt, externalId, extra, tokenId } from "../constants";
import { getBytesNumbersArr, getContractName, getNumbersBytes, isEqualEventArgObj } from "../utils";
import { deployERC20 } from "../ERC20/shared/fixtures";
import { deployERC721 } from "../ERC721/shared/fixtures";
import { decodeMetadata } from "../shared/metadata";
import { deployDiamond, wrapOneToOneSignature } from "./shared";

describe("Diamond Exchange Lottery", function () {
  const factory = async (facetName = "ExchangeLotteryFacet"): Promise<any> => {
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

  const getSignatures = async (contractInstance: Contract, contractName = "EXCHANGE") => {
    const [owner] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    return wrapOneToOneSignature(network, contractInstance, contractName, owner);
  };

  describe("Purchase lottery", function () {
    it("should purchase lottery", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployERC20();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const lotteryFactory = await ethers.getContractFactory(getContractName("Lottery", network.name));

      const lotteryConfig = {
        timeLagBeforeRelease: 2592000, // production: release after 2592000 seconds = 30 days
        commission: 30, // lottery wallet gets 30% commission from each round balance
      };
      const lotteryInstance: any = await lotteryFactory.deploy(lotteryConfig);
      await lotteryInstance.startRound(
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 1n,
          amount,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        0, // maxTicket count
      );

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance.target, amount);

      await lotteryInstance.grantRole(MINTER_ROLE, exchangeInstance.target);
      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance.target);

      const values = [1, 2, 3, 4, 5, 6];
      const ticketNumbers = getNumbersBytes(values);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra: ticketNumbers,
          receiver: await lotteryInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2n,
          token: await erc721TicketInstance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 121n,
          amount,
        },
      });

      const tx1 = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra: ticketNumbers,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );

      await expect(tx1)
        .to.emit(exchangeInstance, "PurchaseLottery")
        .withArgs(
          receiver,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721TicketInstance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 121n,
            amount: amount * 1n,
          }),
        );

      const balance = await erc20Instance.balanceOf(lotteryInstance);
      expect(balance).to.equal(amount * 1n);

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721TicketInstance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.ROUND).to.equal(1n);
      expect(toBeHex(decodedMeta.NUMBERS, 32)).to.equal(ticketNumbers);
      expect(getBytesNumbersArr(decodedMeta.NUMBERS)).to.have.all.members(values);
    });

    it("should fail: wrong signer", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc20Instance = await deployERC20();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const lotteryFactory = await ethers.getContractFactory(getContractName("Lottery", network.name));

      const lotteryConfig = {
        timeLagBeforeRelease: 2592000, // production: release after 2592000 seconds = 30 days
        commission: 30, // lottery wallet gets 30% commission from each round balance
      };
      const lotteryInstance: any = await lotteryFactory.deploy(lotteryConfig);
      await lotteryInstance.startRound(
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 1n,
          amount,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        0, // maxTicket count
      );

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance.target, amount);

      await lotteryInstance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance.target);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await lotteryInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 0n,
          token: await lotteryInstance.getAddress(),
          tokenId: 0,
          amount: 0,
        },
        price: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 121n,
          amount,
        },
      });
      const tx1 = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce1"), // wrong one
          extra,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 0n,
          token: lotteryInstance,
          tokenId: 0,
          amount: 0,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "SignerMissingRole");
    });

    it("should fail: wrong signature", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();

      const erc20Instance = await deployERC20();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const lotteryFactory = await ethers.getContractFactory(getContractName("Lottery", network.name));

      const lotteryConfig = {
        timeLagBeforeRelease: 2592000, // production: release after 2592000 seconds = 30 days
        commission: 30, // lottery wallet gets 30% commission from each round balance
      };
      const lotteryInstance: any = await lotteryFactory.deploy(lotteryConfig);
      await lotteryInstance.startRound(
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 1n,
          amount,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        0, // maxTicket count
      );

      const signature = encodeBytes32String("signature");

      const tx = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: ZeroAddress,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );
      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "ECDSAInvalidSignatureLength");
    });

    it("should fail: ExpiredNonce", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc20Instance = await deployERC20();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const lotteryFactory = await ethers.getContractFactory(getContractName("Lottery", network.name));

      const lotteryConfig = {
        timeLagBeforeRelease: 2592000, // production: release after 2592000 seconds = 30 days
        commission: 30, // lottery wallet gets 30% commission from each round balance
      };
      const lotteryInstance: any = await lotteryFactory.deploy(lotteryConfig);
      await lotteryInstance.startRound(
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 1n,
          amount,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        0, // maxTicket count
      );

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance.target, amount);

      await lotteryInstance.grantRole(MINTER_ROLE, exchangeInstance.target);
      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance.target);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await lotteryInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2n,
          token: await erc721TicketInstance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 121n,
          amount,
        },
      });
      const tx1 = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );
      // event PurchaseLottery(address account, Asset item, Asset price, uint256 round, bytes32 numbers);
      await expect(tx1)
        .to.emit(exchangeInstance, "PurchaseLottery")
        .withArgs(
          receiver,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721TicketInstance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 121n,
            amount: amount * 1n,
          }),
        );

      const tx2 = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );
      await expect(tx2).to.be.revertedWithCustomError(exchangeInstance, "ExpiredNonce");
    });

    it("should fail: ERC20InsufficientAllowance", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc20Instance = await deployERC20();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const lotteryFactory = await ethers.getContractFactory(getContractName("Lottery", network.name));

      const lotteryConfig = {
        timeLagBeforeRelease: 2592000, // production: release after 2592000 seconds = 30 days
        commission: 30, // lottery wallet gets 30% commission from each round balance
      };
      const lotteryInstance: any = await lotteryFactory.deploy(lotteryConfig);
      await lotteryInstance.startRound(
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 1n,
          amount,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        0, // maxTicket count
      );

      await erc20Instance.mint(receiver, amount);
      // await erc20Instance.connect(receiver).approve(exchangeInstance.target, amount);

      await lotteryInstance.grantRole(MINTER_ROLE, exchangeInstance.target);
      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance.target);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await lotteryInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2n,
          token: await erc721TicketInstance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 121n,
          amount,
        },
      });

      const tx1 = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );
      await expect(tx1)
        .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientAllowance")
        .withArgs(exchangeInstance, 0, amount);
    });

    it("should fail: ERC20InsufficientBalance", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc20Instance = await deployERC20();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const lotteryFactory = await ethers.getContractFactory(getContractName("Lottery", network.name));

      const lotteryConfig = {
        timeLagBeforeRelease: 2592000, // production: release after 2592000 seconds = 30 days
        commission: 30, // lottery wallet gets 30% commission from each round balance
      };
      const lotteryInstance: any = await lotteryFactory.deploy(lotteryConfig);
      await lotteryInstance.startRound(
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 1n,
          amount,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        0, // maxTicket count
      );

      await erc20Instance.connect(receiver).approve(exchangeInstance.target, amount);

      await lotteryInstance.grantRole(MINTER_ROLE, exchangeInstance.target);
      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance.target);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await lotteryInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2n,
          token: await erc721TicketInstance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 121n,
          amount,
        },
      });

      const tx1 = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );

      await expect(tx1)
        .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientBalance")
        .withArgs(receiver, 0, amount);
    });

    it("should fail: SignerMissingRole", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc20Instance = await deployERC20();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const lotteryFactory = await ethers.getContractFactory(getContractName("Lottery", network.name));

      const lotteryConfig = {
        timeLagBeforeRelease: 2592000, // production: release after 2592000 seconds = 30 days
        commission: 30, // lottery wallet gets 30% commission from each round balance
      };
      const lotteryInstance: any = await lotteryFactory.deploy(lotteryConfig);
      await lotteryInstance.startRound(
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 1n,
          amount,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        0, // maxTicket count
      );

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance.target, amount);

      await lotteryInstance.grantRole(MINTER_ROLE, exchangeInstance.target);
      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance.target);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await lotteryInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2n,
          token: await erc721TicketInstance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 121n,
          amount,
        },
      });

      const accessInstance = await ethers.getContractAt("AccessControlFacet", exchangeInstance);
      await accessInstance.renounceRole(MINTER_ROLE, owner);

      const tx1 = exchangeInstance.connect(receiver).purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: lotteryInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: erc721TicketInstance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: erc20Instance,
          tokenId: 121n,
          amount,
        },
        signature,
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "SignerMissingRole");
    });
  });

  describe("ERROR", function () {
    it("should fail: EnforcedPause", async function () {
      const exchangeInstance = await factory();
      const pausableInstance = await ethers.getContractAt("PausableFacet", exchangeInstance);

      await pausableInstance.pause();

      const tx1 = exchangeInstance.purchaseLottery(
        {
          externalId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: ZeroAddress,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2n,
          token: ZeroAddress,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1n,
          token: ZeroAddress,
          tokenId: 121n,
          amount,
        },
        ZeroHash,
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "EnforcedPause");
    });
  });
});
