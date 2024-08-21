import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@openzeppelin/test-helpers";

import { shouldStartPrediction } from "./start";
import { shouldBetPosition } from "./bet";
import { shouldResolvePrediction } from "./resolve";
import { shouldClaim } from "./claim";
import { shouldBetPositionNative } from "./nativeBet";

export function shouldBehaveLikePredictionContract(factory: () => Promise<any>, isVerbose = false) {
  describe("prediction behavior", function () {
    const deployContractWithFundedBettors = async (): any => {
      const { prediction, token, operator, bettor1, bettor2, ...params } = await factory();

      // Define bet units and stake units
      const betUnits1 = 3n;
      const betUnits2 = 5n;
      const stakeUnit = await prediction.betUnit();
      const betAmount1 = betUnits1 * stakeUnit.amount;
      const betAmount2 = betUnits2 * stakeUnit.amount;

      // Mint tokens and approve for betting
      await token.mint(bettor1, betAmount1);
      await token.mint(bettor2, betAmount2);
      await token.connect(bettor1).approve(prediction, betAmount1);
      await token.connect(bettor2).approve(prediction, betAmount2);

      return {
        betUnits1,
        betUnits2,
        stakeUnit,
        betAmount1,
        betAmount2,
        prediction,
        token,
        operator,
        bettor1,
        bettor2,
        ...params,
      };
    };

    const deployContractWithActivePrediction = async (): any => {
      const { prediction, token, operator, bettor1, bettor2, ...params } = await deployContractWithFundedBettors();

      const title = "Prediction Title";
      const predictionId = ethers.solidityPackedKeccak256(["string", "address"], [title, prediction.target]);
      const startTimestamp = BigInt(await time.latest()) + BigInt(time.duration.minutes(1)); // 1 minute from now
      const endTimestamp = startTimestamp + BigInt(time.duration.hours(1)); // 1 hour from start
      const resolutionTimestamp = endTimestamp + BigInt(time.duration.hours(1)); // 1 hour from end
      const expiryTimestamp = resolutionTimestamp + BigInt(time.duration.hours(1)); // 1 hour from resolution

      // Start the prediction
      await prediction
        .connect(operator)
        .startPrediction(title, startTimestamp, endTimestamp, resolutionTimestamp, expiryTimestamp);

      // Move time forward to allow betting
      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10))); // Move time forward to allow betting

      const initialBalance1 = await token.balanceOf(bettor1.address);
      const initialBalance2 = await token.balanceOf(bettor2.address);

      return {
        startTimestamp,
        endTimestamp,
        resolutionTimestamp,
        expiryTimestamp,
        title,
        predictionId,
        initialBalance1,
        initialBalance2,
        prediction,
        token,
        operator,
        bettor1,
        bettor2,
        ...params,
      };
    };

    const deployContractWithFundedPrediction = async (): any => {
      const { prediction, bettor1, bettor2, title, predictionId, betUnits1, betUnits2, ...params } =
        await deployContractWithActivePrediction();

      const tx1 = await prediction.connect(bettor1).placeBetInTokens(title, betUnits1, 0); // Position.Left
      await expect(tx1).to.emit(prediction, "BetPlaced").withArgs(bettor1.address, predictionId, betUnits1, 0);

      const tx2 = await prediction.connect(bettor2).placeBetInTokens(title, betUnits2, 1); // Position.Right
      await expect(tx2).to.emit(prediction, "BetPlaced").withArgs(bettor2.address, predictionId, betUnits2, 1);

      return { prediction, bettor1, bettor2, title, predictionId, betUnits1, betUnits2, ...params };
    };

    shouldStartPrediction(deployContractWithFundedBettors, isVerbose);
    shouldBetPosition(deployContractWithActivePrediction, isVerbose);
    shouldResolvePrediction(deployContractWithActivePrediction, isVerbose);
    shouldClaim(deployContractWithFundedPrediction, isVerbose);
  });
}

export function shouldBehaveLikePredictionContractWithNative(factory: () => Promise<any>, isVerbose = false) {
  describe("prediction behavior with native bets", function () {
    const deployContractWithActivePrediction = async (): any => {
      const { prediction, operator, bettor1, bettor2, ...params } = await factory();

      const title = "Prediction Title";
      const predictionId = ethers.solidityPackedKeccak256(["string", "address"], [title, prediction.target]);
      const startTimestamp = BigInt(await time.latest()) + BigInt(time.duration.minutes(1)); // 1 minute from now
      const endTimestamp = startTimestamp + BigInt(time.duration.hours(1)); // 1 hour from start
      const resolutionTimestamp = endTimestamp + BigInt(time.duration.hours(1)); // 1 hour from end
      const expiryTimestamp = resolutionTimestamp + BigInt(time.duration.hours(1)); // 1 hour from resolution

      // Start the prediction
      await prediction
        .connect(operator)
        .startPrediction(title, startTimestamp, endTimestamp, resolutionTimestamp, expiryTimestamp);

      // Move time forward to allow betting
      await time.increaseTo(startTimestamp + BigInt(time.duration.seconds(10))); // Move time forward to allow betting

      const initialBalance1 = await ethers.provider.getBalance(bettor1.address);
      const initialBalance2 = await ethers.provider.getBalance(bettor2.address);

      const betUnits1 = 3n;
      const betUnits2 = 5n;

      return {
        startTimestamp,
        endTimestamp,
        resolutionTimestamp,
        expiryTimestamp,
        title,
        predictionId,
        initialBalance1,
        initialBalance2,
        prediction,
        operator,
        bettor1,
        bettor2,
        betUnits1,
        betUnits2,
        ...params,
      };
    };

    shouldBetPositionNative(deployContractWithActivePrediction, isVerbose);
  });
}