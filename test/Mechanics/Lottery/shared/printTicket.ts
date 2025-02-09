import { expect } from "chai";
import { ethers } from "hardhat";
import { ZeroAddress, toBeHex } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";
import { MINTER_ROLE } from "@ethberry/contracts-constants";

import { getBytesNumbersArr, getNumbersBytes } from "../../../utils";
import { TokenType } from "../../../types";
import { deployERC721 } from "../../../ERC721/shared/fixtures";
import { amount, price } from "../constants";
import { tokenId } from "../../../constants";
import { decodeMetadata } from "../../../shared/metadata";

export function shouldPrintTicket(factory: () => Promise<any>) {
  describe("printTicket", function () {
    it("should print a ticket successfully", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const lotteryInstance = await factory();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const ticket = {
        tokenType: TokenType.ERC721,
        token: erc721TicketInstance.target,
        tokenId: 1n,
        amount: 1n,
      };

      await lotteryInstance.startRound(ticket, price, 100);

      const values = [1, 2, 3, 4, 5, 6];
      const ticketNumbers = getNumbersBytes(values);

      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance);

      const tx = lotteryInstance.printTicket(1, receiver.address, ticketNumbers, price, { value: amount });

      await expect(tx).to.emit(erc721TicketInstance, "Transfer").withArgs(ZeroAddress, receiver.address, 1n);

      const newTicketId = await erc721TicketInstance.ownerOf(1n);
      expect(newTicketId).to.equal(receiver.address);

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721TicketInstance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta.ROUND).to.equal(1n);
      expect(toBeHex(decodedMeta.NUMBERS, 32)).to.equal(ticketNumbers);
      expect(getBytesNumbersArr(decodedMeta.NUMBERS)).to.have.all.members(values);
    });

    it("should fail: LotteryTicketLimitExceed", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const lotteryInstance = await factory();
      const erc721TicketInstance = await deployERC721("ERC721LotteryTicket");

      const ticket = {
        tokenType: TokenType.ERC721,
        token: erc721TicketInstance.target,
        tokenId: 1n,
        amount: 1n,
      };

      await lotteryInstance.startRound(ticket, price, 1);

      const values = [1, 2, 3, 4, 5, 6];
      const ticketNumbers = getNumbersBytes(values);

      await erc721TicketInstance.grantRole(MINTER_ROLE, lotteryInstance);

      await lotteryInstance.printTicket(1, receiver.address, ticketNumbers, price, { value: amount });

      const tx = lotteryInstance.printTicket(2, ZeroAddress, ticketNumbers, price, { value: amount });
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "LotteryTicketLimitExceed");
    });

    it("should fail: AccessControlUnauthorizedAccount", async function () {
      const lotteryInstance = await factory();
      const [_, nonMinter] = await ethers.getSigners();

      const values = [1, 2, 3, 4, 5, 6];
      const ticketNumbers = getNumbersBytes(values);

      const tx = lotteryInstance
        .connect(nonMinter)
        .printTicket(1, ZeroAddress, ticketNumbers, price, { value: amount });
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "AccessControlUnauthorizedAccount");
    });

    it("should fail: LotteryWrongRound", async function () {
      const lotteryInstance = await factory();

      const values = [1, 2, 3, 4, 5, 6];
      const ticketNumbers = getNumbersBytes(values);

      const tx = lotteryInstance.printTicket(1, ZeroAddress, ticketNumbers, price, { value: amount });
      await expect(tx).to.be.revertedWithCustomError(lotteryInstance, "LotteryWrongRound");
    });
  });
}
