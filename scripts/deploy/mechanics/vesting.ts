import { ethers } from "hardhat";

import { blockAwait } from "@ethberry/contracts-helpers";
import { wallet } from "@ethberry/constants";

export async function deployVesting(contracts: Record<string, any>) {
  const timestamp = Math.ceil(Date.now() / 1000);
  await blockAwait();
  const linearVestingFactory = await ethers.getContractFactory("LegacyVesting");
  contracts.vesting = await linearVestingFactory.deploy(wallet, timestamp, 12, 417);
  await blockAwait();
}
