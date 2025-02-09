import { task } from "hardhat/config";
import { Result, WeiPerEther, zeroPadValue, toBeHex } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

task("sub-fund", "Add VRF subscription")
  .addParam("vrf", "The VRF coordinator contract's address")
  .addParam("token", "The LINK contract's address")
  .addParam("sub", "Subscription id, bigint")
  .setAction(async (args, hre) => {
    const { vrf, token, sub } = args;

    const blockNumber = await hre.ethers.provider.getBlockNumber();

    const vrfInstance = await hre.ethers.getContractAt("VRFCoordinatorV2PlusMock", vrf);

    const linkInstance = await hre.ethers.getContractAt("LinkToken", token);

    // fund subscription
    const tx = await linkInstance.transferAndCall(vrf, 1000n * WeiPerEther, zeroPadValue(toBeHex(sub), 32));
    await tx.wait();

    const eventFilter = vrfInstance.filters.SubscriptionFunded();
    const events = await vrfInstance.queryFilter(eventFilter, blockNumber);
    const result = recursivelyDecodeResult(events[0].args as unknown as Result);
    console.info("SubscriptionFunded", result);
  });

// hardhat sub-fund --vrf 0xa50a51c09a5c451C52BB714527E1974b686D8e77 --token 0x42699A7612A82f1d9C36148af9C77354759b210b --sub 86286475704445472511836148046058538780431588607371260219161208015379474780122 --network ethberry_besu

// https://docs.chain.link/vrf/v2/subscription/supported-networks
