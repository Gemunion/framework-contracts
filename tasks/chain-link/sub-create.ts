import { task } from "hardhat/config";
import { Result } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

task("sub-create", "Add VRF subscription")
  .addParam("vrf", "The VRF coordinator contract's address")
  .setAction(async (args, hre) => {
    const { vrf } = args;

    const blockNumber = await hre.ethers.provider.getBlockNumber();

    const vrfInstance = await hre.ethers.getContractAt("VRFCoordinatorV2PlusMock", vrf);

    const tx = await vrfInstance.createSubscription();
    await tx.wait();

    const eventFilter = vrfInstance.filters.SubscriptionCreated();
    const events = await vrfInstance.queryFilter(eventFilter, blockNumber);
    const result = recursivelyDecodeResult(events[0].args as unknown as Result);
    console.info("SubscriptionCreated", result);
  });

// hardhat sub-create --vrf 0xa50a51c09a5c451C52BB714527E1974b686D8e77 --network ethberry_besu

// https://docs.chain.link/vrf/v2/subscription/supported-networks
