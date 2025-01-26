import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, encodeBytes32String, ZeroAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { amount, MINTER_ROLE } from "@ethberry/contracts-constants";

import { VRFCoordinatorV2PlusMock } from "../../typechain-types";
import { deployLinkVrfFixture } from "../shared/link";
import { randomRequest } from "../shared/randomRequest";
import { generateRandomGenes, isEqualEventArgObj } from "../utils";
import { externalId, genesTokenAttributes, params } from "../constants";
import { deployDiamond, deployErc721Base, wrapOneToOneSignature } from "./shared";

describe("Diamond Exchange Genes", function () {
  const factory = async (facetName = "ExchangeGenesFacet"): Promise<any> => {
    const diamondInstance = await deployDiamond(
      "DiamondExchange",
      [facetName, "AccessControlFacet", "PausableFacet"],
      "DiamondExchangeInit",
      {
        logSelectors: false,
      },
    );
    return ethers.getContractAt(facetName, diamondInstance);
  };

  let vrfInstance: VRFCoordinatorV2PlusMock;
  let subId: bigint;

  before(async function () {
    await network.provider.send("hardhat_reset");

    // https://github.com/NomicFoundation/hardhat/issues/2980
    ({ vrfInstance, subId } = await loadFixture(function exchange() {
      return deployLinkVrfFixture();
    }));
  });

  const getSignatures = async (contractInstance: Contract) => {
    const [owner] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    return wrapOneToOneSignature(network, contractInstance, "EXCHANGE", owner);
  };

  describe("breed", function () {
    it("should breed", async function () {
      const [owner] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721Genes", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(owner.address, 1, motherGenes);
      await erc721Instance.mintGenes(owner.address, 2, fatherGenes);

      const generateSignature = await getSignatures(exchangeInstance);

      const mother = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 1n,
        amount,
      };

      const father = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 2n,
        amount,
      };

      const params1 = {
        ...params,
        receiver: owner.address,
      };

      const signature = await generateSignature({
        account: owner.address,
        params: params1,
        item: mother,
        price: father,
      });

      const tx = exchangeInstance.breed(params1, mother, father, signature);

      await expect(tx)
        .to.emit(exchangeInstance, "Breed")
        .withArgs(
          owner.address,
          externalId,
          isEqualEventArgObj({
            tokenType: 2n,
            token: erc721Instance.target,
            tokenId: 1n,
            amount,
          }),
          isEqualEventArgObj({
            tokenType: 2n,
            token: erc721Instance.target,
            tokenId: 2n,
            amount,
          }),
        );

      await randomRequest(exchangeInstance, vrfInstance, 54321n);

      const current = await time.latest();

      const newTokenId = await erc721Instance.totalSupply();
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
      expect(motherPregnancyTimestamp).equal(current);

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
      expect(fatherPregnancyTimestamp).equal(current);
    });

    it("should fail: NotOwnerNorApproved, ZeroAddress", async function () {
      const [owner, _receiver] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721Genes", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(owner.address, 1, motherGenes);
      await erc721Instance.mintGenes(owner.address, 2, fatherGenes);

      const generateSignature = await getSignatures(exchangeInstance);

      const mother = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 1n,
        amount,
      };

      const father = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 2n,
        amount,
      };

      const signature = await generateSignature({
        account: owner.address,
        params,
        item: mother,
        price: father,
      });

      const tx = exchangeInstance.breed(params, mother, father, signature);
      await expect(tx).to.be.revertedWithCustomError(erc721Instance, "NotOwnerNorApproved").withArgs(ZeroAddress);
    });

    it("should fail: PregnancyFrequencyExceeded", async function () {
      const [owner] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721Genes", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(owner.address, 1, motherGenes);
      await erc721Instance.mintGenes(owner.address, 2, fatherGenes);

      const generateSignature = await getSignatures(exchangeInstance);

      const mother = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 1n,
        amount,
      };

      const father = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 2n,
        amount,
      };

      const nonce1 = encodeBytes32String("nonce1");
      const params1 = {
        ...params,
        nonce: nonce1,
        receiver: owner.address,
      };

      const signature1 = await generateSignature({
        account: owner.address,
        params: params1,
        item: mother,
        price: father,
      });

      await exchangeInstance.breed(params1, mother, father, signature1);
      await randomRequest(exchangeInstance, vrfInstance, 54321n);

      const current = await time.latest();

      const motherPregnancyCounter = await erc721Instance.getRecordFieldValue(
        1,
        genesTokenAttributes.PREGNANCY_COUNTER,
      );
      expect(motherPregnancyCounter).to.be.equal(1);
      const motherPregnancyTimestamp = await erc721Instance.getRecordFieldValue(
        1,
        genesTokenAttributes.PREGNANCY_TIMESTAMP,
      );
      expect(motherPregnancyTimestamp).equal(current);

      const fatherPregnancyCounter = await erc721Instance.getRecordFieldValue(
        2,
        genesTokenAttributes.PREGNANCY_COUNTER,
      );
      expect(fatherPregnancyCounter).to.be.equal(1);
      const fatherPregnancyTimestamp = await erc721Instance.getRecordFieldValue(
        2,
        genesTokenAttributes.PREGNANCY_TIMESTAMP,
      );
      expect(fatherPregnancyTimestamp).equal(current);

      const nonce2 = encodeBytes32String("nonce1");
      const params2 = {
        ...params,
        nonce: nonce2,
        receiver: owner.address,
      };

      const signature2 = await generateSignature({
        account: owner.address,
        params: params2,
        item: mother,
        price: father,
      });

      const tx = exchangeInstance.breed(params2, mother, father, signature2);
      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "PregnancyFrequencyExceeded");
    });

    it("should fail: PregnancyThresholdExceeded", async function () {
      const [owner] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721Genes", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(owner.address, 1, motherGenes);
      await erc721Instance.mintGenes(owner.address, 2, fatherGenes);

      const generateSignature = await getSignatures(exchangeInstance);

      const mother = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 1n,
        amount,
      };

      const father = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 2n,
        amount,
      };

      const pregnancyThresholdLimit = await exchangeInstance.PREGNANCY_THRESHOLD_LIMIT();
      const pregnancyFrequencyLimit = await exchangeInstance.PREGNANCY_FREQUENCY_LIMIT();

      for (let i = 0; i < pregnancyThresholdLimit; i++) {
        const params1 = {
          ...params,
          nonce: encodeBytes32String(`nonce${i}`),
          receiver: owner.address,
        };

        const signature2 = await generateSignature({
          account: owner.address,
          params: params1,
          item: mother,
          price: father,
        });

        await exchangeInstance.breed(params1, mother, father, signature2);
        await randomRequest(exchangeInstance, vrfInstance, BigInt(i));
        await time.increase(pregnancyFrequencyLimit);
      }

      const params2 = {
        ...params,
        receiver: owner.address,
      };

      const signature = await generateSignature({
        account: owner.address,
        params: params2,
        item: mother,
        price: father,
      });

      const tx = exchangeInstance.breed(params2, mother, father, signature);
      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "PregnancyThresholdExceeded");
    });

    it("should fail: SignerMissingRole", async function () {
      const [owner] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721Genes", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(owner.address, 1, motherGenes);
      await erc721Instance.mintGenes(owner.address, 2, fatherGenes);

      const accessInstance = await ethers.getContractAt("AccessControlFacet", exchangeInstance);
      await accessInstance.renounceRole(MINTER_ROLE, owner.address);

      const generateSignature = await getSignatures(exchangeInstance);

      const mother = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 1n,
        amount,
      };

      const father = {
        tokenType: 2,
        token: erc721Instance.target,
        tokenId: 2n,
        amount,
      };

      const signature = await generateSignature({
        account: owner.address,
        params,
        item: mother,
        price: father,
      });

      const tx = exchangeInstance.breed(params, mother, father, signature);
      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "SignerMissingRole");
    });

    it("should fail: GenesDifferentContracts", async function () {
      const [owner] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance1 = await deployErc721Base("ERC721Genes", exchangeInstance);
      const erc721Instance2 = await deployErc721Base("ERC721Genes", exchangeInstance);

      await erc721Instance1.mintGenes(owner.address, 1, motherGenes);
      await erc721Instance2.mintGenes(owner.address, 2, fatherGenes);

      const generateSignature = await getSignatures(exchangeInstance);

      const mother = {
        tokenType: 2,
        token: erc721Instance1.target,
        tokenId: 1n,
        amount,
      };

      const father = {
        tokenType: 2,
        token: erc721Instance2.target,
        tokenId: 2n,
        amount,
      };

      const signature = await generateSignature({
        account: owner.address,
        params,
        item: mother,
        price: father,
      });

      const tx = exchangeInstance.breed(params, mother, father, signature);
      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "GenesDifferentContracts");
    });
  });
});
