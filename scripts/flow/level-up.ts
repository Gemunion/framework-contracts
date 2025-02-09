import { ethers } from "hardhat";
import { Result, toUtf8Bytes, zeroPadValue } from "ethers";

import { baseTokenURI, royalty } from "@ethberry/contracts-constants";
import { recursivelyDecodeResult } from "@framework/utils-eth";

async function main() {
  const [owner] = await ethers.getSigners();

  const nftFactory = await ethers.getContractFactory("ERC721Discrete");
  const nftInstance = await nftFactory.deploy("NFT", "EBT721", royalty, baseTokenURI);
  const nftAddress = await nftInstance.getAddress();
  console.info(`ERC721 deployed to ${nftAddress}`);

  const tx1 = await nftInstance.mintCommon(owner, 1);
  await tx1.wait();

  const eventFilter1 = nftInstance.filters.Transfer();
  const events1 = await nftInstance.queryFilter(eventFilter1);
  const result1 = recursivelyDecodeResult(events1[0].args as unknown as Result);
  console.info("Transfer", result1);

  const LEVEL = zeroPadValue(toUtf8Bytes("LEVEL"), 32);
  const tx2 = await nftInstance.upgrade(result1.tokenId, LEVEL);
  await tx2.wait();

  const eventFilter2 = nftInstance.filters.LevelUp();
  const events2 = await nftInstance.queryFilter(eventFilter2);
  const result2 = recursivelyDecodeResult(events2[0].args as unknown as Result);
  console.info("LevelUp", result2);

  return "OK";
}

main().then(console.info).catch(console.error);
