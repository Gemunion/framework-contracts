import { ethers, network } from "hardhat";
import { formatEther, Result, WeiPerEther, ZeroAddress } from "ethers";
import fs from "fs";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

import { blockAwait } from "@ethberry/contracts-helpers";
import { camelToSnakeCase } from "@ethberry/utils";
import { METADATA_ROLE, MINTER_ROLE, nonce, royalty, wallet, wallets } from "@ethberry/contracts-constants";
import { recursivelyDecodeResult } from "@framework/utils-eth";

import { getContractName } from "../test/utils";
import { expiresAt, externalId } from "../test/constants";
import { deployDiamond } from "../test/Exchange/shared";
import { debug, grantRoles } from "./utils/deploy-utils";
import { getBaseTokenURI } from "../test/shared/uri";
import { TypedContractEvent, TypedEventLog } from "../typechain-types/common";

// DELAY CONFIG
const delay = 1; // block delay
const delayMs = 900; // block delay ms (low for localhost, high for binance etc.)

// VRF CONFIG
const vrfSubId =
  network.name === "gemunion_besu"
    ? 90511971795741479935923326278479026746054804275284472604758078181846377682962n
    : 107047671614105181605855861266364170459723373514078878123604030694679782559997n;

// COLLECTION size
const batchSize = 3; // Generative collection size

const amount = WeiPerEther * 1000000000000n; // ?
const timestamp = Math.ceil(Date.now() / 1000);
const currentBlock: { number: number } = { number: 1 };
const contracts: Record<string, any> = {};

async function main() {
  const [owner, receiver, stranger] = await ethers.getSigners();
  const { chainId } = network.config;

  const balance0 = await ethers.provider.getBalance(owner.address);
  const block = await ethers.provider.getBlock("latest");
  currentBlock.number = block!.number;
  fs.appendFileSync(
    `${process.cwd()}/log.txt`,
    // `${camelToSnakeCase(Object.keys(obj).pop() || "none").toUpperCase()}_ADDR=${contract && contract.address ? contract.address.toLowerCase : "--"}\n`,
    `STARTING_BLOCK=${currentBlock.number}\n`,
  );

  // LINK & VRF
  // const decimals = BigNumber.from(10).pow(18);
  // const linkAmountInWei = BigNumber.from("1000").mul(decimals);
  // const linkFactory = await ethers.getContractFactory("LinkToken");
  // // // const linkInstance = linkFactory.attach("0x18C8044BEaf97a626E2130Fe324245b96F81A31F");
  // const linkInstance = await linkFactory.deploy("LINK", "LINK");
  // contracts.link = linkInstance;
  // await debug(contracts);
  // console.info(`LINK_ADDR=${contracts.link.address}`);
  // const vrfFactory = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
  // contracts.vrf = await vrfFactory.deploy(contracts.link.address);
  // await debug(contracts);
  // console.info(`VRF_ADDR=${contracts.vrf.address}`);
  // await debug(await linkInstance.mint(owner.address, linkAmountInWei.mul(100)), "LinkInstance.mint");
  // console.info("afterDebug");

  // HAVE TO PASS VRF AND LINK ADDRESSES TO CHAINLINK-BESU CONCTRACT
  const vrfAddr =
    network.name === "gemunion_besu"
      ? "0xa50a51c09a5c451c52bb714527e1974b686d8e77" // vrf besu localhost
      : network.name === "gemunion"
        ? "0x86c86939c631d53c6d812625bd6ccd5bf5beb774" // vrf besu gemunion
        : "0xa50a51c09a5c451c52bb714527e1974b686d8e77";
  const vrfInstance = await ethers.getContractAt("VRFCoordinatorV2PlusMock", vrfAddr);

  // DIAMOND CM
  const cmInstance = await deployDiamond(
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
      log: false,
      logSelectors: false,
    },
  );
  contracts.contractManager = cmInstance;
  await debug(contracts);

  const factoryInstance = await ethers.getContractAt("UseFactoryFacet", await contracts.contractManager.getAddress());

  // console.info("contracts.contractManager.address", contracts.contractManager.address);

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
      "ExchangeMockFacet",
      "ExchangeMysteryBoxFacet",
      "ExchangePurchaseFacet",
      // "ExchangePurchaseVestingFacet",
      "ExchangeRaffleFacet",
      "ExchangeRentableFacet",
      "PausableFacet",
      "AccessControlFacet",
      "DiamondLoupeFacet",
    ],
    "DiamondExchangeInit",
    {
      log: false,
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

  const erc20SimpleFactory = await ethers.getContractFactory("ERC20Simple");
  const erc20SimpleInstance = await erc20SimpleFactory.deploy("Space Credits", "GEM20", amount);
  // const erc20SimpleInstance = erc20SimpleFactory.attach("0x7b3f38cd327c375d7baae448c1380397d304fcec");
  contracts.erc20Simple = erc20SimpleInstance;
  await debug(contracts);

  await debug(await erc20SimpleInstance.mint(owner.address, amount), "erc20SimpleInstance.mint");

  await debug(
    await erc20SimpleInstance.approve(contracts.exchange.getAddress(), amount),
    "erc20SimpleInstance.approve",
  );

  const erc20InactiveFactory = await ethers.getContractFactory("ERC20Simple");
  contracts.erc20Inactive = await erc20InactiveFactory.deploy("ERC20 INACTIVE", "OFF20", amount);
  await debug(contracts);

  const erc20NewFactory = await ethers.getContractFactory("ERC20Simple");
  contracts.erc20New = await erc20NewFactory.deploy("ERC20 NEW", "NEW20", amount);
  await debug(contracts);

  const erc20BlacklistFactory = await ethers.getContractFactory("ERC20Blacklist");
  const erc20BlacklistInstance = await erc20BlacklistFactory.deploy("ERC20 BLACKLIST", "BL20", amount);
  contracts.erc20Blacklist = erc20BlacklistInstance;
  await debug(contracts);

  await debug(await erc20BlacklistInstance.blacklist(wallets[1]), "erc20BlacklistInstance.blacklist");
  await debug(await erc20BlacklistInstance.blacklist(wallets[2]), "erc20BlacklistInstance.blacklist");

  const erc20WhitelistFactory = await ethers.getContractFactory("ERC20Whitelist");
  const erc20WhitelistInstance = await erc20WhitelistFactory.deploy("ERC20 WHITELIST", "WL20", amount);
  contracts.erc20Whitelist = erc20WhitelistInstance;
  await debug(contracts);

  await debug(await erc20WhitelistInstance.whitelist(wallets[1]), "erc20WhitelistInstance.whitelist");
  await debug(await erc20WhitelistInstance.whitelist(wallets[2]), "erc20WhitelistInstance.whitelist");

  const erc721SimpleFactory = await ethers.getContractFactory("ERC721Simple");
  contracts.erc721Simple = await erc721SimpleFactory.deploy("GEMSTONES", "GEM721", royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const erc721InactiveFactory = await ethers.getContractFactory("ERC721Simple");
  contracts.erc721Inactive = await erc721InactiveFactory.deploy(
    "ERC721 INACTIVE",
    "OFF721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const erc721NewFactory = await ethers.getContractFactory("ERC721Simple");
  contracts.erc721New = await erc721NewFactory.deploy("ERC721 NEW", "NEW721", royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const erc721BlacklistFactory = await ethers.getContractFactory("ERC721Blacklist");
  contracts.erc721Blacklist = await erc721BlacklistFactory.deploy(
    "ERC721 BLACKLIST",
    "BL721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const ERC721DiscreteFactory = await ethers.getContractFactory("ERC721Discrete");
  contracts.erc721Discrete = await ERC721DiscreteFactory.deploy(
    "ERC721 ARMOUR",
    "LVL721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  // const randomContractName =
  //   network.name === "gemunion_besu"
  //     ? "ERC721RandomBesuV2"
  //     : network.name === "gemunion"
  //     ? "ERC721RandomGemunionV2"
  //     : "ERC721Random";
  const randomContractName = getContractName("ERC721DiscreteRandom", network.name);

  const erc721RandomFactory = await ethers.getContractFactory(randomContractName);
  contracts.erc721Random = await erc721RandomFactory.deploy(
    "ERC721 WEAPON",
    "RNG721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  await debug(await contracts.erc721Random.setSubscriptionId(vrfSubId), "randomInstance.setSubscription");
  await debug(
    await vrfInstance.addConsumer(vrfSubId, await contracts.erc721Random.getAddress()),
    "vrfInstance.addConsumer",
  );
  await blockAwait(delay, delayMs);
  const eventFilter = vrfInstance.filters.SubscriptionConsumerAdded();
  const events: Array<TypedEventLog<TypedContractEvent<any>>> = await vrfInstance.queryFilter(
    eventFilter,
    currentBlock.number,
  );
  const { subId, consumer } = recursivelyDecodeResult(events[0].args as unknown as Result);
  console.info("SubscriptionConsumerAdded", subId, consumer);

  const erc721SoulboundFactory = await ethers.getContractFactory("ERC721Soulbound");
  contracts.erc721Soulbound = await erc721SoulboundFactory.deploy(
    "ERC721 MEDAL",
    "SB721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const genesContractName = getContractName("ERC721Genes", network.name);
  const erc721GenesFactory = await ethers.getContractFactory(genesContractName);
  contracts.erc721Genes = await erc721GenesFactory.deploy("ERC721 DNA", "DNA721", royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  await debug(await contracts.erc721Genes.setSubscriptionId(vrfSubId), "randomInstance.setSubscription");
  await debug(
    await vrfInstance.addConsumer(vrfSubId, await contracts.erc721Genes.getAddress()),
    "vrfInstance.addConsumer",
  );

  const erc721RentableFactory = await ethers.getContractFactory("ERC721Rentable");
  contracts.erc721Rentable = await erc721RentableFactory.deploy(
    "T-SHIRT (rentable)",
    "TS721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  // ERC998

  const erc998SimpleFactory = await ethers.getContractFactory("ERC998Simple");
  contracts.erc998Simple = await erc998SimpleFactory.deploy(
    "ERC998 SIMPLE",
    "GEM998",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const erc998InactiveFactory = await ethers.getContractFactory("ERC998Simple");
  contracts.erc998Inactive = await erc998InactiveFactory.deploy(
    "ERC998 INACTIVE",
    "OFF998",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const erc998NewFactory = await ethers.getContractFactory("ERC998Simple");
  contracts.erc998New = await erc998NewFactory.deploy("ERC998 NEW", "NEW998", royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const erc998BlacklistFactory = await ethers.getContractFactory("ERC998Blacklist");
  contracts.erc998Blacklist = await erc998BlacklistFactory.deploy(
    "ERC998 BLACKLIST",
    "BL998",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const ERC998DiscreteFactory = await ethers.getContractFactory("ERC998Discrete");
  contracts.erc998Discrete = await ERC998DiscreteFactory.deploy(
    "ERC998 LVL",
    "LVL998",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const randomContract998Name = getContractName("ERC998Random", network.name);

  const erc998RandomFactory = await ethers.getContractFactory(randomContract998Name);
  const erc998RandomInstance: any = await erc998RandomFactory.deploy(
    "ERC998 HERO",
    "RNG998",
    royalty,
    getBaseTokenURI(chainId),
  );
  contracts.erc998Random = erc998RandomInstance;
  await debug(contracts);

  await debug(await contracts.erc998Random.setSubscriptionId(vrfSubId), "randomInstance.setSubscription");
  await debug(
    await vrfInstance.addConsumer(vrfSubId, await contracts.erc998Random.getAddress()),
    "vrfInstance.addConsumer",
  );

  await debug(
    await erc998RandomInstance.whiteListChild(await contracts.erc721Random.getAddress(), 5),
    "erc998RandomInstance.whiteListChild",
  );

  const genes998ContractName = getContractName("ERC998Genes", network.name);
  const erc998GenesFactory = await ethers.getContractFactory(genes998ContractName);
  contracts.erc998Genes = await erc998GenesFactory.deploy("AXIE (traits)", "DNA998", royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  await debug(await contracts.erc998Genes.setSubscriptionId(vrfSubId), "randomInstance.setSubscription");
  await debug(
    await vrfInstance.addConsumer(vrfSubId, await contracts.erc998Genes.getAddress()),
    "vrfInstance.addConsumer",
  );

  const erc998RentableFactory = await ethers.getContractFactory("ERC998Rentable");
  contracts.erc998Rentable = await erc998RentableFactory.deploy(
    "C-SHIRT (rentable)",
    "REN998",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  // TODO contracts are too big
  const erc998Owner20Factory = await ethers.getContractFactory("ERC998ERC20Simple");
  contracts.erc998OwnerErc20 = await erc998Owner20Factory.deploy(
    "OWNER ERC20",
    "OWN20",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const erc998Owner1155Factory = await ethers.getContractFactory("ERC998ERC1155Simple");
  contracts.erc998OwnerErc1155 = await erc998Owner1155Factory.deploy(
    "OWNER ERC1155",
    "OWN1155",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  // if (network.name !== "telos_test") {
  //   // contract size too big EVM Execution Error: Code is larger than max code size, out of gas!
  //   const erc998Owner1155and20Factory = await ethers.getContractFactory("ERC998ERC1155ERC20Simple");
  //   contracts.erc998OwnerErc1155Erc20 = await erc998Owner1155and20Factory.deploy(
  //     "OWNER FULL",
  //     "OWNFULL",
  //     royalty,
  //     getBaseTokenURI(chainId),
  //   );
  //   await debug(contracts);
  // }

  const erc1155SimpleFactory = await ethers.getContractFactory("ERC1155Simple");
  contracts.erc1155Simple = await erc1155SimpleFactory.deploy(royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const erc1155InactiveFactory = await ethers.getContractFactory("ERC1155Simple");
  contracts.erc1155Inactive = await erc1155InactiveFactory.deploy(royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const erc1155NewFactory = await ethers.getContractFactory("ERC1155Simple");
  contracts.erc1155New = await erc1155NewFactory.deploy(royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const erc1155BlacklistFactory = await ethers.getContractFactory("ERC1155Blacklist");
  contracts.erc1155Blacklist = await erc1155BlacklistFactory.deploy(royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const vestingFactory = await ethers.getContractFactory("LegacyVesting");
  contracts.vesting = await vestingFactory.deploy(wallet, timestamp, 12, 417);
  await debug(contracts);

  const mysteryboxSimpleFactory = await ethers.getContractFactory("ERC721MysteryBoxSimple");
  const mysteryboxSimpleInstance = await mysteryboxSimpleFactory.deploy(
    "Mysterybox",
    "MB721",
    100,
    getBaseTokenURI(chainId),
  );
  contracts.erc721MysteryboxSimple = mysteryboxSimpleInstance;
  await debug(contracts);

  // await debug(
  //   await factoryInstance.addFactory(await mysteryboxSimpleInstance.getAddress(), MINTER_ROLE),
  //   "contractManager.addFactory",
  // );

  const mysteryboxPausableFactory = await ethers.getContractFactory("ERC721MysteryBoxPausable");
  const mysteryboxPausableInstance = await mysteryboxPausableFactory.deploy(
    "Mysterybox",
    "MB-P721",
    100,
    getBaseTokenURI(chainId),
  );
  contracts.erc721MysteryboxPausable = mysteryboxPausableInstance;
  await debug(contracts);

  // await debug(
  //   await factoryInstance.addFactory(await mysteryboxPausableInstance.getAddress(), MINTER_ROLE),
  //   "contractManager.addFactory",
  // );

  const mysteryboxBlacklistFactory = await ethers.getContractFactory("ERC721MysteryBoxBlacklist");
  const mysteryboxBlacklistInstance = await mysteryboxBlacklistFactory.deploy(
    "Mysterybox",
    "MB-BL721",
    100,
    getBaseTokenURI(chainId),
  );
  contracts.erc721MysteryboxBlacklist = mysteryboxBlacklistInstance;
  await debug(contracts);

  // await debug(
  //   await factoryInstance.addFactory(await mysteryboxBlacklistInstance.getAddress(), MINTER_ROLE),
  //   "contractManager.addFactory",
  // );

  const mysteryboxBlacklistPausableFactory = await ethers.getContractFactory("ERC721MysteryBoxBlacklistPausable");
  const mysteryboxBlacklistPausableInstance = await mysteryboxBlacklistPausableFactory.deploy(
    "Mysterybox",
    "MB-BL-PL721",
    100,
    getBaseTokenURI(chainId),
  );
  contracts.erc721MysteryboxBlacklistPausable = mysteryboxBlacklistPausableInstance;
  await debug(contracts);

  // await debug(
  //   await factoryInstance.addFactory(await mysteryboxBlacklistPausableInstance.getAddress(), MINTER_ROLE),
  //   "contractManager.addFactory",
  // );

  const stakingFactory = await ethers.getContractFactory("Staking");
  const stakingInstance = await stakingFactory.deploy();
  contracts.staking = stakingInstance;
  await debug(contracts);

  await debug(
    await stakingInstance.setRules([
      {
        // NATIVE > NATIVE
        deposit: [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId: 1010101, // -- ETH
            amount: WeiPerEther,
          },
        ],
        reward: [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId: 1010101, // -- ETH
            amount: (WeiPerEther / 100n) * 5n, // 5%
          },
        ],
        content: [],
        terms: {
          period: 30 * 84600,
          penalty: 1,
          maxStake: 0,
          recurrent: false,
          advance: false,
        },
        active: true,
      },
    ]),
    "stakingInstance.setRules",
  );

  await debug(
    await stakingInstance.setRules([
      {
        // ERC20 > ERC721
        deposit: [
          {
            tokenType: 1,
            token: await contracts.erc20Simple.getAddress(),
            tokenId: 1020101, // -- Space Credits
            amount: WeiPerEther,
          },
        ],
        reward: [
          {
            tokenType: 2,
            token: await contracts.erc721Random.getAddress(),
            tokenId: 1030601, // -- sword
            amount: 1,
          },
        ],
        content: [],
        terms: {
          period: 30 * 84600,
          penalty: 1,
          maxStake: 0,
          recurrent: false,
          advance: false,
        },
        active: true,
      },
    ]),
    "stakingInstance.setRules",
  );

  await debug(
    await stakingInstance.setRules([
      {
        // ERC998 > MYSTERY
        deposit: [
          {
            tokenType: 3,
            token: await contracts.erc998Random.getAddress(),
            tokenId: 1040601, // -- warrior
            amount: 1,
          },
        ],
        reward: [
          {
            tokenType: 2,
            token: await contracts.erc721MysteryboxSimple.getAddress(),
            tokenId: 1110101, // -- sword mysterybox
            amount: 1,
          },
        ],
        content: [
          [
            {
              tokenType: 2,
              token: await contracts.erc721Random.getAddress(),
              tokenId: 1030601, // -- sword
              amount: 1,
            },
          ],
        ],
        terms: {
          period: 30 * 84600,
          penalty: 1,
          maxStake: 0,
          recurrent: true,
          advance: false,
        },
        active: true,
      },
    ]),
    "stakingInstance.setRules",
  );

  // await debug(
  //   await factoryInstance.addFactory(await stakingInstance.getAddress(), MINTER_ROLE),
  //   "contractManager.addFactory",
  // );

  // LOTTERY
  const erc721LotteryTicketFactory = await ethers.getContractFactory("ERC721LotteryTicket");
  contracts.erc721LotteryTicket = await erc721LotteryTicketFactory.deploy(
    "LOTTERY TICKET",
    "LOTT721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const randomContractLotteryName = getContractName("Lottery", network.name);
  const lotteryFactory = await ethers.getContractFactory(randomContractLotteryName);
  contracts.lottery = await lotteryFactory.deploy({
    timeLagBeforeRelease: 3600,
    commission: 30,
  });
  await debug(contracts);

  await debug(await contracts.lottery.setSubscriptionId(vrfSubId), "randomInstance.setSubscription");
  await debug(await vrfInstance.addConsumer(vrfSubId, await contracts.lottery.getAddress()), "vrfInstance.addConsumer");
  await debug(
    await contracts.erc721LotteryTicket.grantRole(MINTER_ROLE, await contracts.lottery.getAddress()),
    "grantRole",
  );

  // RAFFLE
  const erc721RaffleTicketFactory = await ethers.getContractFactory("ERC721RaffleTicket");
  contracts.erc721RaffleTicket = await erc721RaffleTicketFactory.deploy(
    "RAFFLE TICKET",
    "RAFF721",
    royalty,
    getBaseTokenURI(chainId),
  );
  await debug(contracts);

  const randomContractRaffleName = getContractName("Raffle", network.name);
  const raffleFactory = await ethers.getContractFactory(randomContractRaffleName);
  contracts.raffle = await raffleFactory.deploy();
  await debug(contracts);

  await debug(await contracts.raffle.setSubscriptionId(vrfSubId), "randomInstance.setSubscription");
  await debug(await vrfInstance.addConsumer(vrfSubId, await contracts.raffle.getAddress()), "vrfInstance.addConsumer");
  await debug(
    await contracts.erc721RaffleTicket.grantRole(MINTER_ROLE, await contracts.raffle.getAddress()),
    "grantRole",
  );

  // GENERATIVE
  const erc721CollectionFactory = await ethers.getContractFactory("ERC721CollectionSimple");
  contracts.erc721Generative = await erc721CollectionFactory.deploy(
    "COLLECTION SIMPLE",
    "COLL721",
    royalty,
    getBaseTokenURI(chainId),
    batchSize,
    owner.address,
  );
  await debug(contracts);

  const usdtFactory = await ethers.getContractFactory("TetherToken");
  contracts.usdt = await usdtFactory.deploy(100000000000, "Tether USD", "USDT", 6);
  await debug(contracts);

  const wethFactory = await ethers.getContractFactory("WETH9");
  contracts.weth =
    network.name !== "binance_test"
      ? await wethFactory.deploy()
      : await ethers.getContractAt("WETH9", "0x1e33833a035069f42d68D1F53b341643De1C018D"); // binance_test
  await debug(contracts);
  // const accessInstance = await ethers.getContractAt("ERC721Simple", contracts[i]);

  const waitListFactory = await ethers.getContractFactory("WaitList");
  contracts.waitList = await waitListFactory.deploy();
  await debug(contracts);

  // function setReward(Params memory params, Asset[] memory items)
  const leavesEntities = [[owner.address], [receiver.address], [stranger.address]];

  const merkleTree = StandardMerkleTree.of(leavesEntities, ["address"]);

  const params = {
    externalId,
    expiresAt,
    nonce,
    extra: merkleTree.root,
    receiver: ZeroAddress,
    referrer: ZeroAddress,
  };
  const items = [
    {
      tokenType: 2,
      token: await contracts.erc721Simple.getAddress(),
      tokenId: 301002,
      amount: "0",
    },
  ];

  await debug(await contracts.waitList.setReward(params, items), "waitList.setReward");

  const erc721WrapFactory = await ethers.getContractFactory("ERC721Wrapper");
  contracts.erc721Wrapper = await erc721WrapFactory.deploy("WRAPPER", "WRAP", royalty, getBaseTokenURI(chainId));
  await debug(contracts);

  const ponziFactory = await ethers.getContractFactory("Ponzi");
  contracts.ponzi = await ponziFactory.deploy();
  await debug(contracts);

  const dispenserFactory = await ethers.getContractFactory("Dispenser");
  contracts.dispenser = await dispenserFactory.deploy();
  await debug(contracts);

  const paymentSplitterFactory = await ethers.getContractFactory("SplitterWallet");
  contracts.paymentSplitter = await paymentSplitterFactory.deploy([owner.address], [100]);
  await debug(contracts);

  // GRANT ROLES
  await grantRoles(
    [
      await contracts.erc1155Blacklist.getAddress(),
      await contracts.erc1155New.getAddress(),
      await contracts.erc1155Simple.getAddress(),
      await contracts.erc721New.getAddress(),
      await contracts.erc721Random.getAddress(),
      await contracts.erc721Simple.getAddress(),
      await contracts.erc721Blacklist.getAddress(),
      await contracts.erc721Discrete.getAddress(),
      await contracts.erc721Rentable.getAddress(),
      await contracts.erc721Soulbound.getAddress(),
      await contracts.erc721Genes.getAddress(),
      await contracts.erc721Generative.getAddress(),
      await contracts.erc998Blacklist.getAddress(),
      await contracts.erc998New.getAddress(),
      await contracts.erc998Random.getAddress(),
      await contracts.erc998Simple.getAddress(),
      await contracts.erc998Discrete.getAddress(),
      await contracts.erc998Genes.getAddress(),
      await contracts.erc998Rentable.getAddress(),
      // await contracts.erc998OwnerErc1155Erc20.getAddress(),
      await contracts.erc998OwnerErc1155.getAddress(),
      await contracts.erc998OwnerErc20.getAddress(),
      await contracts.erc721MysteryboxBlacklistPausable.getAddress(),
      await contracts.erc721MysteryboxBlacklist.getAddress(),
      await contracts.erc721MysteryboxPausable.getAddress(),
      await contracts.erc721MysteryboxSimple.getAddress(),
      await contracts.erc721LotteryTicket.getAddress(),
      await contracts.erc721RaffleTicket.getAddress(),
      await contracts.lottery.getAddress(),
      await contracts.raffle.getAddress(),
    ],
    [
      await contracts.erc721Wrapper.getAddress(),
      await contracts.exchange.getAddress(),
      await contracts.staking.getAddress(),
      await contracts.waitList.getAddress(),
      await contracts.erc721MysteryboxBlacklistPausable.getAddress(),
      await contracts.erc721MysteryboxBlacklist.getAddress(),
      await contracts.erc721MysteryboxPausable.getAddress(),
      await contracts.erc721MysteryboxSimple.getAddress(),
      await contracts.lottery.getAddress(),
      await contracts.raffle.getAddress(),
      await contracts.ponzi.getAddress(),
    ],
    [MINTER_ROLE],
  );

  // GRANT METADATA ROLES
  await grantRoles(
    [
      await contracts.erc721Random.getAddress(),
      await contracts.erc721Discrete.getAddress(),
      await contracts.erc998Discrete.getAddress(),
    ],
    [await contracts.exchange.getAddress()],
    [METADATA_ROLE],
  );

  const balance1 = await ethers.provider.getBalance(owner.address);
  console.info("owner address:", owner.address);
  console.info("ETH Balance0:", formatEther(balance0), "ETH");
  console.info("ETH Balance1:", formatEther(balance1), "ETH");
  console.info("ETH SPENT:", formatEther(balance0 - balance1), "ETH");
}

main()
  .then(async () => {
    console.info(`STARTING_BLOCK=${currentBlock.number}`);
    for (const [key, value] of Object.entries(contracts)) {
      console.info(`${camelToSnakeCase(key).toUpperCase()}_ADDR=${(await value.getAddress()).toLowerCase()}`);
    }
  })
  .catch(error => {
    console.error(error);
  });
