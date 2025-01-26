import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { makeTimestamps } from "./utils";

export function shouldStartPrediction(predictionFactory: () => Promise<any>, betAssetFactory: () => Promise<any>) {
  describe("startPrediction", function () {
    it("should fail: AccessControlUnauthorizedAccount", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1] = await ethers.getSigners();

      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      const tx = predictionInstance
        .connect(bettor1)
        .startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "AccessControlUnauthorizedAccount");

      if (process.env.VERBOSE) {
        console.info("startPrediction reverted when non-admin tried to call it");
      }
    });

    it("should fail: PredictionNotStarted - startTimestamp is not less than endTimestamp", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();

      const startTimestamp = BigInt(await time.latest()) + BigInt(time.duration.minutes(1));
      const endTimestamp = startTimestamp;
      const expiryTimestamp = endTimestamp + BigInt(time.duration.hours(1));

      const tx = predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionNotStarted");

      if (process.env.VERBOSE) {
        console.info("Failed to start prediction because startTimestamp is not less than endTimestamp.");
      }
    });

    it("should fail: PredictionEnded - endTimestamp is not less than expiryTimestamp", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();

      const startTimestamp = BigInt(await time.latest()) + BigInt(time.duration.minutes(1));
      const endTimestamp = startTimestamp + BigInt(time.duration.hours(1));
      const expiryTimestamp = endTimestamp;

      const tx = predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionEnded");

      if (process.env.VERBOSE) {
        console.info("Failed to start prediction because endTimestamp is not less than expiryTimestamp.");
      }
    });

    it("should fail: EnforcedPause - starting prediction when contract is paused", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();

      const { expiryTimestamp, endTimestamp, startTimestamp } = await makeTimestamps();

      // Pause the contract
      await predictionInstance.pause();

      const tx = predictionInstance.startPrediction(startTimestamp, endTimestamp, expiryTimestamp, betAsset);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "EnforcedPause");

      if (process.env.VERBOSE) {
        console.info("Failed to start prediction because the contract is paused.");
      }
    });

    it("should allow to create multiple independent predictions", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();

      const startTimestamp1 = BigInt(await time.latest()) + BigInt(time.duration.minutes(1));
      const endTimestamp1 = startTimestamp1 + BigInt(time.duration.hours(1));
      const expiryTimestamp1 = endTimestamp1 + BigInt(time.duration.hours(1));

      await predictionInstance.startPrediction(startTimestamp1, endTimestamp1, expiryTimestamp1, betAsset);

      const startTimestamp2 = BigInt(await time.latest()) + BigInt(time.duration.minutes(2));
      const endTimestamp2 = startTimestamp2 + BigInt(time.duration.hours(1));
      const expiryTimestamp2 = endTimestamp2 + BigInt(time.duration.hours(1));

      await predictionInstance.startPrediction(startTimestamp2, endTimestamp2, expiryTimestamp2, betAsset);

      const predictionMatch1 = await predictionInstance.getPrediction(1);
      const predictionMatch2 = await predictionInstance.getPrediction(2);

      expect(predictionMatch1.startTimestamp).to.equal(startTimestamp1);
      expect(predictionMatch1.endTimestamp).to.equal(endTimestamp1);
      expect(predictionMatch1.expiryTimestamp).to.equal(expiryTimestamp1);
      expect(predictionMatch1.betAsset.tokenType).to.equal(betAsset.tokenType);
      expect(predictionMatch1.betAsset.amount).to.equal(betAsset.amount);
      expect(predictionMatch1.outcome).to.equal(3);
      expect(predictionMatch1.resolved).to.be.equal(false);

      expect(predictionMatch2.startTimestamp).to.equal(startTimestamp2);
      expect(predictionMatch2.endTimestamp).to.equal(endTimestamp2);
      expect(predictionMatch2.expiryTimestamp).to.equal(expiryTimestamp2);
      expect(predictionMatch2.betAsset.tokenType).to.equal(betAsset.tokenType);
      expect(predictionMatch2.betAsset.amount).to.equal(betAsset.amount);
      expect(predictionMatch2.outcome).to.equal(3);
      expect(predictionMatch2.resolved).to.be.equal(false);

      if (process.env.VERBOSE) {
        console.info("Created another prediction with auto-incremented id.");
        console.info(`Prediction 1 - Start Timestamp: ${startTimestamp1}`);
        console.info(`Prediction 1 - End Timestamp: ${endTimestamp1}`);
        console.info(`Prediction 1 - Expiry Timestamp: ${expiryTimestamp1}`);
        console.info(`Prediction 2 - Start Timestamp: ${startTimestamp2}`);
        console.info(`Prediction 2 - End Timestamp: ${endTimestamp2}`);
        console.info(`Prediction 2 - Expiry Timestamp: ${expiryTimestamp2}`);
      }
    });
  });
}
