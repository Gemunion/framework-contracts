import { ethers } from "hardhat";

// import { blockAwait } from "@framework/utils-eth";
import { baseTokenURI } from "@ethberry/contracts-constants";

async function main() {
  const rlNum = 100; // royaltyNumerator
  const [_owner] = await ethers.getSigners();

  // ERC721 contract - discrete
  const itemDiscreteFactory = await ethers.getContractFactory("ERC721Discrete");
  const itemDiscreteInstance = await itemDiscreteFactory.deploy("ITEMG", "ITEMG", rlNum, baseTokenURI);
  console.info(`ERC721_U_ADDR=${(await itemDiscreteInstance.getAddress()).toLowerCase()}`);

  // ERC721 contract - random
  const itemRandomFactory = await ethers.getContractFactory("ERC721Random");
  const itemRandomInstance = await itemRandomFactory.deploy("ITEMR", "ITEMR", rlNum, baseTokenURI);
  console.info(`ERC721_R_ADDR=${(await itemRandomInstance.getAddress()).toLowerCase()}`);

  // ERC721 contract - traits
  const itemGenesFactory = await ethers.getContractFactory("ERC721Genes");
  const itemGenesInstance = await itemGenesFactory.deploy("ITEMG", "ITEMG", rlNum, baseTokenURI);
  console.info(`ERC721_G_ADDR=${(await itemGenesInstance.getAddress()).toLowerCase()}`);

  // Setup Contracts
  // await blockAwait(ethers.provider);

  // ERC721 getRecordField Template
  const templateKey = await itemDiscreteInstance.TEMPLATE_ID();
  // 0xe2db241bb2fe321e8c078a17b0902f9429cee78d5f3486725d73d0356e97c842
  console.info("templateKey", templateKey);

  // ERC721 getRecordField Template
  const gradeKey = await itemDiscreteInstance.LEVEL();
  // 0x76e34cd5c7c46b6bfe6b1da94d54447ea83a4af449bc62a0ef3ecae24c08031a
  console.info("levelKey", gradeKey);

  // ERC721 getRecordField Rarity
  const rarityKey = await itemRandomInstance.RARITY();
  // 0xda9488a573bb2899ea5782d71e9ebaeb1d8291bf3812a066ec86608a697c51fc
  console.info("rarityKey", rarityKey);

  // ERC721 getRecordField Genes
  const traitsKey = await itemGenesInstance.TRAITS();
  // 0x8e3ddc4aa9e11e826949389b9fc38032713cef66f38657aa6e1599905d26e564
  console.info("traitsKey", traitsKey);
}

main().catch(error => {
  console.error(error);
});
