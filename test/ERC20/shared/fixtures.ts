import { ethers } from "hardhat";

import { amount, tokenName, tokenSymbol } from "@ethberry/contracts-constants";

export async function deployERC20(name = "ERC20Mock", options: any = {}): Promise<any> {
  const factory = await ethers.getContractFactory(name);
  const args = Object.assign({ tokenName, tokenSymbol }, options);
  return factory.deploy(...Object.values(args));
}

export async function deployERC1363(name = "ERC20Simple", options: any = {}): Promise<any> {
  const factory = await ethers.getContractFactory(name);
  const args = Object.assign({ tokenName, tokenSymbol, amount }, options);
  return factory.deploy(...Object.values(args));
}

export async function deployUsdt(name = "TetherToken", options: any = {}): Promise<any> {
  const factory = await ethers.getContractFactory(name);
  const args = Object.assign({ amount: amount * 1000000n, tokenName, tokenSymbol, decimals: 6 }, options);
  return factory.deploy(...Object.values(args));
}

export async function deployBusd(name = "BEP20Token"): Promise<any> {
  const factory = await ethers.getContractFactory(name);
  return factory.deploy();
}

export async function deployWeth(name = "WETH9"): Promise<any> {
  const [owner] = await ethers.getSigners();
  const factory = await ethers.getContractFactory(name);
  const wethInstance = await factory.deploy();
  const address = await wethInstance.getAddress();
  await owner.sendTransaction({
    to: address,
    value: amount,
  });
  return wethInstance;
}