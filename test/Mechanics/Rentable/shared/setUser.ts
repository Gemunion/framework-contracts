import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import type { IERC721EnumOptions } from "@ethberry/contracts-erc721e";
import { METADATA_ROLE } from "@ethberry/contracts-constants";

import { customMintCommonERC721 } from "../../../ERC721/shared/customMintFn";

export function shouldSetUser(factory: () => Promise<any>, options: IERC721EnumOptions = {}) {
  const { mint = customMintCommonERC721, tokenId: defaultTokenId = 1 } = options;

  describe("setUser", function () {
    it("should set a user to a token", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await mint(contractInstance, owner, owner);

      const current = await time.latest();
      const deadline = current + 100;

      await contractInstance.setUser(defaultTokenId, receiver, deadline.toString());

      const userOf = await contractInstance.userOf(defaultTokenId);

      expect(userOf).to.be.equal(receiver);
    });

    it("should fail: don't have permission to set a user", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await mint(contractInstance, owner, owner);

      const current = await time.latest();
      const deadline = current + 100;

      const tx = contractInstance.connect(receiver).setUser(defaultTokenId, receiver, deadline.toString());
      await expect(tx)
        .to.be.revertedWithCustomError(contractInstance, "AccessControlUnauthorizedAccount")
        .withArgs(receiver, METADATA_ROLE);
    });

    it("should set a user from approved address", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await mint(contractInstance, owner, owner);

      const current = await time.latest();
      const deadline = current + 100;

      await contractInstance.approve(receiver, defaultTokenId);
      await contractInstance.setUser(defaultTokenId, receiver, deadline.toString());

      const userOf = await contractInstance.userOf(defaultTokenId);

      expect(userOf).to.be.equal(receiver);
    });

    it("should set a user from approvedAll address", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await mint(contractInstance, owner, owner);

      const current = await time.latest();
      const deadline = current + 100;

      await contractInstance.setApprovalForAll(receiver, true);
      await contractInstance.setUser(defaultTokenId, receiver, deadline.toString());

      const userOf = await contractInstance.userOf(defaultTokenId);

      expect(userOf).to.be.equal(receiver);
    });

    it("emits a UpdateUser event", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await mint(contractInstance, owner, owner);

      const current = await time.latest();
      const deadline = current + 100;

      const tx = contractInstance.setUser(defaultTokenId, receiver, deadline.toString());

      await expect(tx).to.emit(contractInstance, "UpdateUser").withArgs(defaultTokenId, receiver, deadline.toString());
    });
  });
}
