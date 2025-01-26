import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { VRFCoordinatorV2PlusMock } from "../../../../typechain-types";
import { fatherGenes, genesTokenAttributes, motherGenes, templateId } from "../../../constants";
import { randomRequest } from "../../../shared/randomRequest";
import { deployLinkVrfFixture } from "../../../shared/link";

export function shouldBreed(factory: () => Promise<any>) {
  describe("breed", function () {
    let vrfInstance: VRFCoordinatorV2PlusMock;
    let subId: bigint;

    before(async function () {
      await network.provider.send("hardhat_reset");

      // https://github.com/NomicFoundation/hardhat/issues/2980
      ({ vrfInstance, subId } = await loadFixture(function exchange() {
        return deployLinkVrfFixture();
      }));
    });

    it("breed should mix genes to generate attribute fields", async function () {
      const [owner] = await ethers.getSigners();

      const erc721Instance = await factory();

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      // Mint two tokens for breeding
      await erc721Instance.mintGenes(owner, templateId, motherGenes);
      await erc721Instance.mintGenes(owner, templateId, fatherGenes);

      // Breed the two tokens
      await erc721Instance.breed(owner, 1, 2);

      // Simulate Chainlink VRF response
      await randomRequest(erc721Instance, vrfInstance, 54321n);

      const current = await time.latest();

      const newTokenId = await erc721Instance.totalSupply();
      expect(newTokenId).to.be.equal(3n);

      const newTokenOwner = await erc721Instance.ownerOf(newTokenId);
      expect(newTokenOwner).to.equal(owner);

      const motherId = await erc721Instance.getRecordFieldValue(newTokenId, genesTokenAttributes.MOTHER_ID);
      expect(motherId).to.be.equal(1);
      const fatherId = await erc721Instance.getRecordFieldValue(newTokenId, genesTokenAttributes.FATHER_ID);
      expect(fatherId).to.be.equal(2);

      // Check pregnancy attributes for mother
      const motherPregnancyCounter = await erc721Instance.getRecordFieldValue(
        1,
        genesTokenAttributes.PREGNANCY_COUNTER,
      );
      const motherPregnancyTimestamp = await erc721Instance.getRecordFieldValue(
        1,
        genesTokenAttributes.PREGNANCY_TIMESTAMP,
      );
      expect(motherPregnancyCounter).to.be.equal(1);
      expect(motherPregnancyTimestamp).to.be.equal(current);

      // Check pregnancy attributes for father
      const fatherPregnancyCounter = await erc721Instance.getRecordFieldValue(
        2,
        genesTokenAttributes.PREGNANCY_COUNTER,
      );
      const fatherPregnancyTimestamp = await erc721Instance.getRecordFieldValue(
        2,
        genesTokenAttributes.PREGNANCY_TIMESTAMP,
      );
      expect(fatherPregnancyCounter).to.be.equal(1);
      expect(fatherPregnancyTimestamp).to.be.equal(current);
    });

    it("should fail: NotOwnerNorApproved", async function () {
      const [owner, _receiver, stranger] = await ethers.getSigners();

      const erc721Instance = await factory();

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(owner, templateId, motherGenes);
      await erc721Instance.mintGenes(owner, templateId, fatherGenes);

      const tx = erc721Instance.breed(stranger, 1, 2);
      await expect(tx).to.be.revertedWithCustomError(erc721Instance, "NotOwnerNorApproved").withArgs(stranger);
    });

    it("should revert if one of the tokens does not exist", async function () {
      const [owner] = await ethers.getSigners();

      const erc721Instance = await factory();

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(owner, templateId, motherGenes);

      const tx = erc721Instance.breed(owner, 1, 999);
      await expect(tx).to.be.revertedWithCustomError(erc721Instance, "ERC721NonexistentToken");
    });
  });
}
