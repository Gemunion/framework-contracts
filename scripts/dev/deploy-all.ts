import { ethers, network } from "hardhat";
import { Contract, WeiPerEther, ZeroAddress } from "ethers";
import fs from "fs";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

import { camelToSnakeCase } from "@ethberry/utils";
import { blockAwait, blockAwaitMs } from "@ethberry/contracts-helpers";
import {
  baseTokenURI,
  METADATA_ROLE,
  MINTER_ROLE,
  nonce,
  royalty,
  wallet,
  wallets,
} from "@ethberry/contracts-constants";

import { getContractName } from "../../test/utils";
import { expiresAt, externalId } from "../../test/constants";

const delay = 1; // block delay
const delayMs = 900; // block delay ms
// const linkAmountInEth = parseEther("1");
const batchSize = 3; // Generative collection size
interface IObj {
  address?: string;
  hash?: string;
}

const debug = async (obj: IObj | Record<string, Contract>, name?: string) => {
  if (obj?.hash) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string,@typescript-eslint/restrict-template-expressions
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

export const grantRoles = async (contracts: Array<string>, grantee: Array<string>, roles: Array<string>) => {
  let idx = 1;
  const max = contracts.length * grantee.length * roles.length;
  for (const contract of contracts) {
    for (const account of grantee) {
      for (const role of roles) {
        if (contract !== account) {
          const accessInstance = await ethers.getContractAt("ERC721Simple", contract);
          console.info(`grantRole [${idx} of ${max}] ${contract} ${account}`);
          idx++;
          await blockAwaitMs(300);
          await accessInstance.grantRole(role, account);
          // await debug(await accessInstance.grantRole(roles[k], grantee[j]), "grantRole");
        }
      }
    }
  }
};

const contracts: Record<string, any> = {};
const amount = WeiPerEther * 1000000000000n; // ?
const timestamp = Math.ceil(Date.now() / 1000);
const currentBlock: { number: number } = { number: 1 };

async function main() {
  const [owner, receiver, stranger] = await ethers.getSigners();
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
  // const vrfFactory = await ethers.getContractFactory("VRFCoordinatorMock");
  // contracts.vrf = await vrfFactory.deploy(contracts.link.address);
  // await debug(contracts);
  // console.info(`VRF_ADDR=${contracts.vrf.address}`);
  // await debug(await linkInstance.mint(owner.address, linkAmountInWei.mul(100)), "LinkInstance.mint");
  // console.info("afterDebug");

  // HAVE TO PASS VRF AND LINK ADDRESSES TO CHAINLINK-BESU CONCTRACT
  const vrfAddr =
    network.name === "gemunion_besu"
      ? "0xa50a51c09a5c451C52BB714527E1974b686D8e77" // vrf besu localhost
      : network.name === "gemunion"
        ? "0x86c86939c631d53c6d812625bd6ccd5bf5beb774" // vrf besu gemunion
        : "0xa50a51c09a5c451C52BB714527E1974b686D8e77";
  const vrfInstance = await ethers.getContractAt("VRFCoordinatorMock", vrfAddr);

  const cmFactory = await ethers.getContractFactory("ContractManager");
  // contracts.contractManager = cmFactory.attach("0x690579e4b583dd87db51361e30e0b3493d5c5e6c");

  contracts.contractManager = await cmFactory.deploy();
  await debug(contracts);
  // console.info("contracts.contractManager.address", contracts.contractManager.address);

  const exchangeFactory = await ethers.getContractFactory("Exchange");
  const exchangeInstance = await exchangeFactory.deploy(
    "Exchange",
    [
      "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73",
      "0x627306090abaB3A6e1400e9345bC60c78a8BEf57",
      "0x61284003e50b2d7ca2b95f93857abb78a1b0f3ca",
    ],
    [1, 5, 95],
  );
  contracts.exchange = exchangeInstance;
  await debug(contracts);

  contracts.exchangeBinance = await exchangeFactory.deploy(
    "Exchange",
    [
      "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73",
      "0x627306090abaB3A6e1400e9345bC60c78a8BEf57",
      "0x61284003e50b2d7ca2b95f93857abb78a1b0f3ca",
    ],
    [1, 5, 95],
  );
  await debug(contracts);

  await debug(
    await contracts.contractManager.addFactory(await exchangeInstance.getAddress(), MINTER_ROLE),
    "contractManager.addFactory",
  );

  await debug(
    await contracts.contractManager.addFactory(await exchangeInstance.getAddress(), METADATA_ROLE),
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
  const erc721SimpleFactory = await ethers.getContractFactory("ERC721Simple");
  contracts.erc721Simple = await erc721SimpleFactory.deploy("RUNE", "GEM721", royalty, baseTokenURI);
  await debug(contracts);

  const erc721InactiveFactory = await ethers.getContractFactory("ERC721Simple");
  contracts.erc721Inactive = await erc721InactiveFactory.deploy("ERC721 INACTIVE", "OFF721", royalty, baseTokenURI);
  await debug(contracts);

  const erc721NewFactory = await ethers.getContractFactory("ERC721Simple");
  contracts.erc721New = await erc721NewFactory.deploy("ERC721 NEW", "NEW721", royalty, baseTokenURI);
  await debug(contracts);

  const erc721BlacklistFactory = await ethers.getContractFactory("ERC721Blacklist");
  contracts.erc721Blacklist = await erc721BlacklistFactory.deploy("ERC721 BLACKLIST", "BL721", royalty, baseTokenURI);
  await debug(contracts);

  const ERC721DiscreteFactory = await ethers.getContractFactory("ERC721Discrete");
  contracts.erc721Discrete = await ERC721DiscreteFactory.deploy("ERC721 ARMOUR", "LVL721", royalty, baseTokenURI);
  await debug(contracts);

  // const randomContractName =
  //   network.name === "gemunion_besu"
  //     ? "ERC721RandomBesuV2"
  //     : network.name === "gemunion"
  //     ? "ERC721RandomGemunionV2"
  //     : "ERC721Random";
  const randomContractName = getContractName("ERC721DiscreteRandom", network.name);

  const erc721RandomFactory = await ethers.getContractFactory(randomContractName);
  contracts.erc721Random = await erc721RandomFactory.deploy("ERC721 WEAPON", "RNG721", royalty, baseTokenURI);
  await debug(contracts);

  // await debug(await linkInstance.transfer(contracts.erc721Random.address, linkAmountInEth), "linkInstance.transfer");
  await debug(
    await vrfInstance.addConsumer(
      network.name === "gemunion_besu" ? 1n : 2n,
      await contracts.erc721Random.getAddress(),
    ),
    "vrfInstance.addConsumer",
  );
  // await blockAwait(delay, delayMs);
  // const eventFilter = vrfInstance.filters.SubscriptionConsumerAdded();
  // const events = await vrfInstance.queryFilter(eventFilter);
  // const { subId, consumer } = recursivelyDecodeResult(events[0].args as unknown as Result);
  // console.info("SubscriptionConsumerAdded", subId, consumer);

  const erc721SoulboundFactory = await ethers.getContractFactory("ERC721Soulbound");
  contracts.erc721Soulbound = await erc721SoulboundFactory.deploy("ERC721 MEDAL", "SB721", royalty, baseTokenURI);
  await debug(contracts);

  const genesContractName = getContractName("ERC721Genes", network.name);
  const erc721GenesFactory = await ethers.getContractFactory(genesContractName);
  contracts.erc721Genes = await erc721GenesFactory.deploy("ERC721 DNA", "DNA721", royalty, baseTokenURI);
  await debug(contracts);

  await debug(
    await vrfInstance.addConsumer(network.name === "gemunion_besu" ? 1n : 2n, await contracts.erc721Genes.getAddress()),
    "vrfInstance.addConsumer",
  );

  const erc721RentableFactory = await ethers.getContractFactory("ERC721Rentable");
  contracts.erc721Rentable = await erc721RentableFactory.deploy("T-SHIRT (rentable)", "TS721", royalty, baseTokenURI);
  await debug(contracts);

  // ERC998

  const erc998SimpleFactory = await ethers.getContractFactory("ERC998Simple");
  contracts.erc998Simple = await erc998SimpleFactory.deploy("ERC998 SIMPLE", "GEM998", royalty, baseTokenURI);
  await debug(contracts);

  const erc998InactiveFactory = await ethers.getContractFactory("ERC998Simple");
  contracts.erc998Inactive = await erc998InactiveFactory.deploy("ERC998 INACTIVE", "OFF998", royalty, baseTokenURI);
  await debug(contracts);

  const erc998NewFactory = await ethers.getContractFactory("ERC998Simple");
  contracts.erc998New = await erc998NewFactory.deploy("ERC998 NEW", "NEW998", royalty, baseTokenURI);
  await debug(contracts);

  const erc998BlacklistFactory = await ethers.getContractFactory("ERC998Blacklist");
  contracts.erc998Blacklist = await erc998BlacklistFactory.deploy("ERC998 BLACKLIST", "BL998", royalty, baseTokenURI);
  await debug(contracts);

  const ERC998DiscreteFactory = await ethers.getContractFactory("ERC998Discrete");
  contracts.erc998Discrete = await ERC998DiscreteFactory.deploy("ERC998 LVL", "LVL998", royalty, baseTokenURI);
  await debug(contracts);

  const randomContract998Name = getContractName("ERC998Random", network.name);

  const erc998RandomFactory = await ethers.getContractFactory(randomContract998Name);
  const erc998RandomInstance: any = await erc998RandomFactory.deploy("ERC998 HERO", "RNG998", royalty, baseTokenURI);
  contracts.erc998Random = erc998RandomInstance;
  await debug(contracts);

  // await debug(await linkInstance.transfer(contracts.erc998Random.getAddress(), linkAmountInEth), "linkInstance.transfer");
  await debug(
    await vrfInstance.addConsumer(
      network.name === "gemunion_besu" ? 1n : 2n,
      await contracts.erc998Random.getAddress(),
    ),
    "vrfInstance.addConsumer",
  );

  await debug(
    await erc998RandomInstance.whiteListChild(await contracts.erc721Random.getAddress(), 5),
    "erc998RandomInstance.whiteListChild",
  );

  const genes998ContractName = getContractName("ERC998Genes", network.name);
  const erc998GenesFactory = await ethers.getContractFactory(genes998ContractName);
  contracts.erc998Genes = await erc998GenesFactory.deploy("AXIE (traits)", "DNA998", royalty, baseTokenURI);
  await debug(contracts);

  await debug(
    await vrfInstance.addConsumer(network.name === "gemunion_besu" ? 1n : 2n, await contracts.erc998Genes.getAddress()),
    "vrfInstance.addConsumer",
  );

  const erc998RentableFactory = await ethers.getContractFactory("ERC998Rentable");
  contracts.erc998Rentable = await erc998RentableFactory.deploy("C-SHIRT (rentable)", "REN998", royalty, baseTokenURI);
  await debug(contracts);

  // TODO contracts are too big
  const erc998Owner20Factory = await ethers.getContractFactory("ERC998ERC20Simple");
  contracts.erc998OwnerErc20 = await erc998Owner20Factory.deploy("OWNER ERC20", "OWN20", royalty, baseTokenURI);
  await debug(contracts);

  const erc998Owner1155Factory = await ethers.getContractFactory("ERC998ERC1155Simple");
  contracts.erc998OwnerErc1155 = await erc998Owner1155Factory.deploy("OWNER ERC1155", "OWN1155", royalty, baseTokenURI);
  await debug(contracts);

  const erc998Owner1155and20Factory = await ethers.getContractFactory("ERC998ERC1155ERC20Simple");
  contracts.erc998OwnerErc1155Erc20 = await erc998Owner1155and20Factory.deploy(
    "OWNER FULL",
    "OWNFULL",
    royalty,
    baseTokenURI,
  );
  await debug(contracts);

  const erc1155SimpleFactory = await ethers.getContractFactory("ERC1155Simple");
  contracts.erc1155Simple = await erc1155SimpleFactory.deploy(royalty, baseTokenURI);
  await debug(contracts);

  const erc1155InactiveFactory = await ethers.getContractFactory("ERC1155Simple");
  contracts.erc1155Inactive = await erc1155InactiveFactory.deploy(royalty, baseTokenURI);
  await debug(contracts);

  const erc1155NewFactory = await ethers.getContractFactory("ERC1155Simple");
  contracts.erc1155New = await erc1155NewFactory.deploy(royalty, baseTokenURI);
  await debug(contracts);

  const erc1155BlacklistFactory = await ethers.getContractFactory("ERC1155Blacklist");
  contracts.erc1155Blacklist = await erc1155BlacklistFactory.deploy(royalty, baseTokenURI);
  await debug(contracts);

  const vestingFactory = await ethers.getContractFactory("LegacyVesting");
  contracts.vesting = await vestingFactory.deploy(wallet, timestamp, 12, 417);
  await debug(contracts);

  const mysteryboxSimpleFactory = await ethers.getContractFactory("ERC721MysteryBoxSimple");
  const mysteryboxSimpleInstance = await mysteryboxSimpleFactory.deploy("Mysterybox", "MB721", 100, baseTokenURI);
  contracts.erc721MysteryboxSimple = mysteryboxSimpleInstance;
  await debug(contracts);

  await debug(
    await contracts.contractManager.addFactory(await mysteryboxSimpleInstance.getAddress(), MINTER_ROLE),
    "contractManager.addFactory",
  );

  const mysteryboxPausableFactory = await ethers.getContractFactory("ERC721MysteryBoxPausable");
  const mysteryboxPausableInstance = await mysteryboxPausableFactory.deploy("Mysterybox", "MB-P721", 100, baseTokenURI);
  contracts.erc721MysteryboxPausable = mysteryboxPausableInstance;
  await debug(contracts);

  await debug(
    await contracts.contractManager.addFactory(await mysteryboxPausableInstance.getAddress(), MINTER_ROLE),
    "contractManager.addFactory",
  );

  const mysteryboxBlacklistFactory = await ethers.getContractFactory("ERC721MysteryBoxBlacklist");
  const mysteryboxBlacklistInstance = await mysteryboxBlacklistFactory.deploy(
    "Mysterybox",
    "MB-BL721",
    100,
    baseTokenURI,
  );
  contracts.erc721MysteryboxBlacklist = mysteryboxBlacklistInstance;
  await debug(contracts);

  await debug(
    await contracts.contractManager.addFactory(await mysteryboxBlacklistInstance.getAddress(), MINTER_ROLE),
    "contractManager.addFactory",
  );

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
            tokenId: 0,
            amount: WeiPerEther,
          },
        ],
        reward: [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId: 0,
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
            tokenId: 0,
            amount: WeiPerEther,
          },
        ],
        reward: [
          {
            tokenType: 2,
            token: await contracts.erc721Random.getAddress(),
            tokenId: 306001,
            amount: 1n,
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
        // ERC998 > ERC1155
        deposit: [
          {
            tokenType: 3,
            token: await contracts.erc998Random.getAddress(),
            tokenId: 0,
            amount: 1,
          },
        ],
        reward: [
          {
            tokenType: 2,
            token: await contracts.erc721MysteryboxSimple.getAddress(),
            tokenId: 601001,
            amount: 1,
          },
        ],
        content: [
          [
            {
              tokenType: 2,
              token: await contracts.erc721Random.getAddress(),
              tokenId: 306001,
              amount: 1,
            },
          ],
        ],
        terms: {
          period: 1 * 84600,
          penalty: 0,
          maxStake: 0,
          recurrent: true,
          advance: false,
        },
        active: true,
      },
    ]),
    "stakingInstance.setRules",
  );

  await debug(
    await contracts.contractManager.addFactory(await stakingInstance.getAddress(), MINTER_ROLE),
    "contractManager.addFactory",
  );

  // LOTTERY
  const erc721LotteryTicketFactory = await ethers.getContractFactory("ERC721LotteryTicket");
  contracts.erc721LotteryTicket = await erc721LotteryTicketFactory.deploy(
    "LOTTERY TICKET",
    "LOTT721",
    royalty,
    baseTokenURI,
  );
  await debug(contracts);

  const randomContractLotteryName = getContractName("Lottery", network.name);
  const lotteryFactory = await ethers.getContractFactory(randomContractLotteryName);
  contracts.lottery = await lotteryFactory.deploy({
    timeLagBeforeRelease: 3600,
    commission: 30,
  });
  await debug(contracts);

  await debug(
    await vrfInstance.addConsumer(network.name === "gemunion_besu" ? 1n : 2n, await contracts.lottery.getAddress()),
    "vrfInstance.addConsumer",
  );
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
    baseTokenURI,
  );
  await debug(contracts);

  const randomContractRaffleName = getContractName("Raffle", network.name);
  const raffleFactory = await ethers.getContractFactory(randomContractRaffleName);
  contracts.raffle = await raffleFactory.deploy({
    timeLagBeforeRelease: 3600,
    commission: 30,
  });
  await debug(contracts);
  await debug(
    await vrfInstance.addConsumer(network.name === "gemunion_besu" ? 1n : 2n, await contracts.raffle.getAddress()),
    "vrfInstance.addConsumer",
  );
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
    baseTokenURI,
    batchSize,
    owner.address,
  );
  await debug(contracts);

  const usdtFactory = await ethers.getContractFactory("TetherToken");
  contracts.usdt = await usdtFactory.deploy(100000000000, "Tether USD", "USDT", 6);
  await debug(contracts);

  const busdFactory = await ethers.getContractFactory("BEP20Token");
  contracts.busd = await busdFactory.deploy();
  await debug(contracts);

  const wethFactory = await ethers.getContractFactory("WETH9");
  contracts.weth =
    network.name !== "binance_test"
      ? await wethFactory.deploy()
      : await ethers.getContractAt("WETH9", "0x1e33833a035069f42d68D1F53b341643De1C018D"); // binance_test
  await debug(contracts);
  // const accessInstance = await ethers.getContractAt("ERC721Simple", contracts[i]);

  const waitlistFactory = await ethers.getContractFactory("WaitList");
  contracts.waitlist = await waitlistFactory.deploy();
  await debug(contracts);

  // function setReward(Params memory params, Asset[] memory items)
  const leavesEntities = [[owner.address], [receiver.address], [stranger.address]];

  const merkleTree = StandardMerkleTree.of(leavesEntities, ["address"]);

  const params = {
    nonce,
    externalId,
    expiresAt,
    referrer: ZeroAddress,
    extra: merkleTree.root,
  };
  const items = [
    {
      tokenType: 2,
      token: await contracts.erc721Simple.getAddress(),
      tokenId: 301002,
      amount: "0",
    },
  ];

  await debug(await contracts.waitlist.setReward(params, items), "waitlist.setReward");

  const erc721WrapFactory = await ethers.getContractFactory("ERC721Wrapper");
  contracts.erc721Wrapper = await erc721WrapFactory.deploy("WRAPPER", "WRAP", royalty, baseTokenURI);
  await debug(contracts);

  const ponziFactory = await ethers.getContractFactory("Ponzi");
  contracts.ponzi = await ponziFactory.deploy();
  await debug(contracts);

  const dispenserFactory = await ethers.getContractFactory("Dispenser");
  contracts.dispenser = await dispenserFactory.deploy();
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
      await contracts.erc998OwnerErc1155Erc20.getAddress(),
      await contracts.erc998OwnerErc1155.getAddress(),
      await contracts.erc998OwnerErc20.getAddress(),
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
      await contracts.waitlist.getAddress(),
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
