import { ethers, network } from "hardhat";
import { AbiCoder, keccak256, ZeroAddress } from "ethers";

import {
  amount,
  baseTokenURI,
  MINTER_ROLE,
  nonce,
  royalty,
  tokenName,
  tokenSymbol,
} from "@ethberry/contracts-constants";

import { deployDiamond } from "../../test/Exchange/shared";
import { contractTemplate, expiresAt, externalId, extra, tokenId } from "../../test/constants";

async function main() {
  const [owner, merchant, customer] = await ethers.getSigners();

  const contractManagerInstance = await deployDiamond(
    "DiamondCM",
    [
      "ERC20FactoryFacet",
      "VestingFactoryFacet",
      "UseFactoryFacet",
      "AccessControlFacet",
      "PausableFacet",
      "DiamondLoupeFacet",
      "WalletFacet",
    ],
    "DiamondCMInit",
    {
      log: false,
      logSelectors: false,
    },
  );

  console.info("CONTRACT_MANAGER_ADDR", contractManagerInstance.target);

  // DIAMOND EXCHANGE
  const exchangeInstance = await deployDiamond(
    "DiamondExchange",
    ["ExchangeVestingFacet", "PausableFacet", "AccessControlFacet", "WalletFacet", "DiamondLoupeFacet"],
    "DiamondExchangeInit",
    {
      log: false,
      logSelectors: false,
    },
  );

  console.info("EXCHANGE_ADDR", exchangeInstance.target);

  const useFactoryInstance = await ethers.getContractAt("UseFactoryFacet", contractManagerInstance.target);
  await useFactoryInstance.addFactory(exchangeInstance.target, MINTER_ROLE);

  const vestingFactory = await ethers.getContractFactory("ERC721Vesting");

  const deployVestingSignature = await owner.signTypedData(
    // Domain
    {
      name: "CONTRACT_MANAGER",
      version: "1.0.0",
      chainId: network.config.chainId,
      verifyingContract: await contractManagerInstance.getAddress(),
    },
    // Types
    {
      EIP712: [
        { name: "params", type: "Params" },
        { name: "args", type: "VestingArgs" },
      ],
      Params: [
        { name: "nonce", type: "bytes32" },
        { name: "bytecode", type: "bytes" },
        { name: "externalId", type: "uint256" },
      ],
      VestingArgs: [
        { name: "name", type: "string" },
        { name: "symbol", type: "string" },
        { name: "royalty", type: "uint96" },
        { name: "baseTokenURI", type: "string" },
        { name: "contractTemplate", type: "string" },
      ],
    },
    // Values
    {
      params: {
        nonce,
        bytecode: vestingFactory.bytecode,
        externalId,
      },
      args: {
        name: tokenName,
        symbol: tokenSymbol,
        royalty,
        baseTokenURI,
        contractTemplate,
      },
    },
  );

  const vestingFactoryInstance = await ethers.getContractAt("VestingFactoryFacet", contractManagerInstance.target);

  // Static call will return address because it is pain to get it from actual tx
  const txResponse = await vestingFactoryInstance.deployVestingBox(
    {
      nonce,
      bytecode: vestingFactory.bytecode,
      externalId,
    },
    {
      name: tokenName,
      symbol: tokenSymbol,
      royalty,
      baseTokenURI,
      contractTemplate,
    },
    deployVestingSignature,
  );

  const txReceipt = await txResponse.wait();

  const eventFilter = vestingFactoryInstance.filters.VestingBoxDeployed();
  const events = await vestingFactoryInstance.queryFilter(eventFilter, txReceipt!.blockNumber);
  const vestingBoxAddress = events[0].args.account;

  console.info("VESTING_ADDR", vestingBoxAddress);

  const priceFactory = await ethers.getContractFactory("ERC20Simple");
  const priceInstance = await priceFactory.deploy(tokenName, tokenSymbol, amount);
  await priceInstance.waitForDeployment();
  const tx1 = await priceInstance.mint(customer, amount);
  await tx1.wait();
  const tx2 = await priceInstance.connect(customer).approve(exchangeInstance, amount);
  await tx2.wait();

  console.info("PRICE_ADDR", priceInstance.target);

  const contentFactory = await ethers.getContractFactory("ERC20Simple");
  const contentInstance = await contentFactory.connect(merchant).deploy(tokenName, tokenSymbol, amount);
  await contentInstance.waitForDeployment();
  const tx3 = await contentInstance.connect(merchant).mint(merchant, amount);
  await tx3.wait();
  const tx4 = await contentInstance.connect(merchant).approve(exchangeInstance, amount);
  await tx4.wait();

  console.info("CONTENT_ADDR", priceInstance.target);

  const boxConfig = {
    functionType: 1n,
    cliff: 1n,
    startTimestamp: Math.floor(Date.now() / 1000) + 3600,
    duration: 3600n * 10n,
    period: 3600n,
    afterCliffBasisPoints: 10n,
    growthRate: 200n,
  };

  const params = {
    externalId,
    expiresAt,
    nonce,
    extra,
    receiver: merchant.address,
    referrer: ZeroAddress,
  };

  const item = {
    tokenType: 2,
    token: vestingBoxAddress,
    tokenId,
    amount: 1n,
  };

  const price = [
    {
      tokenType: 1,
      token: await priceInstance.getAddress(),
      tokenId,
      amount,
    },
  ];

  const content = [
    {
      tokenType: 1,
      token: await contentInstance.getAddress(),
      tokenId,
      amount,
    },
  ];

  const purchaseSignature = await owner.signTypedData(
    // Domain
    {
      name: "EXCHANGE",
      version: "1.0.0",
      chainId: network.config.chainId,
      verifyingContract: await exchangeInstance.getAddress(),
    },
    // Types
    {
      EIP712: [
        { name: "account", type: "address" },
        { name: "params", type: "Params" },
        { name: "item", type: "Asset" },
        { name: "price", type: "Asset[]" },
        { name: "content", type: "Asset[]" },
        { name: "config", type: "bytes32" },
      ],
      Params: [
        { name: "externalId", type: "uint256" },
        { name: "expiresAt", type: "uint256" },
        { name: "nonce", type: "bytes32" },
        { name: "extra", type: "bytes32" },
        { name: "receiver", type: "address" },
        { name: "referrer", type: "address" },
      ],
      Asset: [
        { name: "tokenType", type: "uint256" },
        { name: "token", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "amount", type: "uint256" },
      ],
    },
    // Value
    {
      account: customer.address,
      params,
      item,
      price,
      content,
      config: keccak256(
        AbiCoder.defaultAbiCoder().encode(
          ["uint8", "uint128", "uint64", "uint64", "uint64", "uint16", "uint16"],
          [
            boxConfig.functionType,
            boxConfig.cliff,
            boxConfig.startTimestamp,
            boxConfig.duration,
            boxConfig.period,
            boxConfig.afterCliffBasisPoints,
            boxConfig.growthRate,
          ],
        ),
      ),
    },
  );

  const vestingExchangeInstance = await ethers.getContractAt("ExchangeVestingFacet", exchangeInstance.target);
  const txResponse1 = await vestingExchangeInstance
    .connect(customer)
    .purchaseVesting(params, item, price, content, boxConfig, purchaseSignature);
  const txReceipt1 = await txResponse1.wait();

  const eventFilter1 = vestingExchangeInstance.filters.PurchaseVesting();
  const events1 = await vestingExchangeInstance.queryFilter(eventFilter1, txReceipt1!.blockNumber);

  console.info("events1", events1[0].args);
}

main().then(console.info).catch(console.error);
