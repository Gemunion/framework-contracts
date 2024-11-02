import { expect } from "chai";
import { ethers, web3 } from "hardhat";
import { time } from "@openzeppelin/test-helpers";

import { deployERC20Mock } from "@ethberry/contracts-mocks";

import { deployVesting } from "./fixture";

const span = 2592000; // one month in seconds
export const amount = 10000000;

export async function calc(name: string, months: number, percent: number) {
  const [owner] = await ethers.getSigners();
  const vestingInstance = await deployVesting(name, months, percent);
  const erc20Instance = await deployERC20Mock();
  await erc20Instance.mint(vestingInstance, amount);

  const monthlyRelease = (amount * percent) / 10000;
  const cliff = new Array(months).fill(0);
  const whole = ~~(amount / monthlyRelease);
  const rest = amount % monthlyRelease;
  const body = new Array(whole).fill(monthlyRelease);
  const expectedAmounts = [0, ...cliff, ...body, rest, 0];

  for (const expectedAmount of expectedAmounts) {
    const releasable = await vestingInstance["releasable(address)"](erc20Instance);
    expect(releasable).to.be.equal(expectedAmount);

    const tx = await vestingInstance["release(address)"](erc20Instance);
    await expect(tx).changeTokenBalances(erc20Instance, [vestingInstance, owner.address], [-releasable, releasable]);

    const current = await time.latest();
    await time.increaseTo(current.add(web3.utils.toBN(span)));
  }
}
