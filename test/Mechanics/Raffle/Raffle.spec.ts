import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, encodeBytes32String, getUint, parseEther, toQuantity, ZeroAddress } from "ethers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { shouldBehaveLikePausable } from "@ethberry/contracts-utils";
import { shouldBehaveLikeAccessControl } from "@ethberry/contracts-access";
import { amount, DEFAULT_ADMIN_ROLE, MINTER_ROLE, nonce, PAUSER_ROLE } from "@ethberry/contracts-constants";
import { recursivelyDecodeResult } from "@framework/utils-eth";
import { delay } from "@ethberry/utils";

import { expiresAt, extra, tokenId } from "../../constants";
import { deployLinkVrfFixture } from "../../shared/link";
import { IERC721Random, VRFCoordinatorV2PlusMock } from "../../../typechain-types";
import { randomRequest } from "../../shared/randomRequest";
import { deployRaffle } from "./fixture";
import { deployDiamond, wrapOneToOneSignature } from "../../Exchange/shared";
import { isEqualEventArgObj } from "../../utils";
import { decodeMetadata } from "../../shared/metadata";

describe("Raffle", function () {
  let vrfInstance: VRFCoordinatorV2PlusMock;
  let subId: bigint;

  const dbRoundId = 101;
  const winnerTokenId = 3;

  const raffleConfig = {
    timeLagBeforeRelease: 100, // production: release after 2592000 seconds = 30 days
    commission: 30, // raffle???
  };

  const factory = async (facetName = "ExchangeRaffleFacet"): Promise<any> => {
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

  const factoryRaffle = () => deployRaffle(raffleConfig);

  const getSignatures = async (contractInstance: Contract) => {
    const [owner] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    return wrapOneToOneSignature(network, contractInstance, "EXCHANGE", owner);
  };

  before(async function () {
    if (network.name === "hardhat") {
      await network.provider.send("hardhat_reset");

      // https://github.com/NomicFoundation/hardhat/issues/2980
      ({ vrfInstance, subId } = await loadFixture(function chainlink() {
        return deployLinkVrfFixture();
      }));
    }
  });

  shouldBehaveLikeAccessControl(async () => {
    const { raffleInstance } = await factoryRaffle();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return raffleInstance;
  })(DEFAULT_ADMIN_ROLE, PAUSER_ROLE);

  shouldBehaveLikePausable(async () => {
    const { raffleInstance } = await factoryRaffle();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return raffleInstance;
  });

  describe("Start Round", function () {
    it("should start new round", async function () {
      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();
      const tx = await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const current: number = await time.latest();
      await expect(tx)
        .to.emit(raffleInstance, "RoundStarted")
        .withArgs(
          1n,
          toQuantity(current),
          0n,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount,
          }),
        );
    });

    it("should fail: not yet finished", async function () {
      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();
      raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );
      const tx = raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );
      await expect(tx).to.be.revertedWithCustomError(raffleInstance, "RaffleRoundNotComplete");
    });
  });

  describe("Finish Round", function () {
    it("should end current round", async function () {
      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, raffleInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        await randomRequest(raffleInstance as IERC721Random, vrfInstance);
      }
    });

    it("should get current round info with 0 tickets", async function () {
      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const tx0 = await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );
      const timeStart: number = await time.latest();

      await expect(tx0)
        .to.emit(raffleInstance, "RoundStarted")
        .withArgs(
          1n,
          toQuantity(timeStart),
          0n,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount,
          }),
        );

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, await raffleInstance.getAddress());
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        await randomRequest(raffleInstance, vrfInstance);
      }

      // emit RoundFinalized(currentRound.roundId, prizeNumber);
      const eventFilter = raffleInstance.filters.RoundFinalized();
      const events = await raffleInstance.queryFilter(eventFilter);
      const { prizeNumber } = recursivelyDecodeResult(events[0].args);
      expect(Number(prizeNumber)).to.equal(0); // Zero if 0 tickets sold
      const roundInfo = await raffleInstance.getCurrentRoundInfo();

      expect(recursivelyDecodeResult(roundInfo)).deep.include({
        roundId: 1n,
        startTimestamp: getUint(timeStart),
        endTimestamp: getUint(current),
        maxTicket: 0n,
        prizeNumber,
        acceptedAsset: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 0n,
          amount,
        },
        ticketAsset: {
          tokenType: 2n,
          token: await erc721Instance.getAddress(),
          tokenId: 1n,
          amount: 1n,
        },
      });
    });

    it("should get current round info with 1 ticket", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(await exchangeInstance.getAddress(), amount);

      await raffleInstance.grantRole(MINTER_ROLE, await exchangeInstance.getAddress());
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());

      const tx0 = await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );
      const timeStart: number = await time.latest();

      await expect(tx0)
        .to.emit(raffleInstance, "RoundStarted")
        .withArgs(
          1n,
          toQuantity(timeStart),
          0n,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount,
          }),
        );

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx1 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx1)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        )
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ZeroAddress, receiver, tokenId);
      await expect(tx1).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, await raffleInstance.getAddress());
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        await randomRequest(raffleInstance, vrfInstance);
      }

      // emit RoundFinalized(currentRound.roundId, prizeNumber);
      const eventFilter = raffleInstance.filters.RoundFinalized();
      const events = await raffleInstance.queryFilter(eventFilter);
      const { prizeNumber } = recursivelyDecodeResult(events[0].args);
      expect(Number(prizeNumber)).to.equal(1); // Zero if 0 tickets sold
      const roundInfo = await raffleInstance.getCurrentRoundInfo();

      expect(recursivelyDecodeResult(roundInfo)).deep.include({
        roundId: 1n,
        startTimestamp: getUint(timeStart),
        endTimestamp: getUint(current),
        maxTicket: 0n,
        prizeNumber,
        acceptedAsset: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 0n,
          amount,
        },
        ticketAsset: {
          tokenType: 2n,
          token: await erc721Instance.getAddress(),
          tokenId: 1n,
          amount: 1n,
        },
      });
    });

    it("should get current round info with 2 tickets", async function () {
      const [_owner, receiver, stranger] = await ethers.getSigners();
      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.mint(stranger, amount);
      await erc20Instance.connect(receiver).approve(await exchangeInstance.getAddress(), amount);
      await erc20Instance.connect(stranger).approve(await exchangeInstance.getAddress(), amount);

      await raffleInstance.grantRole(MINTER_ROLE, await exchangeInstance.getAddress());
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());

      const tx0 = await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );
      const timeStart: number = await time.latest();

      await expect(tx0)
        .to.emit(raffleInstance, "RoundStarted")
        .withArgs(
          1n,
          toQuantity(timeStart),
          0n,
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId,
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount,
          }),
        );

      // GENERATE 1 SIGNATURE
      const signature1 = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      // BUY 1 TICKET
      const tx1 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature1,
      );
      await expect(tx1)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        )
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ZeroAddress, receiver, tokenId);
      await expect(tx1).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      // GENERATE 2 SIGNATURE
      const signature2 = await generateSignature({
        account: stranger.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      // BUY 2 TICKET
      const tx2 = exchangeInstance.connect(stranger).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature2,
      );
      await expect(tx2)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          stranger,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: tokenId + 1n, // ticketId = 2
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        )
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ZeroAddress, stranger, tokenId + 1n);
      await expect(tx2).changeTokenBalances(erc20Instance, [stranger, raffleInstance], [-amount, amount]);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, await raffleInstance.getAddress());
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        await randomRequest(raffleInstance, vrfInstance);
      }

      // emit RoundFinalized(currentRound.roundId, prizeNumber);
      const eventFilter = raffleInstance.filters.RoundFinalized();
      const events = await raffleInstance.queryFilter(eventFilter);
      const { prizeNumber } = recursivelyDecodeResult(events[0].args);
      // We can't predict this output anymore because it depends on randomness
      // expect(Number(prizeNumber)).to.equal(1); // Zero if 0 tickets sold
      const roundInfo = await raffleInstance.getCurrentRoundInfo();

      expect(recursivelyDecodeResult(roundInfo)).deep.include({
        roundId: 1n,
        startTimestamp: getUint(timeStart),
        endTimestamp: getUint(current),
        maxTicket: 0n,
        prizeNumber,
        acceptedAsset: {
          tokenType: 1n,
          token: await erc20Instance.getAddress(),
          tokenId: 0n,
          amount,
        },
        ticketAsset: {
          tokenType: 2n,
          token: await erc721Instance.getAddress(),
          tokenId: 1n,
          amount: 1n,
        },
      });
    });

    it("should fail: RaffleRoundNotActive", async function () {
      const { raffleInstance } = await factoryRaffle();
      const tx = raffleInstance.endRound();
      await expect(tx).to.be.revertedWithCustomError(raffleInstance, "RaffleRoundNotActive");
    });
  });

  describe("Purchase Raffle", function () {
    it("should purchase Lottery and mint ticket", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(await exchangeInstance.getAddress(), amount);

      await raffleInstance.grantRole(MINTER_ROLE, await exchangeInstance.getAddress());
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, await raffleInstance.getAddress());
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx0 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx0)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        )
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ZeroAddress, receiver, tokenId);
      await expect(tx0).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721Instance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.ROUND).to.equal(BigInt(dbRoundId));
    });

    it("should finish round with 1 ticket and release funds", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      await raffleInstance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721Instance.grantRole(MINTER_ROLE, raffleInstance);

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, raffleInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const dbRoundId = 123;
      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx0 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx0)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx0).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        // RANDOM
        await randomRequest(raffleInstance as IERC721Random, vrfInstance);
      } else {
        const eventFilter = raffleInstance.filters.RoundFinalized();
        const events = await raffleInstance.queryFilter(eventFilter);
        expect(events.length).to.be.greaterThan(0);
        expect(events[0].args?.round).to.equal(1);
      }

      // WAIT for RELEASE
      const latest = await time.latestBlock();
      await time.advanceBlockTo(latest + raffleConfig.timeLagBeforeRelease + 1);

      const tx1 = raffleInstance.releaseFunds(1);
      await expect(tx1).to.emit(raffleInstance, "Released").withArgs(1, amount);
      await expect(tx1).changeTokenBalances(erc20Instance, [owner, raffleInstance], [amount, -amount]);
    });

    it("should finish round with 2 tickets and release funds", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount * 2n);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount * 2n);

      await raffleInstance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721Instance.grantRole(MINTER_ROLE, raffleInstance);

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, raffleInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx0 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx0)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx0).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const signature1 = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce1"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });
      const tx01 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce1"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature1,
      );
      await expect(tx01)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 2n, // ticketId = 2
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx01).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }
      if (network.name === "hardhat") {
        // RANDOM
        await randomRequest(raffleInstance as IERC721Random, vrfInstance);
      } else {
        const eventFilter = raffleInstance.filters.RoundFinalized();
        const events = await raffleInstance.queryFilter(eventFilter);
        expect(events.length).to.be.greaterThan(0);
        expect(events[0].args?.round).to.equal(1);
      }

      const eventFilter = raffleInstance.filters.RoundFinalized();
      const events = await raffleInstance.queryFilter(eventFilter);
      const { prizeNumber } = recursivelyDecodeResult(events[0].args);
      // Expected prize number is 1 or 2
      expect(Number(prizeNumber)).to.be.greaterThan(0).to.be.lessThan(3);
      // WAIT for RELEASE
      const latest = await time.latestBlock();
      await time.advanceBlockTo(latest + raffleConfig.timeLagBeforeRelease + 1);

      const tx1 = raffleInstance.releaseFunds(1);
      await expect(tx1)
        .to.emit(raffleInstance, "Released")
        .withArgs(1, amount * 2n);
      await expect(tx1).changeTokenBalances(erc20Instance, [owner, raffleInstance], [2n * amount, -amount * 2n]);
    });

    it("should finish round with 3 tickets", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount * 3n);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount * 3n);

      await raffleInstance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721Instance.grantRole(MINTER_ROLE, raffleInstance);

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, raffleInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }

      // ROUND 1
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx0 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx0)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx0).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const signature1 = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce1"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });
      const tx01 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce1"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature1,
      );
      await expect(tx01)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 2n, // ticketId = 2
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx01).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const signature2 = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });
      const tx02 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature2,
      );
      await expect(tx02)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 3n, // ticketId = 3
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx02).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }
      if (network.name === "hardhat") {
        // RANDOM
        await randomRequest(raffleInstance as IERC721Random, vrfInstance);
      } else {
        const eventFilter = raffleInstance.filters.RoundFinalized();
        const events = await raffleInstance.queryFilter(eventFilter);
        expect(events.length).to.be.greaterThan(0);
        expect(events[0].args?.round).to.equal(1);
      }

      const eventFilter = raffleInstance.filters.RoundFinalized();
      const events = await raffleInstance.queryFilter(eventFilter);
      const { prizeNumber } = recursivelyDecodeResult(events[0].args);
      // Expected prize number is 1 or 2
      expect(Number(prizeNumber))
        .to.be.greaterThan(0)
        .to.be.lessThan(3 /* ticket count */ + 1)
        .to.equal(3);

      const tx1 = raffleInstance.connect(receiver).getPrize(winnerTokenId, 1);
      await expect(tx1)
        .to.emit(raffleInstance, "Prize")
        .withArgs(receiver, 1, winnerTokenId, 3 /* multiplier = round ticket count */);

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721Instance.getTokenMetadata(winnerTokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.ROUND).to.equal(BigInt(dbRoundId));
      expect(decodedMeta.PRIZE).to.equal(3n /* multiplier = round tickets count */);
    });

    it("should fail: zero balance", async function () {
      const { raffleInstance } = await factoryRaffle();

      // WAIT for RELEASE
      const latest = await time.latestBlock();
      await time.advanceBlockTo(latest + raffleConfig.timeLagBeforeRelease + 1);

      const tx1 = raffleInstance.releaseFunds(0);
      await expect(tx1).to.be.revertedWithCustomError(raffleInstance, "RaffleZeroBalance");
    });

    it("should fail: no more tickets available", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount * 3n);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount * 3n);

      await raffleInstance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721Instance.grantRole(MINTER_ROLE, raffleInstance);

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, raffleInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        2, // maxTicket count
      );

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx0 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx0)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx0).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const signature1 = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce1"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });
      const tx1 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce1"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature1,
      );
      await expect(tx1)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 2n, // ticketId = 2
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx1).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const signature2 = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });
      const tx2 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature2,
      );
      await expect(tx2).to.be.revertedWithCustomError(raffleInstance, "RaffleTicketLimitExceed");
    });

    it("should fail: current round is finished", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      await raffleInstance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721Instance.grantRole(MINTER_ROLE, raffleInstance);

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, raffleInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const tx0 = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx0).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce2"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx).to.be.revertedWithCustomError(raffleInstance, "RaffleWrongRound");
    });
  });

  describe("Get prize", function () {
    it("should get prize", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc721Instance, erc20Instance } = await factoryRaffle();

      await erc721Instance.mintTicket(receiver, 1, 101, 1);
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());

      await erc20Instance.mint(raffleInstance, parseEther("20000"));
      // function setDummyRound(uint256 prizeNumber, uint256 requestId, Asset memory item, Asset memory price)
      await raffleInstance.setDummyRound(
        1, // winner ticketId
        nonce,
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const tx = raffleInstance.connect(receiver).getPrize(tokenId, 1);
      await expect(tx).to.emit(raffleInstance, "Prize").withArgs(receiver, 1, 1, 1);

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721Instance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.ROUND).to.equal(BigInt(dbRoundId));
      expect(decodedMeta.PRIZE).to.equal(1n);
    });

    it("should get prize from previous round", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      await raffleInstance.grantRole(MINTER_ROLE, exchangeInstance);
      await erc721Instance.grantRole(MINTER_ROLE, raffleInstance);

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, raffleInstance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }

      // ROUND 1
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const dbRoundId = 101;
      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx0 = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx0)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        );
      await expect(tx0).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      const tx = await raffleInstance.endRound();
      const current: number = await time.latest();
      await expect(tx).to.emit(raffleInstance, "RoundEnded").withArgs(1, current);

      if (network.name !== "hardhat") {
        await delay(10000).then(() => console.info("delay 10000 done"));
      }

      if (network.name === "hardhat") {
        // RANDOM
        await randomRequest(raffleInstance as IERC721Random, vrfInstance);
      } else {
        const eventFilter = raffleInstance.filters.RoundFinalized();
        const events = await raffleInstance.queryFilter(eventFilter);
        expect(events.length).to.be.greaterThan(0);
        expect(events[0].args?.round).to.equal(1);
      }

      // ROUND 2
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const tx2 = raffleInstance.connect(receiver).getPrize(tokenId, 1);
      await expect(tx2).to.emit(raffleInstance, "Prize").withArgs(receiver, 1, 1, 1);

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721Instance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.ROUND).to.equal(BigInt(dbRoundId));
      expect(decodedMeta.PRIZE).to.equal(1n);
    });

    it("should fail: round not finished", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc20Instance, erc721Instance } = await factoryRaffle();

      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      await erc20Instance.mint(receiver, amount);
      await erc20Instance.connect(receiver).approve(await exchangeInstance.getAddress(), amount);

      await raffleInstance.grantRole(MINTER_ROLE, await exchangeInstance.getAddress());
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());

      if (network.name === "hardhat") {
        // Set VRFV2 Subscription
        const tx01 = raffleInstance.setSubscriptionId(subId);
        await expect(tx01).to.emit(raffleInstance, "VrfSubscriptionSet").withArgs(subId);

        // Add Consumer to VRFV2
        const tx02 = vrfInstance.addConsumer(subId, await raffleInstance.getAddress());
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, raffleInstance);
      }
      await raffleInstance.startRound(
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 1,
          amount: 1n,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: await raffleInstance.getAddress(),
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: await erc721Instance.getAddress(),
          tokenId: 0,
          amount: 1,
        },
        price: {
          tokenType: 1,
          token: await erc20Instance.getAddress(),
          tokenId: 0,
          amount,
        },
      });

      const tx = exchangeInstance.connect(receiver).purchaseRaffle(
        {
          externalId: dbRoundId,
          expiresAt,
          nonce: encodeBytes32String("nonce"),
          extra,
          receiver: raffleInstance,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount: 1,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        signature,
      );
      await expect(tx)
        .to.emit(exchangeInstance, "PurchaseRaffle")
        .withArgs(
          receiver,
          BigInt(dbRoundId),
          isEqualEventArgObj({
            tokenType: 2n,
            token: await erc721Instance.getAddress(),
            tokenId: 1n, // ticketId = 1
            amount: 1n,
          }),
          isEqualEventArgObj({
            tokenType: 1n,
            token: await erc20Instance.getAddress(),
            tokenId: 0n,
            amount: amount * 1n,
          }),
        )
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ZeroAddress, receiver, tokenId);
      await expect(tx).changeTokenBalances(erc20Instance, [receiver, raffleInstance], [-amount, amount]);

      const tx1 = raffleInstance.connect(receiver).getPrize(tokenId, 1);
      await expect(tx1).to.be.revertedWithCustomError(raffleInstance, "RaffleRoundNotComplete");
    });

    it("should fail: wrong round", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc721Instance, erc20Instance } = await factoryRaffle();

      await erc721Instance.mintTicket(receiver, 1, 101, 1);
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());

      await erc20Instance.mint(raffleInstance, parseEther("20000"));
      // function setDummyRound(uint256 prizeNumber, uint256 requestId, Asset memory item, Asset memory price)
      await raffleInstance.setDummyRound(
        1, // winner ticketId
        nonce,
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const tx = raffleInstance.connect(receiver).getPrize(tokenId, 2);
      await expect(tx).to.be.revertedWithCustomError(raffleInstance, "RaffleWrongRound");
    });

    it("should fail: already got prize", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc721Instance, erc20Instance } = await factoryRaffle();

      await erc721Instance.mintTicket(receiver, 1, 101, 1);
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());
      await erc20Instance.mint(await raffleInstance.getAddress(), parseEther("20000"));

      await raffleInstance.setDummyRound(
        1, // winner ticketId
        nonce,
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const tx = raffleInstance.connect(receiver).getPrize(tokenId, 1);
      await expect(tx).to.emit(raffleInstance, "Prize").withArgs(receiver, 1, 1, 1);

      const tx1 = raffleInstance.connect(receiver).getPrize(tokenId, 1);
      await expect(tx1).to.be.revertedWithCustomError(raffleInstance, "RaffleWrongToken");
    });

    it("should fail: RafflePrizeNotEligible", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc721Instance, erc20Instance } = await factoryRaffle();

      await erc721Instance.mintTicket(receiver, 1, 101, 1);
      await erc721Instance.mintTicket(receiver, 1, 101, 1);
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());
      await erc20Instance.mint(await raffleInstance.getAddress(), parseEther("20000"));

      await raffleInstance.setDummyRound(
        1, // winner ticketId
        nonce,
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const tx = raffleInstance.connect(receiver).getPrize(2, 1);
      await expect(tx).to.be.revertedWithCustomError(raffleInstance, "RafflePrizeNotEligible");
    });

    it("should fail: RaffleNotOwnerNorApproved", async function () {
      const [_owner, receiver, stranger] = await ethers.getSigners();

      const { raffleInstance, erc721Instance, erc20Instance } = await factoryRaffle();

      await erc721Instance.mintTicket(receiver, 1, 101, 1);
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());
      await erc20Instance.mint(await raffleInstance.getAddress(), parseEther("20000"));

      await raffleInstance.setDummyRound(
        1, // winner ticketId
        nonce,
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      const tx = raffleInstance.connect(stranger).getPrize(tokenId, 1);
      await expect(tx).to.be.revertedWithCustomError(raffleInstance, "RaffleNotOwnerNorApproved");
    });

    it("should fail: wrong token round", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const { raffleInstance, erc721Instance, erc20Instance } = await factoryRaffle();

      await erc721Instance.mintTicket(receiver, 1, 101, 1);
      await erc721Instance.mintTicket(receiver, 2, 101, 2);
      await erc721Instance.grantRole(MINTER_ROLE, await raffleInstance.getAddress());

      await erc20Instance.mint(raffleInstance, parseEther("20000"));
      // function setDummyRound(uint256 prizeNumber, uint256 requestId, Asset memory item, Asset memory price)
      await raffleInstance.setDummyRound(
        1, // winner ticketId
        nonce,
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );
      await raffleInstance.setDummyRound(
        1, // winner ticketId
        nonce,
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId: 0,
          amount,
        },
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId: 0,
          amount,
        },
        0, // maxTicket count
      );

      await erc721Instance.connect(receiver).approve(raffleInstance, 1);

      const tx = raffleInstance.connect(receiver).getPrize(tokenId, 2);
      await expect(tx).to.be.revertedWithCustomError(raffleInstance, "RaffleWrongRound");
    });
  });
});
