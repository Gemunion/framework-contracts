import { expect } from "chai";
import { ethers } from "hardhat";

import { DEFAULT_ADMIN_ROLE, METADATA_ROLE, MINTER_ROLE, PREDICATE_ROLE } from "@ethberry/contracts-constants";

import { deployDiamond } from "../Exchange/shared";

describe("ContractManagerDiamond", function () {
  const factory = async (facetName = "AccessControlFacet"): Promise<any> => {
    const diamondInstance = await deployDiamond(
      "DiamondCM",
      [
        "ERC20FactoryFacet",
        "ERC721FactoryFacet",
        "ERC998FactoryFacet",
        "ERC1155FactoryFacet",
        "LotteryFactoryFacet",
        "MysteryBoxFactoryFacet",
        "PonziFactoryFacet",
        "RaffleFactoryFacet",
        "StakingFactoryFacet",
        "LegacyVestingFactoryFacet",
        "WaitListFactoryFacet",
        "UseFactoryFacet",
        "AccessControlFacet",
        "PausableFacet",
        "CollectionFactoryFacet",
      ],
      "DiamondCMInit",
      {
        logSelectors: false,
      },
    );
    return ethers.getContractAt(facetName, diamondInstance);
  };

  describe("addFactory", function () {
    describe("MINTER_ROLE", function () {
      it("should set minters (zero)", async function () {
        const contractInstance = await factory("UseFactoryFacet");

        const minters = await contractInstance.getMinters();
        expect(minters).to.have.lengthOf(0);
      });

      it("factory already exists", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        await contractInstance.addFactory(receiver, MINTER_ROLE);
        await contractInstance.addFactory(receiver, MINTER_ROLE);

        const minters = await contractInstance.getMinters();
        expect(minters).to.have.lengthOf(1);
      });

      it("should set minters (one)", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        await contractInstance.addFactory(receiver, MINTER_ROLE);

        const minters = await contractInstance.getMinters();
        expect(minters).to.have.lengthOf(1);
        expect(minters[0]).to.equal(receiver);
      });
    });

    describe("METADATA_ROLE", function () {
      it("should set manipulators (zero)", async function () {
        const contractInstance = await factory("UseFactoryFacet");

        const manipulators = await contractInstance.getManipulators();
        expect(manipulators).to.have.lengthOf(0);
      });

      it("factory already exists", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");
        await contractInstance.addFactory(receiver, METADATA_ROLE);
        await contractInstance.addFactory(receiver, METADATA_ROLE);

        const manipulators = await contractInstance.getManipulators();
        expect(manipulators).to.have.lengthOf(1);
      });

      it("should set manipulators (one)", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");
        await contractInstance.addFactory(receiver, METADATA_ROLE);

        const manipulators = await contractInstance.getManipulators();
        expect(manipulators).to.have.lengthOf(1);
        expect(manipulators[0]).to.equal(receiver);
      });
    });

    describe("PREDICATE_ROLE", function () {
      it("should fail add: wrong role", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        const tx = contractInstance.addFactory(receiver, PREDICATE_ROLE);
        await expect(tx).to.be.revertedWithCustomError(contractInstance, "WrongRole");
      });

      it("should fail: AccessControlUnauthorizedAccount", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        const tx = contractInstance.connect(receiver).addFactory(receiver, PREDICATE_ROLE);
        await expect(tx)
          .to.be.revertedWithCustomError(contractInstance, "AccessControlUnauthorizedAccount")
          .withArgs(receiver, DEFAULT_ADMIN_ROLE);
      });
    });
  });

  describe("removeFactory", function () {
    describe("MINTER_ROLE", function () {
      it("should remove minters", async function () {
        const [_owner, receiver, stranger] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        await contractInstance.addFactory(receiver, MINTER_ROLE);
        await contractInstance.addFactory(receiver, METADATA_ROLE);
        await contractInstance.addFactory(stranger, MINTER_ROLE);
        await contractInstance.addFactory(stranger, METADATA_ROLE);

        await contractInstance.removeFactory(receiver, MINTER_ROLE);

        const minters = await contractInstance.getMinters();
        expect(minters).to.have.lengthOf(1);
        expect(minters[0]).to.equal(stranger);

        const manipulators = await contractInstance.getManipulators();
        expect(manipulators).to.have.lengthOf(2);
        expect(manipulators[0]).to.equal(receiver);
        expect(manipulators[1]).to.equal(stranger);
      });
    });

    describe("METADATA_ROLE", function () {
      it("should remove manipulators", async function () {
        const [_owner, receiver, stranger] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        await contractInstance.addFactory(receiver, MINTER_ROLE);
        await contractInstance.addFactory(receiver, METADATA_ROLE);
        await contractInstance.addFactory(stranger, MINTER_ROLE);
        await contractInstance.addFactory(stranger, METADATA_ROLE);

        await contractInstance.removeFactory(receiver, METADATA_ROLE);

        const minters = await contractInstance.getMinters();
        expect(minters).to.have.lengthOf(2);
        expect(minters[0]).to.equal(receiver);
        expect(minters[1]).to.equal(stranger);

        const manipulators = await contractInstance.getManipulators();
        expect(manipulators).to.have.lengthOf(1);
        expect(manipulators[0]).to.equal(stranger);
      });
    });

    describe("PREDICATE_ROLE", function () {
      it("should fail add: wrong role", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        const tx = contractInstance.removeFactory(receiver, PREDICATE_ROLE);
        await expect(tx).to.be.revertedWithCustomError(contractInstance, "WrongRole");
      });

      it("should fail add: account is missing role", async function () {
        const [_owner, receiver] = await ethers.getSigners();

        const contractInstance = await factory("UseFactoryFacet");

        const tx = contractInstance.connect(receiver).removeFactory(receiver, PREDICATE_ROLE);
        await expect(tx)
          .to.be.revertedWithCustomError(contractInstance, "AccessControlUnauthorizedAccount")
          .withArgs(receiver, DEFAULT_ADMIN_ROLE);
      });
    });
  });
});
