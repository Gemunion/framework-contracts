import { task } from "hardhat/config";
import { Result } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

task("get-rule", "Prints a Staking rule")
  .addParam("staking", "The Staking address")
  .addParam("rule", "The Staking rule ID")
  .setAction(async (args, hre) => {
    const { staking, rule } = args;

    const stakingContract = await hre.ethers.getContractAt("Staking", staking);

    const data = await stakingContract.getRule(rule);
    console.info("Staking rule:", recursivelyDecodeResult(data as unknown as Result));
  });

// hardhat get-rule --network besu --staking 0x5798cf2507399e4b45fb9d2fbb255299e0070294 --rule 4
