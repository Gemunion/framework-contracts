import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { templateId } from "../../../constants";
import { deployLinkVrfFixture } from "../../../shared/link";
import { VRFCoordinatorV2PlusMock } from "../../../../typechain-types";
import { randomRequest } from "../../../shared/randomRequest";

export function shouldBehaveLikeERC721BlacklistRandom(factory: () => Promise<any>) {
  describe("Black list", function () {
    let vrfInstance: VRFCoordinatorV2PlusMock;
    let subId: bigint;

    before(async function () {
      await network.provider.send("hardhat_reset");

      // https://github.com/NomicFoundation/hardhat/issues/2980
      ({ vrfInstance, subId } = await loadFixture(function shouldMintRandom() {
        return deployLinkVrfFixture();
      }));
    });

    it("should fail: BlackListError", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const contractInstance = await factory();

      await vrfInstance.addConsumer(subId, contractInstance);

      await contractInstance.blacklist(receiver.address);
      const tx = contractInstance.mintRandom(receiver.address, templateId);

      if (network.name === "hardhat") {
        await randomRequest(contractInstance, vrfInstance);
      }

      await expect(tx).to.be.revertedWithCustomError(contractInstance, "BlackListError").withArgs(receiver.address);
    });
  });
}
