import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { fundAndBet, makeTimestamps, Position, expectBalanceIncrease, expectBalanceDecrease } from "./utils";

export function shouldBetPosition(predictionFactory: () => Promise<any>, betAssetFactory: () => Promise<any>) {
  describe("betPosition", function () {
    it("should fail: PredictionNotStarted - betting before start timestamp", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();
      const [_owner, bettor1] = await ethers.getSigners();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      const tx = fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionNotStarted");

      if (process.env.VERBOSE) {
        console.info("Failed to place bet because betting period has not started.");
      }
    });

    it("should fail: PredictionEnded - betting after end timestamp", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();
      const [_owner, bettor1] = await ethers.getSigners();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(endTimestamp + BigInt(time.duration.seconds(10)));

      const tx = fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionEnded");

      if (process.env.VERBOSE) {
        console.info("Failed to place bet because betting period has ended.");
      }
    });

    it("should fail: PredictionBetAmountTooLow - betting with zero amount", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();
      const [_owner, bettor1] = await ethers.getSigners();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      const tx = fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 0,
        position: Position.LEFT,
      });
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionBetAmountTooLow");

      if (process.env.VERBOSE) {
        console.info("Failed to place bet because bet amount is less than minimum bet units.");
      }
    });

    it("should fail: PredictionBetAlreadyPlaced - switching bet position", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();
      const [_owner, bettor1] = await ethers.getSigners();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      const tx = fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.RIGHT,
      });
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionBetAlreadyPlaced");

      if (process.env.VERBOSE) {
        console.info("Failed to switch bet position as expected.");
      }
    });

    it("should allow betting on left and right positions", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();
      const [_owner, bettor1, bettor2] = await ethers.getSigners();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      const betMultiplier1 = BigInt(3);

      const tx1 = fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: betMultiplier1,
        position: Position.LEFT,
      });

      await expect(tx1)
        .to.emit(predictionInstance, "BetPlaced")
        .withArgs(
          1,
          bettor1.address,
          [betAsset.tokenType, betAsset.token, betAsset.tokenId, betMultiplier1 * betAsset.amount],
          Position.LEFT,
        );

      await expectBalanceDecrease(tx1, bettor1, {
        ...betAsset,
        amount: betAsset.amount * betMultiplier1,
      });
      await expectBalanceIncrease(tx1, predictionInstance, {
        ...betAsset,
        amount: betAsset.amount * betMultiplier1,
      });

      const betMultiplier2 = BigInt(5);

      const tx2 = fundAndBet(predictionInstance, bettor2, {
        predictionId: 1,
        multiplier: betMultiplier2,
        position: Position.RIGHT,
      });

      await expect(tx2)
        .to.emit(predictionInstance, "BetPlaced")
        .withArgs(
          1,
          bettor2.address,
          [betAsset.tokenType, betAsset.token, betAsset.tokenId, betMultiplier2 * betAsset.amount],
          Position.RIGHT,
        );

      await expectBalanceDecrease(tx2, bettor2, {
        ...betAsset,
        amount: betAsset.amount * betMultiplier2,
      });
      await expectBalanceIncrease(tx2, predictionInstance, {
        ...betAsset,
        amount: betAsset.amount * betMultiplier2,
      });

      const betInfo1 = await predictionInstance.getBetInfo(1, bettor1);
      expect(betInfo1.multiplier).to.equal(betMultiplier1);
      expect(betInfo1.position).to.equal(Position.LEFT);

      const betInfo2 = await predictionInstance.getBetInfo(1, bettor2);
      expect(betInfo2.multiplier).to.equal(betMultiplier2);
      expect(betInfo2.position).to.equal(Position.RIGHT);

      if (process.env.VERBOSE) {
        console.info("Valid bets placed and prediction state updated correctly.");
        console.info(`Prediction ID: 1`);
        console.info(`Bettor1 Bet Units: ${betMultiplier1}`);
        console.info(`Bettor2 Bet Units: ${betMultiplier2}`);
        console.info(`Stake Unit: ${ethers.formatUnits(betAsset.amount, 18)}`);
        console.info(`Total Bet: ${(betMultiplier1 + betMultiplier2) * betAsset.amount}`);
      }
    });

    it("should allow to increase bet", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();
      const [_owner, bettor1] = await ethers.getSigners();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      const betInfo = await predictionInstance.getBetInfo(1, bettor1.address);
      expect(betInfo.multiplier).to.equal(2n);
      expect(betInfo.position).to.equal(Position.LEFT);

      if (process.env.VERBOSE) {
        console.info("Successfully placed multiple bets from the same user on the same prediction.");
      }
    });

    it("should fail: EnforcedPause - betting when contract is paused", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();
      const [_owner, bettor1] = await ethers.getSigners();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      // Pause the contract
      await predictionInstance.pause();

      const tx = fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "EnforcedPause");

      if (process.env.VERBOSE) {
        console.info("Failed to place bet because the contract is paused.");
      }
    });
  });
}
