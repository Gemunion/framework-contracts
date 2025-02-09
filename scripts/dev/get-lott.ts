import { ethers } from "hardhat";
import { Result } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";
// import { formatEther, encodeBytes32String, Result, ZeroAddress, WeiPerEther } from "ethers";
// import { blockAwait } from "@framework/utils-eth";
// import { baseTokenURI, MINTER_ROLE } from "@ethberry/contracts-constants";
// import { wrapManyToManySignature } from "../../test/Exchange/shared/utils";
// import { expiresAt } from "../../test/constants";

async function main() {
  // const [owner, receiver] = await ethers.getSigners();

  const lotteryInstance = await ethers.getContractAt("LotteryBesu", "0x3216c8ac30000d3ec32dd648f4dd0de4f4774579");

  // const lotteryInstance = await ethers.getContractAt("LotteryBesu", "0xa4c86c32f10dd6f597817b7991a2b65ee95fd9b8");
  // const lotteryInstance = await ethers.getContractAt("LotteryBesu", "0xb8a23839c4d9f5320596410f0c01dfe08c36422f");
  // const lotteryInstance = await ethers.getContractAt("LotteryBesu", "0xdcefac02377797957b2bc79f0285a866d559428e");

  const round = (await lotteryInstance.getCurrentRoundInfo()) as unknown as Result;
  const decodedRound = recursivelyDecodeResult(round);
  console.info(decodedRound);

  const config = (await lotteryInstance.getLotteryInfo()) as unknown as Result;
  const decodedconfig = recursivelyDecodeResult(config);
  console.info(decodedconfig);

  /*

  // LOTTERY TICKET
  const erc721LotteryTicketFactory = await ethers.getContractFactory("ERC721LotteryTicket");
  const ticketInstance = await erc721LotteryTicketFactory.deploy("LOTTERY TICKET", "LOTT721", 0, baseTokenURI);

  // LOTTERY
  const factory = await ethers.getContractFactory(getContractName("Lottery", network.name));
  const lotteryInstance: any = await factory.deploy({
    timeLagBeforeRelease: 3600,
    commission: 30,
  });

  // EXCHANGE
  const exchangeFactory = await ethers.getContractFactory("Exchange");
  const exchangeInstance = await exchangeFactory.deploy(
    "Exchange",
    ["0xfe3b557e8fb62b89f4916b721be55ceb828dbd73"],
    [100],
  );

  await blockAwait(1, 1000);

  await ticketInstance.grantRole(MINTER_ROLE, await lotteryInstance.getAddress());
  await lotteryInstance.grantRole(MINTER_ROLE, await exchangeInstance.getAddress());

  await blockAwait(1, 1000);
  // VRF
  // await blockAwait(1, 1000);
  // const vrfInstance = await ethers.getContractAt("VRFCoordinatorMock", "0xa50a51c09a5c451c52bb714527e1974b686d8e77");
  // await vrfInstance.addConsumer(network.name === "gemunion_besu" ? 1n : 2n, await coinInstance.getAddress());
  // const round0 = (await coinInstance.getCurrentRoundInfo()) as unknown as Result;
  // const decoded0 = recursivelyDecodeResult(round0);
  // console.info(decoded0);

  const lotteryAddr = await lotteryInstance.getAddress();
  const ticketAddr = await ticketInstance.getAddress();

  await lotteryInstance.startRound(
    {
      tokenType: 2,
      token: ticketAddr,
      tokenId: 1,
      amount: 1,
    },
    {
      tokenType: 0,
      token: ZeroAddress,
      tokenId: 0,
      amount: WeiPerEther,
    },
    0, // maxTicket count
  );
  await blockAwait(1, 1000);

  const round1 = (await lotteryInstance.getCurrentRoundInfo()) as unknown as Result;
  const decoded1 = recursivelyDecodeResult(round1);
  console.info(decoded1);

  // BUY TICKET @EXCHANGE
  const networkE = await ethers.provider.getNetwork();
  const generateManyToManySignature = wrapManyToManySignature(networkE, exchangeInstance, owner);

  const dbRoundId = 101;
  const values = [8, 5, 3, 2, 1, 0];
  const defNumbers = getNumbersBytes(values);
  console.info("defNumbers", defNumbers);
  const signature = await generateManyToManySignature({
    account: receiver.address,
    params: {
      nonce: encodeBytes32String("nonce"),
      externalId: dbRoundId, // externalId: db roundId
      expiresAt,
      referrer: ZeroAddress,
      extra: defNumbers,
    },
    items: [
      {
        tokenType: 0,
        token: await lotteryInstance.getAddress(),
        tokenId: 0,
        amount: 0,
      },
      {
        tokenType: 2,
        token: await ticketInstance.getAddress(),
        tokenId: 0,
        amount: 1,
      },
    ],
    price: [
      {
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount: WeiPerEther,
      },
    ],
  });

  const tx0 = await exchangeInstance.connect(receiver).purchaseLottery(
    {
      nonce: encodeBytes32String("nonce"),
      externalId: dbRoundId, // externalId: db roundId
      expiresAt,
      referrer: ZeroAddress,
      extra: defNumbers,
    },
    [
      {
        tokenType: 0,
        token: await lotteryInstance.getAddress(),
        tokenId: 0,
        amount: 0,
      },
      {
        tokenType: 2,
        token: await ticketInstance.getAddress(),
        tokenId: 0,
        amount: 1,
      },
    ],
    {
      tokenType: 0,
      token: ZeroAddress,
      tokenId: 0,
      amount: WeiPerEther,
    },
    signature,
    { value: WeiPerEther },
  );
  // await blockAwait(1, 1000);
  await tx0.wait();
  console.log("ticket tx", tx0);

  // await coinInstance.printTicket(1, owner.address, defNumbers);
  await blockAwait(1, 1000);
  console.info("ticket purchased!");
  const round11 = (await lotteryInstance.getCurrentRoundInfo()) as unknown as Result;
  const decoded11 = recursivelyDecodeResult(round11);
  console.info(decoded11);

   */

  // // ERC721 contract - random
  // const itemRandomFactory = await ethers.getContractFactory("ERC721Random");
  // const itemRandomInstance = await itemRandomFactory.deploy("ITEMR", "ITEMR", rlNum, baseTokenURI);
  // console.info(`ERC721_R_ADDR=${itemRandomInstance.address.toLowerCase()}`);
  //
  // // ERC721 contract - traits
  // const itemGenesFactory = await ethers.getContractFactory("ERC721Genes");
  // const itemGenesInstance = await itemGenesFactory.deploy("ITEMG", "ITEMG", rlNum, baseTokenURI);
  // console.info(`ERC721_G_ADDR=${itemGenesInstance.address.toLowerCase()}`);
  //
  // // Setup Contracts
  // // await blockAwait(ethers.provider);
  //
  // // ERC721 getRecordField Template
  // const templateKey = await itemDiscreteInstance.TEMPLATE_ID();
  // // 0xe2db241bb2fe321e8c078a17b0902f9429cee78d5f3486725d73d0356e97c842
  // console.info("templateKey", templateKey);
  //
  // // ERC721 getRecordField Template
  // const discreteKey = await itemDiscreteInstance.GRADE();
  // // 0x76e34cd5c7c46b6bfe6b1da94d54447ea83a4af449bc62a0ef3ecae24c08031a
  // console.info("discreteKey", discreteKey);
  //
  // // ERC721 getRecordField Rarity
  // const rarityKey = await itemRandomInstance.RARITY();
  // // 0xda9488a573bb2899ea5782d71e9ebaeb1d8291bf3812a066ec86608a697c51fc
  // console.info("rarityKey", rarityKey);
  //
  // // ERC721 getRecordField Genes
  // const traitsKey = await itemGenesInstance.TRAITS();
  // // 0x8e3ddc4aa9e11e826949389b9fc38032713cef66f38657aa6e1599905d26e564
  // console.info("traitsKey", traitsKey);
}

main().catch(error => {
  console.error(error);
});
