import { ethers, network } from "hardhat";
import { Result, toBeHex, WeiPerEther, zeroPadValue } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

// ChainLink V2Plus
async function main() {
  // dev env only!
  if (!network.name.startsWith("hardhat") && !network.name.startsWith("ethberry")) {
    return;
  }

  // Deploy LINK token
  const linkFactory = await ethers.getContractFactory("LinkToken");
  const linkInstance = await linkFactory.deploy();
  await linkInstance.waitForDeployment();

  // validate deployment
  const linkAddress = await linkInstance.getAddress();
  console.info(`LINK_ADDR=${linkAddress}`);
  if (linkAddress.toLowerCase() !== "0x42699a7612a82f1d9c36148af9c77354759b210b") {
    console.info("LINK_ADDR address mismatch, clean BESU, then try again");
  }

  // Deploy VRF Coordinator
  const vrfFactory = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
  const vrfInstance = await vrfFactory.deploy(linkAddress);
  await vrfInstance.waitForDeployment();

  // validate deployment
  const vrfAddress = await vrfInstance.getAddress();
  console.info(`VRF_ADDR=${vrfAddress}`);
  if (vrfAddress.toLowerCase() !== "0xa50a51c09a5c451c52bb714527e1974b686d8e77") {
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

  const eventFilter = vrfInstance.filters.SubscriptionCreated();
  const events = await vrfInstance.queryFilter(eventFilter);
  const { subId } = recursivelyDecodeResult(events[0].args as unknown as Result);
  console.info("SubscriptionCreated", subId);

  // fund subscription
  const tx4 = await linkInstance.transferAndCall(vrfAddress, 1000n * WeiPerEther, zeroPadValue(toBeHex(subId), 32));
  await tx4.wait();

  const eventFilter1 = vrfInstance.filters.SubscriptionFunded();
  const events1 = await vrfInstance.queryFilter(eventFilter1);
  const { newBalance } = recursivelyDecodeResult(events1[0].args as unknown as Result);
  console.info("SubscriptionFunded", newBalance);

  return "OK";
}

main().then(console.info).catch(console.error);
