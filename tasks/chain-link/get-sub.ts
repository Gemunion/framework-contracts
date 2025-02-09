import { task } from "hardhat/config";
import { Result } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

task("sub-get", "Prints a VRF subscription data")
  .addParam("vrf", "The VRF coordinator contract's address")
  .addParam("sub", "The Subscription ID")
  .setAction(async (args, hre) => {
    const { vrf, sub } = args;

    const vrfInstance = await hre.ethers.getContractAt("VRFCoordinatorV2PlusMock", vrf);

    const data = await vrfInstance.getSubscription(sub);
    const result = recursivelyDecodeResult(data as unknown as Result);
    console.info("Subscription", result);
  });

// hardhat sub-get --vrf 0xa50a51c09a5c451C52BB714527E1974b686D8e77 --sub 26054867937820587328159301681415153712869728729402639383884357844206994385379 --network ethberry_besu

// https://docs.chain.link/vrf/v2/subscription/supported-networks
