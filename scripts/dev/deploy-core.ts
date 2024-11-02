import { ethers } from "hardhat";

import { MINTER_ROLE } from "@ethberry/contracts-constants";

import { deployDiamond } from "../../test/Exchange/shared";

async function main() {
  const contractManagerInstance = await deployDiamond(
    "DiamondCM",
    [
      "CollectionFactoryFacet",
      "ERC20FactoryFacet",
      "ERC721FactoryFacet",
      "ERC998FactoryFacet",
      "ERC1155FactoryFacet",
      "LotteryFactoryFacet",
      "LootBoxFactoryFacet",
      "MysteryBoxFactoryFacet",
      "PonziFactoryFacet",
      "RaffleFactoryFacet",
      "StakingFactoryFacet",
      "LegacyVestingFactoryFacet",
      "WaitListFactoryFacet",
      "PaymentSplitterFactoryFacet",
      "UseFactoryFacet",
      "AccessControlFacet",
      "PausableFacet",
      "DiamondLoupeFacet",
    ],
    "DiamondCMInit",
    {
      log: false,
      logSelectors: false,
    },
  );

  const contractManagerAddress = await contractManagerInstance.getAddress();
  console.info(`CONTRACT_MANAGER_ADDR=${contractManagerAddress}`);

  // DIAMOND EXCHANGE
  const exchangeInstance = await deployDiamond(
    "DiamondExchange",
    [
      "ExchangeGenesFacet",
      "ExchangeClaimFacet",
      "ExchangeCraftFacet",
      "ExchangeDismantleFacet",
      "ExchangeDiscreteFacet",
      "ExchangeLootBoxFacet",
      "ExchangeLotteryFacet",
      "ExchangeMergeFacet",
      "ExchangeMysteryBoxFacet",
      "ExchangePurchaseFacet",
      "ExchangeRandomFacet",
      "ExchangeRaffleFacet",
      "ExchangeRentableFacet",
      "PausableFacet",
      "AccessControlFacet",
      "WalletFacet",
      "DiamondLoupeFacet",
    ],
    "DiamondExchangeInit",
    {
      log: false,
      logSelectors: false,
    },
  );

  const exchangeAddress = await exchangeInstance.getAddress();
  console.info(`EXCHANGE_ADDR=${exchangeAddress}`);

  const useFactoryInstance = await ethers.getContractAt("UseFactoryFacet", contractManagerAddress);
  const tx = await useFactoryInstance.addFactory(exchangeAddress, MINTER_ROLE);
  await tx.wait();

  return "OK";
}

main().then(console.info).catch(console.error);
