import { expect } from "chai";
import { ethers } from "hardhat";

import type { IERC721EnumOptions } from "@ethberry/contracts-erc721e";

import { tokenId } from "../../../constants";
import { customMintCommonERC721 } from "../customMintFn";

export function shouldTransferFrom(factory: () => Promise<any>, options: IERC721EnumOptions = {}) {
  const { mint = customMintCommonERC721, tokenId: defaultTokenId = tokenId } = options;

  describe("transferFrom", function () {
    it("should fail: can't be transferred", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await mint(contractInstance, owner, owner);
      const tx = contractInstance.transferFrom(owner, receiver, defaultTokenId);
      await expect(tx).to.be.revertedWithCustomError(contractInstance, "Soulbound");
    });

    it("should fail: can't be transferred by approved", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await mint(contractInstance, owner, owner);
      await contractInstance.approve(receiver, defaultTokenId);

      const tx = contractInstance.connect(receiver).transferFrom(owner, receiver, defaultTokenId);
      await expect(tx).to.be.revertedWithCustomError(contractInstance, "Soulbound");
    });
  });
}