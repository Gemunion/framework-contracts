import { ethers } from "hardhat";
import { Result, toBeHex, WeiPerEther, zeroPadValue, ZeroAddress } from "ethers";

import { baseTokenURI, royalty } from "@ethberry/contracts-constants";
import { recursivelyDecodeResult } from "@framework/utils-eth";
import { MINTER_ROLE } from "@ethberry/contracts-constants";

import { getContractName, chainIdToSuffix } from "../../test/utils";
import { LinkTokenAddress, VrfCoordinatorV2PlusAddress } from "../utils/address";

async function main() {
  const [owner] = await ethers.getSigners();
  const { name, chainId } = await ethers.provider.getNetwork();

  // Deploy LINK token
  const linkFactory = await ethers.getContractFactory("LinkToken");
  const linkInstance = await linkFactory.deploy();
  await linkInstance.waitForDeployment();

  // validate deployment
  const linkAddress = await linkInstance.getAddress();
  console.info(`LINK_ADDR=${linkAddress}`);
  if (
    linkAddress.toLowerCase() !==
    (LinkTokenAddress[chainIdToSuffix(chainId) as keyof typeof LinkTokenAddress] as string)
  ) {
    console.info("LINK_ADDR address mismatch, clean BESU, then try again");
  }

  // Deploy VRF Coordinator
  const vrfFactory = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
  const vrfInstance = await vrfFactory.deploy(linkAddress);
  await vrfInstance.waitForDeployment();

  // validate deployment
  const vrfAddress = await vrfInstance.getAddress();
  console.info(`VRF_ADDR=${vrfAddress}`);
  if (
    vrfAddress.toLowerCase() !==
    (VrfCoordinatorV2PlusAddress[chainIdToSuffix(chainId) as keyof typeof VrfCoordinatorV2PlusAddress] as string)
  ) {
    console.info("VRF_ADDR address mismatch, clean BESU, then try again");
  }

  // set LINK and NATIVE address
  const tx1 = await vrfInstance.setLINKAndLINKNativeFeed(linkInstance, linkInstance);
  await tx1.wait();

  // set dummy config
  const tx2 = await vrfInstance.setConfig(
    3, // minimumRequestConfirmations
    1000000, // maxGasLimit
    1, // stalenessSeconds
    1, // gasAfterPaymentCalculation
    1, // fallbackWeiPerUnitLink
    1, // fulfillmentFlatFeeNativePPM
    1, // fulfillmentFlatFeeLinkDiscountPPM
    1, // nativePremiumPercentage
    1, // linkPremiumPercentage
  );
  await tx2.wait();

  // create subscription
  const tx3 = await vrfInstance.createSubscription();
  await tx3.wait();

  const eventFilter1 = vrfInstance.filters.SubscriptionCreated();
  const events1 = await vrfInstance.queryFilter(eventFilter1);
  const result1 = recursivelyDecodeResult(events1[0].args as unknown as Result);
  const { subId } = result1;
  console.info("SubscriptionCreated", result1);

  // fund subscription
  const tx4 = await linkInstance.transferAndCall(vrfAddress, 1000n * WeiPerEther, zeroPadValue(toBeHex(subId), 32));
  await tx4.wait();

  const eventFilter2 = vrfInstance.filters.SubscriptionFunded();
  const events2 = await vrfInstance.queryFilter(eventFilter2);
  const result2 = recursivelyDecodeResult(events2[0].args as unknown as Result);
  console.info("SubscriptionFunded", result2);

  const contractName = getContractName("ERC721Random", name) as "ERC721RandomEthberry";
  const nftFactory = await ethers.getContractFactory(contractName);
  const nftInstance = await nftFactory.deploy("NFT", "EBT721", royalty, baseTokenURI);
  const nftAddress = await nftInstance.getAddress();
  console.info(`ERC721 deployed to ${nftAddress}`);

  const tx5 = await vrfInstance.addConsumer(subId, nftAddress);
  await tx5.wait();

  const eventFilter3 = vrfInstance.filters.SubscriptionConsumerAdded();
  const events3 = await vrfInstance.queryFilter(eventFilter3);
  const result3 = recursivelyDecodeResult(events3[0].args as unknown as Result);
  console.info("SubscriptionConsumerAdded", result3);

  const tx6 = await nftInstance.setSubscriptionId(subId);
  await tx6.wait();

  const eventFilter4 = nftInstance.filters.VrfSubscriptionSet();
  const events4 = await nftInstance.queryFilter(eventFilter4);
  const result4 = recursivelyDecodeResult(events4[0].args as unknown as Result);
  console.info("VrfSubscriptionSet", result4);

  const mysteryFactory = await ethers.getContractFactory("ERC721MysteryBoxSimple");
  const mysteryInstance = await mysteryFactory.deploy("NFT", "EBT721", royalty, baseTokenURI);
  const mysteryAddress = await mysteryInstance.getAddress();
  console.info(`MYSTERY deployed to ${mysteryAddress}`);

  const tx7 = await mysteryInstance.mintBox(owner, 1, [
    {
      tokenType: 2,
      token: nftAddress,
      tokenId: 1,
      amount: 1,
    },
  ]);
  await tx7.wait();

  const eventFilter5 = mysteryInstance.filters.Transfer();
  const events5 = await mysteryInstance.queryFilter(eventFilter5);
  const result5 = recursivelyDecodeResult(events5[0].args as unknown as Result);
  console.info("Transfer", result5);

  const tx8 = await nftInstance.grantRole(MINTER_ROLE, mysteryAddress);
  await tx8.wait();

  const tx9 = await mysteryInstance.unpack(result5.tokenId);
  await tx9.wait();

  const eventFilter6 = vrfInstance.filters.RandomWordsRequested();
  const events6 = await vrfInstance.queryFilter(eventFilter6);
  const result6 = recursivelyDecodeResult(events6[0].args as unknown as Result);
  console.info("RandomWordsRequested", result6);

  const blockNum = await ethers.provider.getBlockNumber();
  const tx10 = await vrfInstance.fulfillRandomWords(
    // Proof
    {
      pk: [0, 0],
      gamma: [0, 0],
      c: 0,
      s: 0,
      seed: 32n, // random number
      uWitness: ZeroAddress,
      cGammaWitness: [0, 0],
      sHashWitness: [0, 0],
      zInv: result6.requestId, // requestId
    },
    // RequestCommitmentV2Plus
    {
      blockNum,
      subId,
      callbackGasLimit: result6.callbackGasLimit,
      numWords: result6.numWords,
      sender: result6.sender,
      extraArgs: result6.extraArgs,
    },
    // onlyPremium
    false,
    { gasLimit: 800000 },
  );
  await tx10.wait();

  const eventFilter7 = nftInstance.filters.Transfer();
  const events7 = await nftInstance.queryFilter(eventFilter7, blockNum);
  const result7 = recursivelyDecodeResult(events7[0].args as unknown as Result);
  console.info("Transfer", result7);

  return "OK";
}

main().then(console.info).catch(console.error);
