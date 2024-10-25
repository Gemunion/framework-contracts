import { task, types } from "hardhat/config";
import fs from "fs";
import path from "path";

export interface IAbiObj {
  name: string;
  type: string;
}

export interface IArtifact {
  abi: Array<IAbiObj>;
}

// LIST OF EVENTS WE NEED TO INCLUDE TO @FW/PACKAGES
export enum ContractEventSignatures {
  Approval = "Approval(address,address,uint256)",
  Transfer = "Transfer(address,address,uint256)",
  ApprovalForAll = "ApprovalForAll(address,address,bool)",
  DefaultRoyaltyInfo = "DefaultRoyaltyInfo(address,uint96)",
  MintRandom = "MintRandom(uint256,address,uint256[],uint256,uint256)",
  TokenRoyaltyInfo = "TokenRoyaltyInfo(uint256,address,uint96)",
  ConsecutiveTransfer = "ConsecutiveTransfer(uint256,uint256,address,address)",
  BatchReceivedChild = "BatchReceivedChild(address,uint256,address,uint256[],uint256[])",
  BatchTransferChild = "BatchTransferChild(uint256,address,address,uint256[],uint256[])",
  WhitelistedChild = "WhitelistedChild(address,uint256)",
  UnWhitelistedChild = "UnWhitelistedChild(address)",
  ReceivedChild = "ReceivedChild(address,uint256,address,uint256,uint256)",
  TransferChild = "TransferChild(uint256,address,address,uint256,uint256)",
  SetMaxChild = "SetMaxChild(address,uint256)",
  TransferBatch = "TransferBatch(address,address,address,uint256[],uint256[])",
  TransferSingle = "TransferSingle(address,address,address,uint256,uint256)",
  URI = "URI(string,uint256)",
  Merge = "Merge(address,uint256,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256)[])",
  RoundFinalized = "RoundFinalized(uint256,uint8[6])",
  RoundStarted = "RoundStarted(uint256,uint256,uint256,(uint8,address,uint256,uint256),(uint8,address,uint256,uint256))",
  RoundEnded = "RoundEnded(uint256,uint256)",
  PurchaseLottery = "PurchaseLottery(address,uint256,(uint8,address,uint256,uint256),(uint8,address,uint256,uint256))",
  PurchaseRaffle = "PurchaseRaffle(address,uint256,(uint8,address,uint256,uint256),(uint8,address,uint256,uint256))",
  Released = "Released(uint256,uint256)",
  Prize = "Prize(address,uint256,uint256,uint256)",
  UnpackWrapper = "UnpackWrapper(address,uint256)",
  UnpackMysteryBox = "UnpackMysteryBox(address,uint256)",
  Paused = "Paused(address)",
  Unpaused = "Unpaused(address)",
  EtherReleased = "EtherReleased(uint256)",
  ERC20Released = "ERC20Released(address,uint256)",
  EtherReceived = "EtherReceived()",
  Blacklisted = "Blacklisted(address)",
  UnBlacklisted = "UnBlacklisted(address)",
  Whitelisted = "Whitelisted(address)",
  UnWhitelisted = "UnWhitelisted(address)",
  RoleGranted = "RoleGranted(bytes32,address,address)",
  RoleRevoked = "RoleRevoked(bytes32,address,address)",
  RoleAdminChanged = "RoleAdminChanged(bytes32,bytes32,bytes32)",
  DefaultAdminTransferScheduled = "DefaultAdminTransferScheduled(address,uint48)",
  DefaultAdminTransferCanceled = "DefaultAdminTransferCanceled()",
  DefaultAdminDelayChangeScheduled = "DefaultAdminDelayChangeScheduled(uint48,uint48)",
  DefaultAdminDelayChangeCanceled = "DefaultAdminDelayChangeCanceled()",
  OwnershipTransferred = "OwnershipTransferred(address,address)",
  OwnershipTransferStarted = "OwnershipTransferStarted(address,address)",
  RuleCreated = "RuleCreated(uint256,((uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256)[][],(uint256,uint256,uint256,bool,bool),bool))",
  RuleUpdated = "RuleUpdated(uint256,bool)",
  StakingStart = "StakingStart(uint256,uint256,address,uint256,uint256)",
  StakingWithdraw = "StakingWithdraw(uint256,address,uint256)",
  StakingFinish = "StakingFinish(uint256,address,uint256,uint256)",
  BalanceWithdraw = "BalanceWithdraw(address,(uint8,address,uint256,uint256))",
  DepositReturn = "DepositReturn(uint256,address)",
  DepositStart = "DepositStart(uint256,uint256,address,uint256,uint256[])",
  DepositWithdraw = "DepositWithdraw(uint256,address,uint256)",
  DepositFinish = "DepositFinish(uint256,address,uint256,uint256)",
  DepositPenalty = "DepositPenalty(uint256,(uint8,address,uint256,uint256))",
  Purchase = "Purchase(address,uint256,(uint8,address,uint256,uint256),(uint8,address,uint256,uint256)[])",
  Claim = "Claim(address,uint256,(uint8,address,uint256,uint256)[])",
  Craft = "Craft(address,uint256,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256)[])",
  UpdateUser = "UpdateUser(uint256,address,uint64)",
  Lend = "Lend(address,address,uint64,uint256,(uint8,address,uint256,uint256),(uint8,address,uint256,uint256)[])",
  LendMany = "LendMany(address,address,uint64,uint256,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256)[])",
  PurchaseMysteryBox = "PurchaseMysteryBox(address,uint256,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256)[])",
  Upgrade = "Upgrade(address,uint256,(uint8,address,uint256,uint256),(uint8,address,uint256,uint256)[],bytes32,uint256)",
  WaitListRewardSet = "WaitListRewardSet(uint256,bytes32,(uint8,address,uint256,uint256)[])",
  WaitListRewardClaimed = "WaitListRewardClaimed(address,uint256,(uint8,address,uint256,uint256)[])",
  Breed = "Breed(address,uint256,(uint8,address,uint256,uint256),(uint8,address,uint256,uint256))",
  LevelUp = "LevelUp(address,uint256,bytes32,uint256)",
  Dismantle = "Dismantle(address,uint256,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256)[])",
  MetadataUpdate = "MetadataUpdate(uint256)",
  BatchMetadataUpdate = "BatchMetadataUpdate(uint256,uint256)",
  PayeeAdded = "PayeeAdded(address,uint256)",
  PaymentReleased = "PaymentReleased(address,uint256)",
  PaymentReceived = "PaymentReceived(address,uint256)",
  ERC20PaymentReleased = "ERC20PaymentReleased(address,address,uint256)",
  RuleCreatedP = "RuleCreatedP(uint256,((uint8,address,uint256,uint256),(uint8,address,uint256,uint256),(uint256,uint256,uint256),bool))",
  FinalizedToken = "FinalizedToken(address,uint256)",
  WithdrawToken = "WithdrawToken(address,uint256)",
  ReferralBonus = "ReferralBonus(address,address,uint256)",
  RandomWordsRequested = "RandomWordsRequested(bytes32,uint256,uint256,uint64,uint16,uint32,uint32,address)",
  RandomnessRequestId = "RandomnessRequestId(bytes32,address)",
  SubscriptionConsumerAdded = "SubscriptionConsumerAdded(uint64,address)",
  SubscriptionCreated = "SubscriptionCreated(uint64,address)",
  VrfSubscriptionSet = "VrfSubscriptionSet(uint64)",
  PurchaseEcommerce = "PurchaseEcommerce(??)",
  ReferralEvent = "ReferralEvent(address,address,(uint8,address,uint256,uint256)[])",
  ReferralProgram = "ReferralProgram((uint256,uint256,uint8,bool))",
  ReferralReward = "ReferralReward(address,address,uint8,address,uint256)",
  ReferralWithdraw = "ReferralWithdraw(address,address,uint256)",
  VestingDeployed = "VestingDeployed(address,uint256,(address,uint64,uint16,uint16))",
  ERC20TokenDeployed = "ERC20TokenDeployed(address,uint256,(string,string,uint256,string))",
  ERC721TokenDeployed = "ERC721TokenDeployed(address,uint256,(string,string,uint96,string,string))",
  ERC998TokenDeployed = "ERC998TokenDeployed(address,uint256,(string,string,uint96,string,string))",
  ERC1155TokenDeployed = "ERC1155TokenDeployed(address,uint256,(uint96,string,string))",
  MysteryBoxDeployed = "MysteryBoxDeployed(address,uint256,(string,string,uint96,string,string))",
  CollectionDeployed = "CollectionDeployed(address,uint256,(string,string,uint96,string,uint96,string))",
  PonziDeployed = "PonziDeployed(address,uint256,(address[],uint256[],string))",
  StakingDeployed = "StakingDeployed(address,uint256,(string))",
  LotteryDeployed = "LotteryDeployed(address,uint256,((uint256,uint256)))",
  RaffleDeployed = "RaffleDeployed(address,uint256)",
  WaitListDeployed = "WaitListDeployed(address,uint256)",
  PaymentSplitterDeployed = "PaymentSplitterDeployed(address,uint256,(address[],uint256[]))",
  TransferReceived = "TransferReceived(address,address,uint256,bytes)",
}
export const fwEventNames = Object.keys(ContractEventSignatures).map(key => key.toString());

// LIST OF FUNCTIONS WE NEED TO INCLUDE TO @FW/PACKAGES
export const fwFunctionNames = [
  "ERC20Simple:transfer",
  "ERC20Simple:transferAndCall",
  "ERC20Simple:approve",
  "ERC20Simple:mint",
  "ERC20Simple:balanceOf",
  "ERC20Simple:allowance",
  "ERC20Whitelist:unWhitelist",
  "ERC20Whitelist:whitelist",
  "ERC20Blacklist:blacklist",
  "ERC20Blacklist:unBlacklist",

  "ERC721Simple:safeTransferFrom",
  "ERC721Simple:mintCommon",
  "ERC721Simple:setBaseURI",
  "ERC721Simple:safeTransferFrom",
  "ERC721Simple:approve",
  "ERC721Simple:setApprovalForAll",
  "ERC721Simple:isApprovedForAll",
  "ERC721Simple:setTokenRoyalty",
  "ERC721Simple:setDefaultRoyalty",
  "ERC721RandomEthberry:setSubscriptionId",
  "ERC721LootBoxSimple:mintBox",
  "ERC721LootBoxSimple:unpack",
  "ERC721MysteryBoxSimple:mintBox",
  "ERC721MysteryBoxSimple:unpack",
  "ERC721Wrapper:mintBox",
  "ERC721Wrapper:unpack",

  "ERC998Simple:unWhitelistChild",
  "ERC998Simple:whiteListChild",
  "ERC998Simple:safeTransferChild",
  "ERC998Simple:whitelist",
  "ERC998ERC1155ERC20Enum:getERC20",
  "ERC998ERC1155ERC20Enum:safeTransferFromERC1155",
  "ERC998ERC1155ERC20Enum:transferERC20",

  "ERC1155Simple:safeTransferFrom",
  "ERC1155Simple:setApprovalForAll",
  "ERC1155Simple:isApprovedForAll",
  "ERC1155Simple:mint",

  "AccessControlFacet:grantRole",
  "AccessControlFacet:renounceRole",
  "AccessControlFacet:revokeRole",
  "Ownable:transferOwnership",
  "Pausable:pause",
  "Pausable:unpause",

  "Vesting:releasable",
  "Vesting:release",

  "VRFCoordinatorV2PlusMock:getSubscription",
  "VRFCoordinatorV2PlusMock:addConsumer",
  "VRFCoordinatorV2PlusMock:createSubscription",
  "ERC677:transferAndCall",

  "Dispenser:disperse",

  "Lottery:releaseFunds",
  "Lottery:endRound",
  "Lottery:startRound",
  "Lottery:getPrize",

  "Raffle:startRound",
  "Raffle:endRound",

  "Ponzi:updateRule",
  "Ponzi:setRules",
  "Ponzi:updateRule",
  "Ponzi:deposit",
  "Ponzi:withdrawToken",

  "Staking:getPenalty",
  "Staking:setRules",
  "Staking:withdrawBalance",
  "Staking:receiveReward",
  "Staking:deposit",

  "WaitList:setReward",
  "WaitList:claim",

  "SplitterWallet:release",

  "ERC20FactoryFacet:deployERC20Token",
  "ERC721FactoryFacet:deployERC721Token",
  "ERC998FactoryFacet:deployERC998Token",
  "ERC1155FactoryFacet:deployERC1155Token",
  "LootBoxFactoryFacet:deployLootBox",
  "MysteryBoxFactoryFacet:deployMysteryBox",
  "PredictionFactoryFacet:deployPrediction",
  "StakingFactoryFacet:deployStaking",
  "PonziFactoryFacet:deployPonzi",
  "PaymentSplitterFactoryFacet:deployPaymentSplitter",
  "CollectionFactoryFacet:deployCollection",
  "LotteryFactoryFacet:deployLottery",
  "VestingFactoryFacet:deployVesting",
  "WaitListFactoryFacet:deployWaitList",
  "RaffleFactoryFacet:deployRaffle",

  "TopUp:topUp",

  "ExchangePurchaseFacet:purchase",
  "ExchangeRandomFacet:purchaseRandom",
  "ExchangeGenesFacet:breed",
  "ExchangeGenesFacet:purchaseGenes",
  "ExchangeRentableFacet:lend",
  "ExchangeClaimFacet:claim",
  "ExchangeClaimFacet:spend",
  "ExchangeDiscreteFacet:upgrade",
  "ExchangeLootBoxFacet:purchaseLoot",
  "ExchangeLotteryFacet:purchaseLottery",
  "ExchangeMysteryBoxFacet:purchaseMystery",
  "ExchangeRaffleFacet:purchaseRaffle",
  "ExchangeCraftFacet:craft",
  "ExchangeMergeFacet:merge",
  "ExchangeDismantleFacet:dismantle",
];

task("abis", "Save all functions abi separately")
  .addOptionalVariadicPositionalParam("files", "The files to include", undefined, types.inputFile)
  .setAction(async ({ files = "artifacts/contracts/" }, hre) => {
    const artfcts = await hre.artifacts.getArtifactPaths();
    const conart = artfcts
      .filter(
        art => art.includes(`${process.cwd()}/${files}`) || art.includes("@ethberry/contracts-chain-link-v2-plus"),
      )
      .filter(art => !art.includes(`/interfaces`));

    const globEventArr: Array<string> = [];
    const fwEventArr: Array<IAbiObj> = [];

    if (!fs.existsSync("./abis")) {
      fs.mkdirSync("./abis");
    }

    for (const art of conart) {
      const name = path.parse(art).name;

      const abif: IArtifact = JSON.parse(fs.readFileSync(art, "utf8"));

      // filer functions
      const abiFunctions = abif.abi.filter(item => item.type === "function");
      // filter events
      const abiEvents = abif.abi.filter(item => item.type === "event");

      // functions
      for (const func of abiFunctions) {
        // FRAMEWORK ABIS
        if (fwFunctionNames.includes(`${name}:${func.name}`)) {
          const funcName = func.name;
          // create folder
          const funcFolderPath = path.join(process.cwd(), `../packages/abis/json/${name}`);
          if (!fs.existsSync(funcFolderPath)) {
            fs.mkdirSync(funcFolderPath);
          }

          const funcArray = abiFunctions.filter(func => func.name === funcName);

          const funcFilePath = path.join(funcFolderPath, `${func.name}.json`);
          fs.writeFileSync(funcFilePath, JSON.stringify(funcArray), {
            encoding: "utf-8",
            flag: "w+",
          });
        }
      }

      // events
      for (const event of abiEvents) {
        const includes = globEventArr.includes(JSON.stringify(event));

        if (!includes) {
          globEventArr.push(JSON.stringify(event));

          // FRAMEWORK EVENT ABIS
          if (fwEventNames.includes(event.name)) {
            const includes = fwEventArr.includes(event);
            if (!includes) {
              fwEventArr.push(event);
            }
          }
        }
      }

      const eventsFolderPath = path.join(process.cwd(), `../packages/abis/json/events`);
      if (!fs.existsSync(eventsFolderPath)) {
        fs.mkdirSync(eventsFolderPath);
      }

      const eventsFilePath = path.join(eventsFolderPath, "fw-events.json");

      fs.writeFileSync(eventsFilePath, JSON.stringify(fwEventArr), {
        encoding: "utf-8",
        flag: "w+",
      });
    }
  });

// hardhat abis
