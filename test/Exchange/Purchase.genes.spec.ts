import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, ZeroAddress, zeroPadBytes } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { amount, nonce } from "@ethberry/contracts-constants";
import { recursivelyDecodeResult } from "@framework/utils-eth";

import { VRFCoordinatorV2PlusMock } from "../../typechain-types";
import { deployLinkVrfFixture } from "../shared/link";
import { randomRequest } from "../shared/randomRequest";
import { expiresAt, externalId, motherGenes, tokenId } from "../constants";
import { deployERC1363 } from "../ERC20/shared/fixtures";
import { decodeMetadata } from "../shared/metadata";
import { TokenMetadata } from "../types";
import { deployDiamond, deployErc721Base, wrapOneToManySignature } from "./shared";

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
    return wrapOneToManySignature(network, contractInstance, "EXCHANGE", owner);
  };

  describe("purchase", function () {
    it("should purchase ERC721 Genes for ERC20", async function () {
      const [owner, receiver] = await ethers.getSigners();
      const exchangeInstance = await factory();
      const generateSignature = await getSignatures(exchangeInstance);
      const erc721Instance = await deployErc721Base("ERC721Genes", exchangeInstance);

      const erc20Instance = await deployERC1363("ERC20Simple");
      await erc20Instance.mint(receiver.address, amount);
      await erc20Instance.connect(receiver).approve(exchangeInstance, amount);

      const erc20Allowance = await erc20Instance.allowance(receiver.address, exchangeInstance);
      expect(erc20Allowance).to.equal(amount);

      // Set VRFV2 Subscription
      const tx01 = erc721Instance.setSubscriptionId(subId);
      await expect(tx01).to.emit(erc721Instance, "VrfSubscriptionSet").withArgs(subId);

      const tx02 = vrfInstance.addConsumer(subId, erc721Instance);
      await expect(tx02).to.emit(vrfInstance, "SubscriptionConsumerAdded").withArgs(subId, erc721Instance);

      const signature = await generateSignature({
        account: receiver.address,
        params: {
          externalId,
          expiresAt,
          nonce,
          extra: zeroPadBytes(`0x${motherGenes.toString(16)}`, 32),
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        item: {
          tokenType: 2,
          token: erc721Instance.target,
          tokenId,
          amount: 1,
        },
        price: [
          {
            tokenType: 1,
            token: erc20Instance.target,
            tokenId: 0,
            amount,
          },
        ],
      });

      const tx1 = exchangeInstance.connect(receiver).purchaseGenes(
        {
          externalId,
          expiresAt,
          nonce,
          extra: zeroPadBytes(`0x${motherGenes.toString(16)}`, 32),
          receiver: owner.address,
          referrer: ZeroAddress,
        },
        {
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1,
        },
        [
          {
            tokenType: 1,
            token: erc20Instance,
            tokenId: 0,
            amount,
          },
        ],
        signature,
      );

      await expect(tx1).to.emit(exchangeInstance, "PurchaseGenes");
      await randomRequest(erc721Instance, vrfInstance);

      // TEST METADATA
      const metadata = recursivelyDecodeResult(await erc721Instance.getTokenMetadata(tokenId));
      const decodedMeta = decodeMetadata(metadata as any[]);
      expect(decodedMeta[TokenMetadata.TEMPLATE_ID]).to.equal(tokenId);

      expect(metadata.length).to.equal(6);

      const balance = await erc721Instance.balanceOf(receiver.address);
      expect(balance).to.equal(1);
    });
  });
});
