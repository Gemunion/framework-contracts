import { ethers } from "hardhat";

import { baseTokenURI } from "@ethberry/contracts-constants";

async function main() {
  const dispenserFactory = await ethers.getContractFactory("ERC721Wrapper");
  const dispenserInstance = await dispenserFactory.deploy("EthBerry Wrapper", "ETW", 0, baseTokenURI);
  await dispenserInstance.waitForDeployment();
  console.info(`WRAPPER_ADDR=${await dispenserInstance.getAddress()}`);

  return "OK";
}

main().then(console.info).catch(console.error);
