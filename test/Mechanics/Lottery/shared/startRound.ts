import { expect } from "chai";
import { ethers } from "hardhat";
import { ZeroAddress, toQuantity } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { isEqualEventArgObj } from "../../../utils";
import { TokenType } from "../../../types";
import { price } from "../constants";

export function shouldStartRound(factory: () => Promise<any>) {
  describe("startRound", function () {
    it("should start a new round with valid ERC721 ticket asset", async function () {
      const lotteryInstance = await factory();

      const roundId = 1n;
      const maxTicket = 100n;

      const ticket = {
        tokenType: TokenType.ERC721,
        token: ZeroAddress,
        tokenId: 1n,
        amount: 1n,
      };

      const startTimestamp = (await time.latest()) + 1;
      const tx = lotteryInstance.startRound(ticket, price, 100);

      await expect(tx)
        .to.emit(lotteryInstance, "RoundStarted")
        .withArgs(
          roundId,
          toQuantity(startTimestamp),
          maxTicket,
          isEqualEventArgObj(ticket),
          isEqualEventArgObj(price),
        );

      const roundInfo = await lotteryInstance.getCurrentRoundInfo();

      expect(roundInfo.roundId).to.equal(1);
      expect(roundInfo.maxTicket).to.equal(100);
    });

    it("should fail: WrongAsset", async function () {
      const lotteryInstance = await factory();

      const ticket = {
        tokenType: TokenType.ERC20, // ERC20 TokenType
        token: ZeroAddress,
        tokenId: 1n,
        amount: 1n,
      };

      const tx = lotteryInstance.startRound(ticket, price, 100);
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "WrongAsset");
    });

    it("should fail: LotteryRoundNotComplete", async function () {
      const lotteryInstance = await factory();

      const ticket = {
        tokenType: TokenType.ERC721, // ERC721 TokenType
        token: ZeroAddress,
        tokenId: 0n,
        amount: 1n,
      };

      // Start the first round
      await lotteryInstance.startRound(ticket, price, 100);

      // Attempt to start another round without ending the previous one
      const tx = lotteryInstance.startRound(ticket, price, 100);
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "LotteryRoundNotComplete");
    });

    it("should fail: AccessControlUnauthorizedAccount", async function () {
      const lotteryInstance = await factory();
      const [_, nonAdmin] = await ethers.getSigners();

      const ticket = {
        tokenType: TokenType.ERC721, // ERC721 TokenType
        token: ZeroAddress,
        tokenId: 0n,
        amount: 1n,
      };

      // Attempt to start a round with a non-admin account
      const tx = lotteryInstance.connect(nonAdmin).startRound(ticket, price, 100);
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "AccessControlUnauthorizedAccount");
    });
  });
}
