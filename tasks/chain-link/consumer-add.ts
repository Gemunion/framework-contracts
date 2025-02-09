import { task } from "hardhat/config";
import { Result } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

task("consumer-add", "Add vRF subscription")
  .addParam("vrf", "The VRF coordinator contract's address")
  .addParam("consumer", "The Consumer contract's address")
  .addParam("sub", "Subscription id, bigint")
  .setAction(async (args, hre) => {
    const { vrf, consumer, sub } = args;

    const blockNumber = await hre.ethers.provider.getBlockNumber();

    const vrfInstance = await hre.ethers.getContractAt("VRFCoordinatorV2PlusMock", vrf);

    const tx = await vrfInstance.addConsumer(sub, consumer);
    await tx.wait();

    const eventFilter = vrfInstance.filters.SubscriptionConsumerAdded();
    const events = await vrfInstance.queryFilter(eventFilter, blockNumber);
    const result = recursivelyDecodeResult(events[0].args as unknown as Result);
    console.info("SubscriptionConsumerAdded", result);
  });

// hardhat consumer-add --vrf 0xa50a51c09a5c451C52BB714527E1974b686D8e77 --consumer 0x3d6bd361d501643fe2998e2cc92c8707b018aa56 --sub 97307802646217566339837191377470248960016610442480987956747409367736883433488 --network ethberry_besu

// https://docs.chain.link/vrf/v2/subscription/supported-networks
