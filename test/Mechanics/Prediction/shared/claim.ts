import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { treasuryFee } from "../../../constants";
import { makeTimestamps, Position, Outcome, fundAndBet, expectBalanceIncrease, expectBalanceDecrease } from "./utils";

export function shouldClaim(predictionFactory: () => Promise<any>, betAssetFactory: () => Promise<any>) {
  describe("claim", function () {
    it("should distribute rewards in LEFT outcome", async function () {
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

      // Bettor2 should not be able to claim
      const tx2 = predictionInstance.connect(bettor2).claim(1);
      await expect(tx2).to.be.revertedWithCustomError(predictionInstance, "PredictionNotEligibleForClaim");

      // Bettor1 claims reward
      const tx1 = await predictionInstance.connect(bettor1).claim(1);

      const reward = {
        ...betAsset,
        amount: betAsset.amount + betAsset.amount - (betAsset.amount * treasuryFee) / 10000n,
      };

      await expectBalanceIncrease(tx1, bettor1, reward);
      await expectBalanceDecrease(tx1, predictionInstance, reward);

      if (process.env.VERBOSE) {
        console.info("Rewards distributed correctly for LEFT outcome.");
      }
    });

    it("should distribute rewards in RIGHT outcome", async function () {
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

      await predictionInstance.resolvePrediction(1, Outcome.RIGHT);

      // Bettor1 should not be able to claim
      const tx1 = predictionInstance.connect(bettor1).claim(1);
      await expect(tx1).to.be.revertedWithCustomError(predictionInstance, "PredictionNotEligibleForClaim");

      // Bettor2 claims reward
      const tx2 = await predictionInstance.connect(bettor2).claim(1);

      const reward = {
        ...betAsset,
        amount: betAsset.amount + betAsset.amount - (betAsset.amount * treasuryFee) / 10000n,
      };

      await expectBalanceIncrease(tx2, bettor2, reward);
      await expectBalanceDecrease(tx2, predictionInstance, reward);

      if (process.env.VERBOSE) {
        console.info("Rewards distributed correctly for RIGHT outcome.");
      }
    });

    it("should refund stakes in DRAW outcome", async function () {
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

      await predictionInstance.resolvePrediction(1, Outcome.DRAW);

      // Bettor1 claims refund
      const tx1 = await predictionInstance.connect(bettor1).claim(1);

      // Bettor2 claims refund
      const tx2 = await predictionInstance.connect(bettor2).claim(1);

      const refund = {
        ...betAsset,
        amount: betAsset.amount,
      };

      await expectBalanceIncrease(tx1, bettor1, refund);
      await expectBalanceDecrease(tx1, predictionInstance, refund);

      await expectBalanceIncrease(tx2, bettor2, refund);
      await expectBalanceDecrease(tx2, predictionInstance, refund);

      if (process.env.VERBOSE) {
        console.info("Stakes refunded correctly for DRAW outcome.");
      }
    });

    it("should fail: PredictionNotEligibleForClaim - tried to claim by non-winner side", async function () {
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

      // Bettor2 tries to claim
      const tx = predictionInstance.connect(bettor2).claim(1);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionNotEligibleForClaim");

      if (process.env.VERBOSE) {
        console.info("Claim by non-winner side reverted as expected.");
      }
    });

    it("should fail: PredictionCannotClaimBeforeResolution - tried to claim before prediction is resolved", async function () {
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

      // Bettor1 tries to claim before resolution
      const tx = predictionInstance.connect(bettor1).claim(1);
      await expect(tx).to.be.revertedWithCustomError(predictionInstance, "PredictionCannotClaimBeforeResolution");

      if (process.env.VERBOSE) {
        console.info("Claim before resolution reverted as expected.");
      }
    });

    it("should fail: PredictionRewardAlreadyClaimed - tried to claim multiple times", async function () {
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

      // Bettor1 claims reward
      const tx1 = await predictionInstance.connect(bettor1).claim(1);

      // Bettor1 tries to claim again
      const txClaimed = predictionInstance.connect(bettor1).claim(1);
      await expect(txClaimed).to.be.revertedWithCustomError(predictionInstance, "PredictionRewardAlreadyClaimed");

      const reward = {
        ...betAsset,
        amount: betAsset.amount + betAsset.amount - (betAsset.amount * treasuryFee) / 10000n,
      };

      await expectBalanceIncrease(tx1, bettor1, reward);
      await expectBalanceDecrease(tx1, predictionInstance, reward);

      if (process.env.VERBOSE) {
        console.info("Multiple claims reverted as expected.");
      }
    });

    it("should distribute rewards correctly when multiple bettors on both sides", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1, bettor2, bettor3, bettor4] = await ethers.getSigners();
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

      await fundAndBet(predictionInstance, bettor3, {
        predictionId: 1,
        multiplier: 2,
        position: Position.LEFT,
      });

      await fundAndBet(predictionInstance, bettor4, {
        predictionId: 1,
        multiplier: 4,
        position: Position.RIGHT,
      });

      await predictionInstance.resolvePrediction(1, Outcome.LEFT);

      // Bettor1 claims reward
      const tx1 = await predictionInstance.connect(bettor1).claim(1);

      // Bettor3 claims reward
      const tx3 = await predictionInstance.connect(bettor3).claim(1);

      // Check reward distribution
      const totalLeftUnits = 1n + 2n;
      const totalRightAmount = 1n * betAsset.amount + 4n * betAsset.amount;
      const treasuryAmt = (totalRightAmount * treasuryFee) / 10000n;
      const rewardAmount = totalRightAmount - treasuryAmt;

      const expectedReward1 = {
        ...betAsset,
        amount: 1n * betAsset.amount + (1n * rewardAmount) / totalLeftUnits,
      };

      const expectedReward3 = {
        ...betAsset,
        amount: 2n * betAsset.amount + (2n * rewardAmount) / totalLeftUnits,
      };

      await expectBalanceIncrease(tx1, bettor1, expectedReward1);
      await expectBalanceDecrease(tx1, predictionInstance, expectedReward1);

      await expectBalanceIncrease(tx3, bettor3, expectedReward3);
      await expectBalanceDecrease(tx3, predictionInstance, expectedReward3);

      if (process.env.VERBOSE) {
        console.info("Rewards distributed correctly for multiple bettors on both sides.");
      }
    });

    it("should refund bets when tried to claim unresolved prediction after expiry time", async function () {
      const predictionInstance = await predictionFactory();
      const betAsset = await betAssetFactory();
      const [_owner, bettor1, bettor2] = await ethers.getSigners();
      const { endTimestamp, startTimestamp, expiryTimestamp } = await makeTimestamps();

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

      // Move time forward to after the expiry timestamp
      await time.increaseTo(expiryTimestamp + BigInt(time.duration.seconds(10)));

      // Bettor1 claims refund
      const tx1 = await predictionInstance.connect(bettor1).claim(1);

      // Bettor2 claims refund
      const tx2 = await predictionInstance.connect(bettor2).claim(1);

      const refund = {
        ...betAsset,
        amount: betAsset.amount,
      };

      await expectBalanceIncrease(tx1, bettor1, refund);
      await expectBalanceDecrease(tx1, predictionInstance, refund);

      await expectBalanceIncrease(tx2, bettor2, refund);
      await expectBalanceDecrease(tx2, predictionInstance, refund);

      if (process.env.VERBOSE) {
        console.info("Bets refunded correctly for unresolved prediction after expiry time.");
      }
    });

    it("should allow claim when contract is paused", async function () {
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

      // Bettor1 claims reward
      const tx1 = await predictionInstance.connect(bettor1).claim(1);

      // Bettor2 should not be able to claim
      const tx2 = predictionInstance.connect(bettor2).claim(1);
      await expect(tx2).to.be.revertedWithCustomError(predictionInstance, "PredictionNotEligibleForClaim");

      const reward = {
        ...betAsset,
        amount: betAsset.amount + betAsset.amount - (betAsset.amount * treasuryFee) / 10000n,
      };

      await expectBalanceIncrease(tx1, bettor1, reward);
      await expectBalanceDecrease(tx1, predictionInstance, reward);

      if (process.env.VERBOSE) {
        console.info("Claim was successful even when contract is paused.");
      }
    });
  });
}
