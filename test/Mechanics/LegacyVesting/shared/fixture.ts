import { ethers } from "hardhat";
import { ZeroAddress } from "ethers";
import { time } from "@openzeppelin/test-helpers";

import { amount } from "@ethberry/contracts-constants";

export async function deployVesting(name: string, cliffInMonth: number, monthlyRelease: number): Promise<any> {
  const [owner] = await ethers.getSigners();
  const current = await time.latest();
  const vestingFactory = await ethers.getContractFactory(name);
  const vestingInstance: any = await vestingFactory.deploy(
    owner.address,
    current.toNumber(),
    cliffInMonth,
    monthlyRelease,
  );

  await vestingInstance.topUp(
    [
      {
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount: amount * 100n,
      },
    ],
    { value: amount * 100n },
  );

  return vestingInstance;
}
