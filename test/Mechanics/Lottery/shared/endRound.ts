import { expect } from "chai";
import { ethers, network } from "hardhat";
import { ZeroAddress } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { VRFCoordinatorV2PlusMock } from "../../../../typechain-types";
import { deployLinkVrfFixture } from "../../../shared/link";
import { randomRequest } from "../../../shared/randomRequest";
import { TokenType } from "../../../types";

export function shouldEndRound(factory: () => Promise<any>) {
  describe("endRound", function () {
    let vrfInstance: VRFCoordinatorV2PlusMock;
    let subId: bigint;

    before(async function () {
      await network.provider.send("hardhat_reset");

      ({ vrfInstance, subId } = await loadFixture(function exchange() {
        return deployLinkVrfFixture();
      }));
    });

    after(async function () {
      await network.provider.send("hardhat_reset");
    });

    it("should end the current round", async function () {
      const lotteryInstance = await factory();

      const ticket = {
        tokenType: TokenType.ERC721,
        token: ZeroAddress,
        tokenId: 0n,
        amount: 1n,
      };

      const price = {
        tokenType: TokenType.ERC20,
        token: ZeroAddress,
        tokenId: 0n,
        amount: 1n,
      };

      await lotteryInstance.startRound(ticket, price, 100);

      await lotteryInstance.setSubscriptionId(subId);
      await vrfInstance.addConsumer(subId, lotteryInstance.target);

      const tx = lotteryInstance.endRound();
      await expect(tx).to.emit(lotteryInstance, "RoundEnded");

      const currentTimestamp = await time.latest();
      await randomRequest(lotteryInstance, vrfInstance);

      const roundInfo = await lotteryInstance.getCurrentRoundInfo();
      expect(roundInfo.endTimestamp).to.equal(currentTimestamp);
    });

    it("should fail: AccessControlUnauthorizedAccount", async function () {
      const lotteryInstance = await factory();
      const [_, nonAdmin] = await ethers.getSigners();

      const tx = lotteryInstance.connect(nonAdmin).endRound();
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "AccessControlUnauthorizedAccount");
    });

    it("should fail: LotteryRoundNotActive", async function () {
      const lotteryInstance = await factory();

      const ticket = {
        tokenType: TokenType.ERC721,
        token: ZeroAddress,
        tokenId: 0n,
        amount: 1n,
      };

      const price = {
        tokenType: TokenType.ERC20,
        token: ZeroAddress,
        tokenId: 0n,
        amount: 1n,
      };

      await lotteryInstance.startRound(ticket, price, 100);

      await lotteryInstance.setSubscriptionId(subId);
      await vrfInstance.addConsumer(subId, lotteryInstance.target);

      // End the round first
      await lotteryInstance.endRound();

      // Attempt to end the round again
      const tx = lotteryInstance.endRound();
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "LotteryRoundNotActive");
    });
  });
}
