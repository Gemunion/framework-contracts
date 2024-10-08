import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import fs from "fs";
import { blockAwait, blockAwaitMs, camelToSnakeCase } from "@gemunion/contracts-helpers";
import { METADATA_ROLE, MINTER_ROLE } from "@gemunion/contracts-constants";
import { deployDiamond } from "../test/Exchange/shared";
// import { deployDiamond_BSC } from "../test/Exchange/shared/fixture_bsc";

const delay = 2; // block delay
const delayMs = 1100; // block delay ms

// COST TEST-NET
// 0.953918023227665418 BNB
// 0.734582158227665418 BNB

// COST MAINNET
// BNB 0.87705253
// $272
// BNB 0.87705253 ~ $275

interface IObj {
  address?: string;
  hash?: string;
}

const debug = async (obj: IObj | Record<string, Contract>, name?: string) => {
  if (obj && obj.hash) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    console.info(`${name} tx: ${obj.hash}`);
    await blockAwaitMs(delayMs);
  } else {
    console.info(`${Object.keys(obj).pop()} deployed`);
    const tx = Object.values(obj).pop();
    const contract = tx;
    await blockAwait(delay, delayMs);
    const address = await contract.getAddress();
    fs.appendFileSync(
      `${process.cwd()}/log.txt`,
      // `${camelToSnakeCase(Object.keys(obj).pop() || "none").toUpperCase()}_ADDR=${contract && contract.address ? contract.address.toLowerCase : "--"}\n`,
      `${camelToSnakeCase(Object.keys(obj).pop() || "none").toUpperCase()}_ADDR=${address.toLowerCase() || "--"}\n`,
    );
  }
};

const contracts: Record<string, any> = {};
const currentBlock: { number: number } = { number: 1 };
const linkAddr =
  network.name === "besu"
    ? "0x42699a7612a82f1d9c36148af9c77354759b210b"
    : network.name === "gemunion" || network.name === "gemunionprod"
      ? "0x1fa66727cdd4e3e4a6debe4adf84985873f6cd8a" // vrf besu gemunion
      : "0xb9a219631aed55ebc3d998f17c3840b7ec39c0cc"; // binance test

const vrfAddr =
  network.name === "besu"
    ? "0xa50a51c09a5c451c52bb714527e1974b686d8e77" // vrf besu localhost
    : network.name === "gemunion" || network.name === "gemunionprod"
      ? "0x86c86939c631d53c6d812625bd6ccd5bf5beb774" // vrf besu gemunion
      : "0x4d2d24899c0b115a1fce8637fca610fe02f1909e"; // binance test

async function main() {
  const block = await ethers.provider.getBlock("latest");
  currentBlock.number = block!.number;
  fs.appendFileSync(
    `${process.cwd()}/log.txt`,
    // `${camelToSnakeCase(Object.keys(obj).pop() || "none").toUpperCase()}_ADDR=${contract && contract.address ? contract.address.toLowerCase : "--"}\n`,
    `STARTING_BLOCK=${currentBlock.number}\n`,
  );

  // LINK & VRF - HAVE TO PASS VRF AND LINK ADDRESSES TO CHAINLINK-BESU CONCTRACT
  // DIAMOND CM
  const cmInstance = await deployDiamond(
    "DiamondCM",
    [
      "ERC721FactoryFacet",
      "CollectionFactoryFacet",
      "ERC20FactoryFacet",
      "ERC998FactoryFacet",
      "ERC1155FactoryFacet",
      "LotteryFactoryFacet",
      "LootBoxFactoryFacet",
      "MysteryBoxFactoryFacet",
      "PonziFactoryFacet",
      "RaffleFactoryFacet",
      "StakingFactoryFacet",
      "VestingFactoryFacet",
      "WaitListFactoryFacet",
      "PaymentSplitterFactoryFacet",
      "UseFactoryFacet",
      "AccessControlFacet",
      "PausableFacet",
      "DiamondLoupeFacet",
    ],
    "DiamondCMInit",
    {
      log: true,
      logSelectors: false,
    },
  );
  contracts.contractManager = cmInstance;
  await debug(contracts);

  // const factoryInstance = await ethers.getContractAt("UseFactoryFacet", await contracts.contractManager.getAddress());
  const factoryInstance = await ethers.getContractAt("UseFactoryFacet", "0x7130f69618f590ad3e9655924bd5435136ce6d2f");

  // console.info("contracts.contractManager.address", contracts.contractManager.address);

  // DIAMOND EXCHANGE
  const exchangeInstance = await deployDiamond(
    "DiamondExchange",
    [
      "ExchangeBreedFacet",
      "ExchangeClaimFacet",
      "ExchangeCraftFacet",
      "ExchangeDismantleFacet",
      "ExchangeGradeFacet",
      "ExchangeLootBoxFacet",
      "ExchangeLotteryFacet",
      "ExchangeMergeFacet",
      // "ExchangeMockFacet",
      "ExchangeMysteryBoxFacet",
      "ExchangePurchaseFacet",
      "ExchangeRaffleFacet",
      "ExchangeRentableFacet",
      "PausableFacet",
      "AccessControlFacet",
      "DiamondLoupeFacet",
    ],
    "DiamondExchangeInit",
    {
      log: true,
      logSelectors: false,
    },
  );
  contracts.exchange = exchangeInstance;
  await debug(contracts);

  await debug(
    await factoryInstance.addFactory(await exchangeInstance.getAddress(), MINTER_ROLE),
    "contractManager.addFactory",
  );

  await debug(
    await factoryInstance.addFactory(await exchangeInstance.getAddress(), METADATA_ROLE),
    "contractManager.addFactory",
  );

  // // DEPLOY DISPENSER
  // const dispenserFactory = await ethers.getContractFactory("Dispenser");
  // contracts.dispenser = await dispenserFactory.deploy();
  // await debug(contracts);
}

main()
  .then(async () => {
    console.info(`STARTING_BLOCK=${currentBlock.number}`);
    for (const [key, value] of Object.entries(contracts)) {
      console.info(`${camelToSnakeCase(key).toUpperCase()}_ADDR=${(await value.getAddress()).toLowerCase()}`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
