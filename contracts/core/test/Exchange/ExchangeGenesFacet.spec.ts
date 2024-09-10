import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Contract } from "ethers";

import { amount } from "@gemunion/contracts-constants";
import { VRFCoordinatorV2PlusMock } from "../../typechain-types";
import { deployDiamond, deployErc721Base, wrapOneToOneSignature } from "./shared";
import { deployLinkVrfFixture } from "../shared/link";
import { randomRequest } from "../shared/randomRequest";
import { isEqualEventArgObj, mixGenes, decodeNumber, generateRandomGenes } from "../utils";
import { externalId, params, tokenAttributes } from "../constants";

const isVerbose = process.env.VERBOSE === "true";

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

  const getSignatures = async (contractInstance: Contract) => {
    const [owner] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    return wrapOneToOneSignature(network, contractInstance, "EXCHANGE", owner);
  };

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

  describe("breed", function () {
    describe("ERC721Genes", function () {
      it("should breed", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const motherGenes = generateRandomGenes();
        const fatherGenes = generateRandomGenes();

        const exchangeInstance = await factory();
        const erc721Instance = await deployErc721Base("ERC721GenesHardhat", exchangeInstance);

        const tx01 = await erc721Instance.setSubscriptionId(subId);
        await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

        const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
        await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

        await erc721Instance.mintGenes(receiver.address, 1, motherGenes);
        await erc721Instance.mintGenes(receiver.address, 2, fatherGenes);

        await erc721Instance.connect(receiver).approve(exchangeInstance.target, 1);
        await erc721Instance.connect(receiver).approve(exchangeInstance.target, 2);

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
          account: receiver.address,
          params,
          item: mother,
          price: father,
        });

        const breedTx = exchangeInstance.connect(receiver).breed(params, mother, father, signature);

        await expect(breedTx)
          .to.emit(exchangeInstance, "Breed")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgObj({ tokenType: "2", token: erc721Instance.target, tokenId: "1", amount: `${amount}` }),
            isEqualEventArgObj({ tokenType: "2", token: erc721Instance.target, tokenId: "2", amount: `${amount}` }),
          );

        await randomRequest(exchangeInstance, vrfInstance, 54321n);

        const newTokenId = await erc721Instance.totalSupply();
        const newTokenOwner = await erc721Instance.ownerOf(newTokenId);
        expect(newTokenOwner).to.equal(receiver.address);

        const newGenes = await erc721Instance.getRecordFieldValue(newTokenId, tokenAttributes.GENES);

        const mintGenesEvent = await erc721Instance.queryFilter(erc721Instance.filters.MintGenes());
        if (mintGenesEvent.length > 0) {
          const randomWord = mintGenesEvent[0].args.randomWords[0];
          const expectedNewGenes = mixGenes(motherGenes, fatherGenes, randomWord);
          expect(newGenes).to.equal(expectedNewGenes);
          expect(decodeNumber(newGenes).baseColor).to.equal(decodeNumber(expectedNewGenes).baseColor);
        }

        const decodedGenes = await erc721Instance.decodeNumber(newGenes);

        if (isVerbose) {
          console.info("New Genes:", decodedGenes);
        }

        expect(decodedGenes.baseColor).to.be.greaterThan(0);
        expect(decodedGenes.highlightColor).to.be.greaterThan(0);
        expect(decodedGenes.accentColor).to.be.greaterThan(0);
        expect(decodedGenes.mouth).to.be.greaterThan(0);
        expect(decodedGenes.fur).to.be.greaterThan(0);
        expect(decodedGenes.pattern).to.be.greaterThan(0);
        expect(decodedGenes.eyeShape).to.be.greaterThan(0);
        expect(decodedGenes.eyeColor).to.be.greaterThan(0);
        expect(decodedGenes.wild).to.be.greaterThan(0);
        expect(decodedGenes.environment).to.be.greaterThan(0);
        expect(decodedGenes.secret).to.be.greaterThan(0);
        expect(decodedGenes.purrstige).to.be.greaterThan(0);
      });
    });

    it("should fail: NotOwnerNorApproved", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721GenesHardhat", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(receiver.address, 1, motherGenes);
      await erc721Instance.mintGenes(receiver.address, 2, fatherGenes);

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
        account: receiver.address,
        params,
        item: mother,
        price: father,
      });

      const breedTx = exchangeInstance.connect(receiver).breed(params, mother, father, signature);

      await expect(breedTx).to.be.revertedWithCustomError(erc721Instance, "NotOwnerNorApproved");
    });

    it.skip("should fail: PregnancyFrequencyExceeded", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721GenesHardhat", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(receiver.address, 1, motherGenes);
      await erc721Instance.mintGenes(receiver.address, 2, fatherGenes);

      await erc721Instance.connect(receiver).approve(exchangeInstance.target, 1);
      await erc721Instance.connect(receiver).approve(exchangeInstance.target, 2);

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
        account: receiver.address,
        params,
        item: mother,
        price: father,
      });

      await exchangeInstance.connect(receiver).breed(params, mother, father, signature);

      await randomRequest(exchangeInstance, vrfInstance, 54321n);

      const params2 = {
        ...params,
        nonce: "0x" + ethers.hexlify(ethers.randomBytes(32)).slice(2),
      };

      const signature2 = await generateSignature({
        account: receiver.address,
        params: params2,
        item: mother,
        price: father,
      });

      const breedTx = exchangeInstance.connect(receiver).breed(params2, mother, father, signature2);

      await expect(breedTx).to.be.revertedWithCustomError(exchangeInstance, "PregnancyFrequencyExceeded");
    });

    it("should fail: PregnancyThresholdExceeded", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721GenesHardhat", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(receiver.address, 1, motherGenes);
      await erc721Instance.mintGenes(receiver.address, 2, fatherGenes);

      await erc721Instance.connect(receiver).approve(exchangeInstance.target, 1);
      await erc721Instance.connect(receiver).approve(exchangeInstance.target, 2);

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

      for (let i = 0; i < 3; i++) {
        const params2 = {
          ...params,
          nonce: "0x" + ethers.hexlify(ethers.randomBytes(32)).slice(2),
        };

        const signature2 = await generateSignature({
          account: receiver.address,
          params: params2,
          item: mother,
          price: father,
        });

        await exchangeInstance.connect(receiver).breed(params2, mother, father, signature2);
        await randomRequest(exchangeInstance, vrfInstance, BigInt(i + 1));
      }

      const signature = await generateSignature({
        account: receiver.address,
        params: params,
        item: mother,
        price: father,
      });

      const breedTx = exchangeInstance.connect(receiver).breed(params, mother, father, signature);

      await expect(breedTx).to.be.revertedWithCustomError(exchangeInstance, "PregnancyThresholdExceeded");
    });

    it("should fail: SignerMissingRole", async function () {
      const [_owner, receiver, stranger] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance = await deployErc721Base("ERC721GenesHardhat", exchangeInstance);

      const tx01 = await erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      await erc721Instance.mintGenes(receiver.address, 1, motherGenes);
      await erc721Instance.mintGenes(receiver.address, 2, fatherGenes);

      await erc721Instance.connect(receiver).approve(exchangeInstance.target, 1);
      await erc721Instance.connect(receiver).approve(exchangeInstance.target, 2);

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
        account: receiver.address,
        params,
        item: mother,
        price: father,
      });

      const breedTx = exchangeInstance.connect(stranger).breed(params, mother, father, signature);

      await expect(breedTx).to.be.revertedWithCustomError(exchangeInstance, "SignerMissingRole");
    });

    it("should fail: GenesDifferentContracts", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const motherGenes = generateRandomGenes();
      const fatherGenes = generateRandomGenes();

      const exchangeInstance = await factory();
      const erc721Instance1 = await deployErc721Base("ERC721GenesHardhat", exchangeInstance);
      const erc721Instance2 = await deployErc721Base("ERC721GenesHardhat", exchangeInstance);

      const tx01 = await erc721Instance1.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance1, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = await vrfInstance.addConsumer(subId, erc721Instance1);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance1);

      await erc721Instance1.mintGenes(receiver.address, 1, motherGenes);
      await erc721Instance2.mintGenes(receiver.address, 2, fatherGenes);

      await erc721Instance1.connect(receiver).approve(exchangeInstance.target, 1);
      await erc721Instance2.connect(receiver).approve(exchangeInstance.target, 1);

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
        account: receiver.address,
        params,
        item: mother,
        price: father,
      });

      const breedTx = exchangeInstance.connect(receiver).breed(params, mother, father, signature);

      await expect(breedTx).to.be.revertedWithCustomError(exchangeInstance, "GenesDifferentContracts");
    });
  });
});