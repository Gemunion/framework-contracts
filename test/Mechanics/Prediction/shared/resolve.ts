import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { fundAndBet, makeTimestamps, Outcome, Position } from "./utils";

export function shouldResolvePrediction(predictionFactory: () => Promise<any>, betAssetFactory: () => Promise<any>) {
  describe("resolve", function () {
    it("should fail: AccessControlUnauthorizedAccount - non-admin trying to resolve", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1, bettor2] = await ethers.getSigners();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      await fundAndBet(predictionInstance, bettor2, {
        predictionId: 1,
        multiplier: 1,
        position: Position.RIGHT,
      });

      const tx = predictionInstance.connect(bettor1).resolvePrediction(1, Outcome.LEFT);

      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "AccessControlUnauthorizedAccount");

      if (process.env.VERBOSE) {
        console.info("Non-admin tried to resolve the prediction and failed.");
      }
    });

    it("should force prediction into expired state after expiry time", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1] = await ethers.getSigners();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      await time.increaseTo(expiryTimestamp + BigInt(time.duration.seconds(10)));

      const resolveErrorTx = predictionInstance.resolvePrediction(1, Outcome.LEFT);
      await expect(resolveErrorTx).to.emit(predictionInstance, "PredictionEnd").withArgs(1, Outcome.EXPIRED);

      if (process.env.VERBOSE) {
        console.info("Bettor resolved the prediction as expired after expiry time.");
      }
    });

    it("should force prediction into error state when there are no bettors on either side", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner] = await ethers.getSigners();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(endTimestamp + BigInt(time.duration.seconds(10)));

      const resolveTx = predictionInstance.resolvePrediction(1, Outcome.LEFT);
      await expect(resolveTx).to.emit(predictionInstance, "PredictionEnd").withArgs(1, Outcome.ERROR);

      const predictionMatch = await predictionInstance.getPrediction(1);

      expect(predictionMatch.rewardAsset.amount).to.equal(0);
      expect(predictionMatch.outcome).to.equal(Outcome.ERROR);
      expect(predictionMatch.resolved).to.equal(true);

      if (process.env.VERBOSE) {
        console.info("Prediction forced into error state due to no bettors on either side.");
      }
    });

    it("should fail: PredictionAlreadyResolved - resolving multiple times", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1, bettor2] = await ethers.getSigners();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      await fundAndBet(predictionInstance, bettor2, {
        predictionId: 1,
        multiplier: 1,
        position: Position.RIGHT,
      });

      await predictionInstance.resolvePrediction(1, Outcome.LEFT);

      const tx = predictionInstance.resolvePrediction(1, Outcome.LEFT);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionAlreadyResolved");

      if (process.env.VERBOSE) {
        console.info("Admin tried to resolve the prediction multiple times and failed.");
      }
    });

    it("should allow admin to resolve prediction before endTimestamp and prevent further bets", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1, bettor2] = await ethers.getSigners();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      await fundAndBet(predictionInstance, bettor2, {
        predictionId: 1,
        multiplier: 1,
        position: Position.RIGHT,
      });

      const resolveTx = predictionInstance.resolvePrediction(1, Outcome.LEFT);
      await expect(resolveTx).to.emit(predictionInstance, "PredictionEnd").withArgs(1, Outcome.LEFT);

      const tx = fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.RIGHT,
      });
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionAlreadyResolved");

      if (process.env.VERBOSE) {
        console.info("Admin resolved the prediction before endTimestamp and no more bets can be placed.");
      }
    });

    it("should fail: PredictionInvalidOutcome - expired or error outcome manually passed", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1, bettor2] = await ethers.getSigners();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      await predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);

      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10)));

      await fundAndBet(predictionInstance, bettor1, {
        predictionId: 1,
        multiplier: 1,
        position: Position.LEFT,
      });

      await fundAndBet(predictionInstance, bettor2, {
        predictionId: 1,
        multiplier: 1,
        position: Position.RIGHT,
      });

      await time.increaseTo(endTimestamp + BigInt(time.duration.seconds(10)));

      const txExpired = predictionInstance.resolvePrediction(1, Outcome.EXPIRED);
      await expect(txExpired).to.be.revertedWithCustomError(predictionInstance, "PredictionInvalidOutcome");

      const txError = predictionInstance.resolvePrediction(1, Outcome.ERROR);
      await expect(txError).to.be.revertedWithCustomError(predictionInstance, "PredictionInvalidOutcome");

      if (process.env.VERBOSE) {
        console.info("Admin tried to resolve with an invalid outcome and failed.");
      }
    });

    it("should fail: EnforcedPause - admin cannot start new prediction when contract is paused", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      // Pause the contract
      await predictionInstance.pause();

      const tx = predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "EnforcedPause");

      if (process.env.VERBOSE) {
        console.info("Admin tried to start a new prediction while the contract is paused and failed.");
      }
    });
  });
}
