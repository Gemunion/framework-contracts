import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { treasuryFee } from "../../../constants";
import { makeTimestamps, Position, Outcome, fundAndBet, expectBalanceIncrease, expectBalanceDecrease } from "./utils";

export function shouldClaimTreasury(predictionFactory: () => Promise<any>, betAssetFactory: () => Promise<any>) {
  describe("claimTreasury", function () {
    it("should claim treasury", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [owner, bettor1, bettor2] = await ethers.getSigners();
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

      // Claim treasury
      const tx = await predictionInstance.claimTreasury();

      const totalRightAmount = 1n * betAsset.amount;
      const treasuryAmt = (totalRightAmount * treasuryFee) / 10000n;

      const treasuryAsset = {
        ...betAsset,
        amount: treasuryAmt,
      };

      await expectBalanceIncrease(tx, owner, treasuryAsset);
      await expectBalanceDecrease(tx, predictionInstance, treasuryAsset);

      if (process.env.VERBOSE) {
        console.info("Treasury claimed by admin.");
      }
    });

    it("should allow claim treasury when contract is paused", async function () {
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

      // Pause the contract
      await predictionInstance.pause();

      await predictionInstance.claimTreasury();

      if (process.env.VERBOSE) {
        console.info("Treasury claimed when contract is paused.");
      }
    });

    it("should fail: AccessControlUnauthorizedAccount", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_, bettor1, bettor2] = await ethers.getSigners();
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

      // Non-admin tries to claim treasury
      const tx = predictionInstance.connect(bettor1).claimTreasury();
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "AccessControlUnauthorizedAccount");

      if (process.env.VERBOSE) {
        console.info("Non-admin claim treasury reverted as expected.");
      }
    });

    it("should fail: PredictionNoTreasuryAssets", async function () {
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

      // Claim treasury for the first time
      await predictionInstance.claimTreasury();

      const txFailed = predictionInstance.claimTreasury();
      await expect(txFailed).to.be.revertedWithCustomError(predictionInstance, "PredictionNoTreasuryAssets");

      if (process.env.VERBOSE) {
        console.info("Double treasury claim was prevented.");
      }
    });
  });
}
