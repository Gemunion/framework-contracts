import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, encodeBytes32String, ZeroAddress, ZeroHash } from "ethers";

import { amount, MINTER_ROLE } from "@gemunion/contracts-constants";

import { expiresAt, externalId, extra, params, templateId, tokenId } from "../constants";
import { isEqualArray, isEqualEventArgArrObj } from "../utils";
import { deployDiamond, deployErc1155Base, deployErc20Base, deployErc721Base, wrapManyToManySignature } from "./shared";

describe("Diamond Exchange Craft", function () {
  const factory = async (facetName = "ExchangeCraftFacet"): Promise<any> => {
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
    return wrapManyToManySignature(network, contractInstance, "EXCHANGE", owner);
  };

  describe("craft", function () {
    describe("NULL > NULL", function () {
      it("NULL > NULL", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [],
          price: [],
        });

        const tx1 = exchangeInstance.connect(receiver).craft(params, [], [], signature);

        // https://github.com/TrueFiEng/Waffle/pull/751
        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          .withArgs(receiver.address, externalId, isEqualArray([]), isEqualArray([]));
      });
    });

    describe("NULL > ERC721", function () {
      it("should purchase", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1n,
            },
          ],
          price: [],
        });

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          [],
          signature,
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgArrObj({
              tokenType: 2n,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1n,
            }),
            isEqualArray([]),
          );
      });
    });

    describe("NULL > ERC1155", function () {
      it("should purchase", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
          price: [],
        });

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          [],
          signature,
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgArrObj({
              tokenType: 4n,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            }),
            isEqualArray([]),
          );
      });
    });

    describe("ERC20 > ERC721", function () {
      it("should craft", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1n,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgArrObj({
              tokenType: 2n,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1n,
            }),
            isEqualEventArgArrObj({
              tokenType: 1n,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            }),
          )
          .to.emit(erc721Instance, "Transfer")
          .withArgs(ZeroAddress, receiver.address, tokenId)
          .to.emit(erc20Instance, "Transfer")
          .withArgs(receiver.address, ZeroAddress, amount);
      });

      it("should fail: ERC20InsufficientAllowance", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        await erc20Instance.mint(receiver.address, amount);
        // await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientAllowance")
          .withArgs(exchangeInstance, 0, amount);
      });

      it("should fail: ERC20InsufficientBalance", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        // await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientBalance")
          .withArgs(receiver.address, 0, amount);
      });
    });

    describe("ERC1155 > ERC721", function () {
      it("should craft", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1n,
            },
          ],
          price: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        await erc1155Instance.mint(receiver.address, tokenId, amount, "0x");
        await erc1155Instance.connect(receiver).setApprovalForAll(exchangeInstance, true);

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          // https://github.com/TrueFiEng/Waffle/pull/751
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgArrObj({
              tokenType: 2n,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1n,
            }),
            isEqualEventArgArrObj({
              tokenType: 4n,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            }),
          )
          .to.emit(erc1155Instance, "TransferSingle")
          .withArgs(exchangeInstance, receiver.address, ZeroAddress, tokenId, amount);
      });

      it("should fail: ERC1155MissingApprovalForAll", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        await erc1155Instance.mint(receiver.address, tokenId, amount, "0x");
        // await erc1155Instance.connect(receiver).setApprovalForAll(exchangeInstance, true);

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc1155Instance, "ERC1155MissingApprovalForAll")
          .withArgs(exchangeInstance, receiver.address);
      });

      it("should fail: ERC1155InsufficientBalance", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId,
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        // await erc1155Instance.mint(receiver.address, tokenId, amount, "0x");
        await erc1155Instance.connect(receiver).setApprovalForAll(exchangeInstance, true);

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId,
              amount: 1,
            },
          ],
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc1155Instance, "ERC1155InsufficientBalance")
          .withArgs(receiver.address, 0, amount, tokenId);
      });
    });

    describe("ERC20 > ERC1155", function () {
      it("should craft", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgArrObj({
              tokenType: 4n,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            }),
            isEqualEventArgArrObj({
              tokenType: 1n,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            }),
          )
          .to.emit(erc1155Instance, "TransferSingle")
          .withArgs(exchangeInstance, ZeroAddress, receiver.address, tokenId, amount)
          .to.emit(erc20Instance, "Transfer")
          .withArgs(receiver.address, ZeroAddress, amount);
      });

      it("should fail: ERC20InsufficientAllowance", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        await erc20Instance.mint(receiver.address, amount);
        // await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientAllowance")
          .withArgs(exchangeInstance, 0, amount);
      });

      it("should fail: ERC20InsufficientBalance", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        // await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientBalance")
          .withArgs(receiver.address, 0, amount);
      });
    });

    describe("ERC1155 > ERC1155", function () {
      it("should craft", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId: 2,
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            },
          ],
        });

        await erc1155Instance.mint(receiver.address, tokenId, amount, "0x");
        await erc1155Instance.connect(receiver).setApprovalForAll(exchangeInstance, true);

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId: 2,
              amount: 1,
            },
          ],
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgArrObj({
              tokenType: 4n,
              token: await erc1155Instance.getAddress(),
              tokenId: 2n,
              amount: 1n,
            }),
            isEqualEventArgArrObj({
              tokenType: 4n,
              token: await erc1155Instance.getAddress(),
              tokenId,
              amount,
            }),
          )
          .to.emit(erc1155Instance, "TransferSingle")
          .withArgs(exchangeInstance, receiver.address, ZeroAddress, tokenId, amount);
      });

      it("should fail: ERC1155MissingApprovalForAll", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId: 1,
              amount,
            },
          ],
          price: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId: 2,
              amount,
            },
          ],
        });

        await erc1155Instance.mint(receiver.address, 2, amount, "0x");
        // await erc1155Instance.connect(receiver).setApprovalForAll(exchangeInstance, true);

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId: 1,
              amount,
            },
          ],
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId: 2,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc1155Instance, "ERC1155MissingApprovalForAll")
          .withArgs(exchangeInstance, receiver.address);
      });

      it("should fail: ERC1155InsufficientBalance", async function () {
        const [_owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

        const signature = await generateSignature({
          account: receiver.address,
          params,
          items: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId: 1,
              amount,
            },
          ],
          price: [
            {
              tokenType: 4,
              token: await erc1155Instance.getAddress(),
              tokenId: 2,
              amount,
            },
          ],
        });

        // await erc1155Instance.mint(receiver.address, 2, amount, "0x");
        await erc1155Instance.connect(receiver).setApprovalForAll(exchangeInstance, true);

        const tx1 = exchangeInstance.connect(receiver).craft(
          params,
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId: 1,
              amount,
            },
          ],
          [
            {
              tokenType: 4,
              token: erc1155Instance,
              tokenId: 2,
              amount,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc1155Instance, "ERC1155InsufficientBalance")
          .withArgs(receiver.address, 0, amount, 2);
      });
    });

    describe("ERC20 + ERC721 > ERC20 + ERC721", function () {
      it("should craft and burn", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

        await erc20Instance.mint(owner.address, amount);
        await erc20Instance.approve(exchangeInstance, amount);

        await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx0 = erc721Instance.mintCommon(receiver.address, templateId);
        await expect(tx0).to.emit(erc721Instance, "Transfer").withArgs(ZeroAddress, receiver.address, tokenId);
        await erc721Instance.connect(receiver).approve(exchangeInstance, tokenId);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId: 2, // crafted 721 token
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId, // price 721 token
              amount: 1,
            },
          ],
        });

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId: 2, // crafted 721 token
              amount: 1,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId, // price 721 token
              amount: 1,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.emit(exchangeInstance, "Craft")
          .withArgs(
            receiver.address,
            externalId,
            isEqualEventArgArrObj(
              {
                tokenType: 1n,
                token: await erc20Instance.getAddress(),
                tokenId,
                amount,
              },
              {
                tokenType: 2n,
                token: await erc721Instance.getAddress(),
                tokenId: 2n, // crafted
                amount: 1n,
              },
            ),
            isEqualEventArgArrObj(
              {
                tokenType: 1n,
                token: await erc20Instance.getAddress(),
                tokenId,
                amount,
              },
              {
                tokenType: 2n,
                token: await erc721Instance.getAddress(),
                tokenId, // price 721 token
                amount: 1n,
              },
            ),
          )
          .to.emit(erc721Instance, "Transfer")
          .withArgs(ZeroAddress, receiver.address, 2 /* crafted 721 */)
          .to.emit(erc721Instance, "Transfer")
          .withArgs(receiver.address, ZeroAddress, tokenId)
          .to.emit(erc20Instance, "Transfer")
          .withArgs(owner.address, receiver.address, amount)
          .to.emit(erc20Instance, "Transfer")
          .withArgs(receiver.address, ZeroAddress, amount);
      });

      it("should fail: ERC20InsufficientAllowance", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

        await erc20Instance.mint(owner.address, amount);
        // await erc20Instance.approve(exchangeInstance, amount);

        await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx0 = erc721Instance.mintCommon(receiver.address, templateId);
        await expect(tx0).to.emit(erc721Instance, "Transfer").withArgs(ZeroAddress, receiver.address, tokenId);
        await erc721Instance.connect(receiver).approve(exchangeInstance, tokenId);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId: 2, // crafted 721 token
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId, // price 721 token
              amount: 1,
            },
          ],
        });

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId: 2, // crafted 721 token
              amount: 1,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId, // price 721 token
              amount: 1,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientAllowance")
          .withArgs(exchangeInstance, 0, amount);
      });

      it("should fail: ERC20InsufficientBalance", async function () {
        const [owner, receiver] = await ethers.getSigners();
        const exchangeInstance = await factory();
        const generateSignature = await getSignatures(exchangeInstance);
        const erc20Instance = await deployErc20Base("ERC20Simple", exchangeInstance);
        const erc721Instance = await deployErc721Base("ERC721Simple", exchangeInstance);

        await erc20Instance.mint(owner.address, amount * 2n - 1n);
        await erc20Instance.approve(exchangeInstance, amount * 2n);

        await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

        const tx0 = erc721Instance.mintCommon(receiver.address, templateId);
        await expect(tx0).to.emit(erc721Instance, "Transfer").withArgs(ZeroAddress, receiver.address, tokenId);
        await erc721Instance.connect(receiver).approve(exchangeInstance, tokenId);

        const signature = await generateSignature({
          account: receiver.address,
          params: {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          items: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount: amount * 2n,
            },
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId: 2, // crafted 721 token
              amount: 1,
            },
          ],
          price: [
            {
              tokenType: 1,
              token: await erc20Instance.getAddress(),
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: await erc721Instance.getAddress(),
              tokenId, // price 721 token
              amount: 1,
            },
          ],
        });

        const tx1 = exchangeInstance.connect(receiver).craft(
          {
            nonce: encodeBytes32String("nonce"),
            externalId,
            expiresAt,
            receiver: owner.address,
            referrer: ZeroAddress,
            extra,
          },
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount: amount * 2n,
            },
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId: 2, // crafted 721 token
              amount: 1,
            },
          ],
          [
            {
              tokenType: 1,
              token: erc20Instance,
              tokenId,
              amount,
            },
            {
              tokenType: 2,
              token: erc721Instance,
              tokenId, // price 721 token
              amount: 1,
            },
          ],
          signature,
        );

        await expect(tx1)
          .to.be.revertedWithCustomError(erc20Instance, "ERC20InsufficientBalance")
          .withArgs(owner.address, amount * 2n - 1n, amount * 2n);
      });
    });
  });

  describe("ERROR", function () {
    it("should fail: ExpiredSignature (duplicate mint)", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params,
        items: [],
        price: [],
      });

      const tx1 = exchangeInstance.connect(receiver).craft(params, [], [], signature);

      await expect(tx1).to.emit(exchangeInstance, "Craft");

      const tx2 = exchangeInstance.connect(receiver).craft(params, [], [], signature);
      await expect(tx2).to.be.revertedWithCustomError(exchangeInstance, "ExpiredSignature");
    });

    it("should fail: ECDSAInvalidSignature", async function () {
      const exchangeInstance = await factory();

      const tx = exchangeInstance.craft(params, [], [], encodeBytes32String("signature").padEnd(132, "0"));

      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "ECDSAInvalidSignature");
    });

    it("should fail: ECDSAInvalidSignatureLength", async function () {
      const exchangeInstance = await factory();
      const tx = exchangeInstance.craft(params, [], [], encodeBytes32String("signature"));

      await expect(tx).to.be.revertedWithCustomError(exchangeInstance, "ECDSAInvalidSignatureLength");
    });

    it("should fail: SignerMissingRole", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);

      const erc1155Instance = await deployErc1155Base("ERC1155Simple", exchangeInstance);

      const signature = await generateSignature({
        account: receiver.address,
        params,
        items: [
          {
            tokenType: 4,
            token: await erc1155Instance.getAddress(),
            tokenId: 2,
            amount: 1,
          },
        ],
        price: [
          {
            tokenType: 4,
            token: await erc1155Instance.getAddress(),
            tokenId,
            amount,
          },
        ],
      });

      await erc1155Instance.mint(receiver.address, tokenId, amount, "0x");
      await erc1155Instance.connect(receiver).setApprovalForAll(exchangeInstance, true);

      const accessInstance = await ethers.getContractAt("AccessControlFacet", exchangeInstance);
      await accessInstance.renounceRole(MINTER_ROLE, owner.address);

      const tx1 = exchangeInstance.connect(receiver).craft(
        params,
        [
          {
            tokenType: 4,
            token: erc1155Instance,
            tokenId: 2,
            amount: 1,
          },
        ],
        [
          {
            tokenType: 4,
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        signature,
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "SignerMissingRole");
    });

    it("should fail: EnforcedPause", async function () {
      const [_owner] = await ethers.getSigners();

      const exchangeInstance = await factory();
      const pausableInstance = await ethers.getContractAt("PausableFacet", exchangeInstance);
      await pausableInstance.pause();

      const tx1 = exchangeInstance.craft(
        params,
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        ZeroHash,
      );

      await expect(tx1).to.be.revertedWithCustomError(exchangeInstance, "EnforcedPause");
    });
  });
});
