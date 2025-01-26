import { expect } from "chai";
import { ethers, network } from "hardhat";
import { ZeroAddress } from "ethers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { MINTER_ROLE } from "@ethberry/contracts-constants";

import { VRFCoordinatorV2PlusMock } from "../../../../typechain-types";
import { TokenType } from "../../../types";
import { deployERC721 } from "../../../ERC721/shared/fixtures";
import { deployLinkVrfFixture } from "../../../shared/link";
import { randomRequest } from "../../../shared/randomRequest";
import { getNumbersBytes } from "../../../utils";
import { amount, price } from "../constants";

export function shouldReleaseFunds(factory: () => Promise<any>) {
  describe("releaseFunds", function () {
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

    it("should fail: AccessControlUnauthorizedAccount", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const lotteryInstance = await factory();

      const tx = lotteryInstance.connect(receiver).releaseFunds(1);
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "AccessControlUnauthorizedAccount");
    });

    it("should fail: LotteryWrongRound", async function () {
      const lotteryInstance = await factory();

      const tx = lotteryInstance.releaseFunds(999);
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "LotteryWrongRound");
    });

    it("should fail: LotteryZeroBalance", async function () {
      const lotteryInstance = await factory();

      const ticket = {
        tokenType: TokenType.ERC721,
        token: ZeroAddress,
        tokenId: 1n,
        amount: 1n,
      };

      await lotteryInstance.startRound(ticket, price, 100);

      await lotteryInstance.setSubscriptionId(subId);
      await vrfInstance.addConsumer(subId, lotteryInstance.target);

      await lotteryInstance.endRound();
      await randomRequest(lotteryInstance, vrfInstance);

      const tx = lotteryInstance.releaseFunds(1);
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "LotteryZeroBalance");
    });

    it("should fail: LotteryRoundNotComplete", async function () {
      const [owner] = await ethers.getSigners();

      const lotteryInstance = await factory();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const ticket = {
        tokenType: TokenType.ERC721,
        token: erc721TicketInstance,
        tokenId: 1n,
        amount: 1n,
      };

      await lotteryInstance.startRound(ticket, price, 100);

      const values = [29, 15, 27, 14, 31, 19];
      const ticketNumbers = getNumbersBytes(values);

      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance);

      await lotteryInstance.printTicket(1, owner, ticketNumbers, price, { value: amount });

      await lotteryInstance.setSubscriptionId(subId);
      await vrfInstance.addConsumer(subId, lotteryInstance.target);

      await lotteryInstance.endRound();
      await randomRequest(lotteryInstance, vrfInstance);

      const tx = lotteryInstance.releaseFunds(1);
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "LotteryRoundNotComplete");
    });

    it("should release funds successfully", async function () {
      const lotteryInstance = await factory();
      const [owner] = await ethers.getSigners();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const ticket = {
        tokenType: TokenType.ERC721,
        token: erc721TicketInstance,
        tokenId: 1n,
        amount: 1n,
      };

      await lotteryInstance.startRound(ticket, price, 100);

      const values = [29, 15, 27, 14, 31, 19];
      const ticketNumbers = getNumbersBytes(values);

      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance);

      await lotteryInstance.printTicket(1, owner, ticketNumbers, price, { value: amount });

      await lotteryInstance.setSubscriptionId(subId);
      await vrfInstance.addConsumer(subId, lotteryInstance.target);

      await lotteryInstance.endRound();
      await randomRequest(lotteryInstance, vrfInstance);

      const current = await time.latest();
      await time.increaseTo(current + 2592000);

      const tx = lotteryInstance.releaseFunds(1);
      await expect(tx).to.emit(lotteryInstance, "Released").withArgs(1, 31429);
    });
  });
}
