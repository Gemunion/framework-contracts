import { expect } from "chai";
import { ethers } from "hardhat";
import { parseEther, ZeroAddress, ZeroHash } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { shouldBehaveLikePausable, shouldSupportsInterface } from "@ethberry/contracts-utils";
import { shouldBehaveLikeAccessControl } from "@ethberry/contracts-access";
import {
  amount,
  DEFAULT_ADMIN_ROLE,
  InterfaceId,
  MINTER_ROLE,
  nonce,
  PAUSER_ROLE,
  TEMPLATE_ID,
} from "@ethberry/contracts-constants";

import { expiresAt, templateId, tokenId, tokenIds, tokenIdsZero } from "../../constants";
import { IStakingRule } from "./interface/staking";
import { deployStaking } from "./shared/fixture";
import { deployERC1363 } from "../../ERC20/shared/fixtures";
import { deployERC721 } from "../../ERC721/shared/fixtures";
import { deployERC1155 } from "../../ERC1155/shared/fixtures";
import { shouldBehaveLikeTopUp } from "../../shared/topUp";
import { shouldHaveReentrancyGuard } from "./shared/reentraceReward";
import { isEqualEventArgArrObj } from "../../utils";

/*
1. Calculate multiplier (count full periods since stake start)

2. Deposit withdraw
  2.1 If withdrawDeposit || ( multiplier > 0 && !rule.terms.recurrent ) || ( stake.cycles > 0 && breakLastPeriod )

    2.1.1 If multiplier == 0                       -> deduct penalty from deposit amount
    2.1.2 Transfer deposit to user account         -> spend(_toArray(depositItem), receiver)

  2.2 Else -> update stake.startTimestamp = block.timestamp

3. Reward transfer
  3.1 If multiplier > 0                            -> transfer reward amount * multiplier to receiver

4. If multiplier == 0 && rule.terms.recurrent && !withdrawDeposit && !breakLastPeriod
                                                   -> revert with Error ( first period not yet finished )
*/
/*
MULTIPLIER - RECURRENT - WITHDRAW_DEPOSIT - BREAK_LAST_PERIOD === DECISION
   0            0             0                   0           === WITHDRAW DEPOSIT

   1            0             0                   0           === WITHDRAW DEPOSIT AND REWARD
   0            1             0                   0           === REVERT (NOTHING TO DO)
   0            0             1                   0           === WITHDRAW DEPOSIT
   0            0             0                   1           === WITHDRAW DEPOSIT

   1            1             0                   0           === WITHDRAW REWARD AND SET NEW TIME
   0            1             1                   0           === WITHDRAW DEPOSIT
   0            0             1                   1           === WITHDRAW DEPOSIT
   1            0             0                   1           === WITHDRAW DEPOSIT

   1            1             1                   0           === WITHDRAW DEPOSIT AND REWARD
   0            1             1                   1           === WITHDRAW DEPOSIT
   1            0             1                   1           === WITHDRAW DEPOSIT AND REWARD
   1            1             0                   1           === WITHDRAW DEPOSIT AND REWARD

   1            1             1                   1           === WITHDRAW DEPOSIT AND REWARD
*/

describe("Staking", function () {
  this.timeout(120000);
  const period = 30;
  const penalty = 0;
  const cycles = 2;
  const maxStake = 2;

  const params = {
    nonce,
    externalId: 1,
    expiresAt,
    receiver: ZeroAddress,
    referrer: ZeroAddress,
    extra: ZeroHash,
  };
  const params2 = {
    nonce,
    externalId: 2,
    expiresAt,
    receiver: ZeroAddress,
    referrer: ZeroAddress,
    extra: ZeroHash,
  };

  const factory = () => deployStaking();
  const erc20Factory = () => deployERC1363("ERC20Simple", { amount: parseEther("200000") });
  const erc721Factory = (name?: string) => deployERC721(name);
  const erc1155Factory = () => deployERC1155();

  shouldBehaveLikeAccessControl(factory)(DEFAULT_ADMIN_ROLE, PAUSER_ROLE);
  shouldBehaveLikePausable(factory);
  shouldBehaveLikeTopUp(factory);
  shouldHaveReentrancyGuard(factory);

  shouldSupportsInterface(factory)([
    InterfaceId.IERC165,
    InterfaceId.IAccessControl,
    InterfaceId.IERC1363Receiver,
    InterfaceId.IERC1363Spender,
    InterfaceId.IERC721Receiver,
    InterfaceId.IERC1155Receiver,
  ]);

  describe("setRule", function () {
    it("should set one Rule", async function () {
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
    });

    it("should set multiple Rules", async function () {
      const stakingInstance = await factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc721RandomInstance = await erc721Factory("ERC721Random");
      const mysteryBoxInstance = await erc721Factory("ERC721MysteryBoxSimple");

      const stakeRule1: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721RandomInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const stakeRule2: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: mysteryBoxInstance,
            tokenId,
            amount,
          },
        ],
        content: [
          [
            {
              tokenType: 2, // ERC721
              token: erc721SimpleInstance,
              tokenId,
              amount,
            },
          ],
        ],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule1, stakeRule2]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
      // todo count Events?
    });

    it("should fail: account is missing role", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.connect(receiver).setRules([stakeRule]);

      await expect(tx)
        .to.be.revertedWithCustomError(stakingInstance, "AccessControlUnauthorizedAccount")
        .withArgs(receiver.address, DEFAULT_ADMIN_ROLE);
    });

    it("should fail: edit when Rule not exist", async function () {
      const stakingInstance = await factory();

      const tx1 = stakingInstance.updateRule(1, false);
      await expect(tx1).to.be.revertedWithCustomError(stakingInstance, "StakingStakeNotExist");
    });

    it("should fail: wrong Rule", async function () {
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.be.revertedWithCustomError(stakingInstance, "StakingRuleNotExist");
    });

    it("should edit Rule", async function () {
      const stakingInstance = await factory();
      const erc721RandomInstance = await erc721Factory("ERC721BlacklistDiscreteRentableRandom");

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721RandomInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[]],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.updateRule(1, false);
      await expect(tx1).to.emit(stakingInstance, "RuleUpdated").withArgs(1, false);
    });

    it("should update Rule", async function () {
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.updateRule(1, false);
      await expect(tx1).to.emit(stakingInstance, "RuleUpdated").withArgs(1, false);
    });

    it("should fail2: account is missing role", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.connect(receiver).updateRule(1, false);
      await expect(tx1)
        .to.be.revertedWithCustomError(stakingInstance, "AccessControlUnauthorizedAccount")
        .withArgs(receiver.address, DEFAULT_ADMIN_ROLE);
    });
  });

  describe("setMaxStake", function () {
    it("should fail for limit exceed", async function () {
      const [_owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721RandomInstance = await erc721Factory("ERC721BlacklistDiscreteRentableRandom");

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721RandomInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty,
          maxStake: 2,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      const stakeRule2: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty,
          maxStake: 1,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule, stakeRule2]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated"); // 2 times?

      // Deposit for rule 1
      const tx1 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx1).to.not.be.reverted;

      const tx11 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx11).to.not.be.reverted;

      // Deposit for rule 2
      const tx12 = stakingInstance.deposit(params2, tokenIds, { value: amount });
      await expect(tx12).to.not.be.reverted;

      const tx2 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingStakeLimitExceed");
    });

    it("should get counters", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721RandomInstance = await erc721Factory("ERC721BlacklistDiscreteRentableRandom");

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721RandomInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty,
          maxStake: 2,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      const stakeRule2: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty,
          maxStake: 2,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule, stakeRule2]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated"); // 2 times?

      // Deposit for rule 1
      const tx1 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx1).to.not.be.reverted;
      // const counter1 = await stakingInstance.getCounters(_owner.address, params.externalId /* rule Id */);
      // expect(counter1).to.have.deep.nested.property("allUsers", 1);
      // expect(counter1).to.have.deep.nested.property("allStakes", 1);
      // expect(counter1).to.have.deep.nested.property("userStakes", 1);
      // expect(counter1).to.have.deep.nested.property("ruleCounter", 1);

      const tx11 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx11).to.not.be.reverted;
      // const counter2 = await stakingInstance.getCounters(_owner.address, params.externalId /* rule Id */);
      // expect(counter2).to.have.deep.nested.property("allUsers", 1);
      // expect(counter2).to.have.deep.nested.property("allStakes", 2);
      // expect(counter2).to.have.deep.nested.property("userStakes", 2);
      // expect(counter2).to.have.deep.nested.property("ruleCounter", 2);

      // Deposit for rule 2
      const tx12 = stakingInstance.deposit(params2, tokenIds, { value: amount });
      await expect(tx12).to.not.be.reverted;
      // const counter3 = await stakingInstance.getCounters(_owner.address, params2.externalId /* rule Id */);
      // expect(counter3).to.have.deep.nested.property("allUsers", 1);
      // expect(counter3).to.have.deep.nested.property("allStakes", 3);
      // expect(counter3).to.have.deep.nested.property("userStakes", 3);
      // expect(counter3).to.have.deep.nested.property("ruleCounter", 1);

      const tx2 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingStakeLimitExceed");

      // Deposit user 2
      const tx3 = stakingInstance.connect(receiver).deposit(params, tokenIds, { value: amount });
      await expect(tx3).to.not.be.reverted;
      // const counter4 = await stakingInstance.getCounters(receiver.address, params2.externalId /* rule Id */);
      // expect(counter4).to.have.deep.nested.property("allUsers", 2);
      // expect(counter4).to.have.deep.nested.property("allStakes", 4);
      // expect(counter4).to.have.deep.nested.property("userStakes", 1);
      // expect(counter4).to.have.deep.nested.property("ruleCounter", 0);

      // const counter5 = await stakingInstance.getCounters(stranger.address, params.externalId /* rule Id */);
      // expect(counter5).to.have.deep.nested.property("allUsers", 2);
      // expect(counter5).to.have.deep.nested.property("allStakes", 4);
      // expect(counter5).to.have.deep.nested.property("userStakes", 0);
      // expect(counter5).to.have.deep.nested.property("ruleCounter", 0);
    });
  });

  describe("deposit", function () {
    it("should fail for not existing rule", async function () {
      const stakingInstance = await factory();

      const tx1 = stakingInstance.deposit(params, tokenIds);
      await expect(tx1).to.be.revertedWithCustomError(stakingInstance, "StakingStakeNotExist");
    });

    it("should fail: StakingRuleNotActive", async function () {
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: false,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx1).to.be.revertedWithCustomError(stakingInstance, "StakingRuleNotActive");
    });

    it("should fail for wrong pay amount", async function () {
      const [owner] = await ethers.getSigners();
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.deposit(params, tokenIds, { value: amount / 2n });
      await expect(tx1)
        .to.be.revertedWithCustomError(stakingInstance, "ETHInsufficientBalance")
        .withArgs(owner, amount / 2n, amount);
    });

    it("should fail for limit exceed", async function () {
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: {
          period,
          penalty,
          maxStake: 1,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx1).to.not.be.reverted;

      const tx2 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingStakeLimitExceed");
    });

    it("should fail when contract is paused", async function () {
      const stakingInstance = await factory();

      await stakingInstance.pause();

      const tx1 = stakingInstance.deposit(params, tokenIds, { value: amount });
      await expect(tx1).to.be.revertedWithCustomError(stakingInstance, "EnforcedPause");
    });

    it("should fail: StakingWrongTemplate", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721Instance.mintCommon(owner.address, templateId);
      await erc721Instance.mintCommon(owner.address, templateId + 1n);
      const balance = await erc721Instance.balanceOf(owner.address);
      expect(balance).to.equal(2);
      expect(await erc721Instance.getRecordFieldValue(1, TEMPLATE_ID)).to.equal(templateId);
      expect(await erc721Instance.getRecordFieldValue(2, TEMPLATE_ID)).to.equal(templateId + 1n);

      // APPROVE
      await erc721Instance.approve(stakingInstance, 1);
      await erc721Instance.approve(stakingInstance, 2);

      // DEPOSIT
      const tx1 = stakingInstance.deposit(params, [2]);
      await expect(tx1).to.be.revertedWithCustomError(stakingInstance, "StakingWrongTemplate");
    });

    it("should deposit with templateId 0", async function () {
      const [owner] = await ethers.getSigners();
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId: 0n,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      await erc721Instance.mintCommon(owner.address, templateId);
      await erc721Instance.approve(stakingInstance, tokenId);

      const tx1 = stakingInstance.deposit(params, tokenIds);
      await expect(tx1).to.not.be.reverted;
    });

    it("should deposit with referral", async function () {
      const [_owner, receiver] = await ethers.getSigners();
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.deposit({ ...params, referrer: receiver.address }, tokenIds, { value: amount });
      // await expect(tx1).to.not.be.reverted;
      await expect(tx1)
        .to.emit(stakingInstance, "ReferralEvent")
        .withArgs(
          _owner.address,
          receiver.address,
          isEqualEventArgArrObj({
            tokenType: 0n, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          }),
        );
    });

    it("should deposit without referral", async function () {
      const [_owner, _receiver] = await ethers.getSigners();
      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      const tx1 = stakingInstance.deposit({ ...params, referrer: ZeroAddress }, tokenIds, { value: amount });

      await expect(tx1).not.to.emit(stakingInstance, "ReferralEvent");
    });
  });

  describe("receiveReward", function () {
    it("should fail for wrong staking id", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.connect(receiver).deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, receiver.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([receiver, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );
      const tx2 = stakingInstance.connect(receiver).receiveReward(2, true, true);
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingStakeNotExist");
    });

    it("should fail for not an owner", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.connect(receiver).deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, receiver.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([receiver, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );
      const tx2 = stakingInstance.receiveReward(1, true, true);
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingNotAnOwner");
    });

    it("should fail: StakingDepositAlreadyWithdrawn", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.connect(receiver).deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, receiver.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([receiver, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.connect(receiver).receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, receiver.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, receiver.address, endTimestamp, cycles);
      await expect(tx2).to.changeEtherBalance(receiver, amount * BigInt(cycles) + amount);

      const tx3 = stakingInstance.connect(receiver).receiveReward(1, true, true);
      await expect(tx3).to.be.revertedWithCustomError(stakingInstance, "StakingDepositAlreadyWithdrawn");
    });

    it("should fail staking not yet finished (reccurent)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721Instance.mintCommon(owner.address, templateId);
      await erc721Instance.mintCommon(owner.address, templateId + 1n);
      const balance = await erc721Instance.balanceOf(owner.address);
      expect(balance).to.equal(2);
      expect(await erc721Instance.getRecordFieldValue(1, TEMPLATE_ID)).to.equal(templateId);
      expect(await erc721Instance.getRecordFieldValue(2, TEMPLATE_ID)).to.equal(templateId + 1n);

      // APPROVE
      await erc721Instance.approve(stakingInstance, 1);
      await erc721Instance.approve(stakingInstance, 2);

      // DEPOSIT
      const tx1 = stakingInstance.deposit(params, [2], { value: amount });
      await expect(tx1).to.be.revertedWithCustomError(stakingInstance, "StakingWrongTemplate");
    });

    it("should fail: staking not yet finished (non-recurrent)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      // REWARD

      const tx2 = stakingInstance.receiveReward(1, false, false);
      // await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [0, 0]);
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingDepositNotComplete");
    });

    it("should fail first period not yet finished", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      // REWARD

      const tx2 = stakingInstance.receiveReward(1, false, false);
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingDepositNotComplete");
    });

    it("should fail when contract is paused", async function () {
      const stakingInstance = await factory();

      await stakingInstance.pause();

      const tx1 = stakingInstance.receiveReward(1, true, true);
      await expect(tx1).to.be.revertedWithCustomError(stakingInstance, "EnforcedPause");
    });

    it("should automatically withdraw with reward (not recurrent)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty: 5000, // 50%
          maxStake,
          recurrent: false,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period + 1);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, false, false);
      const endTimestamp: number = await time.latest();

      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount * 2n, -amount * 2n]);
    });
  });

  describe("Permutations", function () {
    it("should stake NATIVE & receive NOTHING", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD NOTHING
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles);
    });

    it("should stake NATIVE & receive NATIVE", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles);
      await expect(tx2).to.changeEtherBalances(
        [owner, stakingInstance],
        [amount * BigInt(cycles) + amount, -amount * BigInt(cycles) - amount],
      );
    });

    it("should stake NATIVE & receive NATIVE (not recurrent)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId: 0n,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId: 0n,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: false,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIdsZero, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIdsZero);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId: 0,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, 1);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount + amount, -amount - amount]);
    });

    it("should stake NATIVE & receive NATIVE (recurrent)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // FUND REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      // TIME 1
      const current1 = await time.latestBlock();
      await time.advanceBlockTo(current1 + period + 1);

      // REWARD 1
      const tx2 = await stakingInstance.receiveReward(1, false, false);
      const endTimestamp: number = await time.latest();

      await expect(tx2).to.emit(stakingInstance, "DepositFinish").withArgs(1, owner.address, endTimestamp, 1);

      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      // TIME 2
      const current2 = await time.latestBlock();
      await time.advanceBlockTo(current2 + period + 1);

      // REWARD 2
      const tx3 = await stakingInstance.receiveReward(1, false, false);
      const endTimestamp2: number = await time.latest();
      await expect(tx3).to.emit(stakingInstance, "DepositFinish").withArgs(1, owner.address, endTimestamp2, 1);
      await expect(tx3).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      // REWARD 3
      const tx4 = await stakingInstance.receiveReward(1, false, true);
      const endTimestamp3: number = await time.latest();
      await expect(tx4).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp3);
      await expect(tx4).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      // const stake = await stakingInstance.getStake(1);
      // expect(stake).to.have.deep.nested.property("cycles", 2);
      // expect(stake).to.have.deep.nested.property("activeDeposit", false);
    });

    it("should stake NATIVE & receive NATIVE & DEPOSIT without penalty (recurrent)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // const stake0 = await stakingInstance.getStake(1);
      // expect(stake0).to.have.deep.nested.property("cycles", 0);
      // expect(stake0).to.have.deep.nested.property("activeDeposit", true);
      // expect(stake0.deposit[0]).to.include.deep.nested.property("amount", amount);

      const penalty0 = await stakingInstance.getPenalty(ZeroAddress, 1);
      expect(penalty0).to.equal(0);

      // FUND REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      // TIME 1
      const current1 = await time.latestBlock();
      await time.advanceBlockTo(current1 + period + 1);

      // REWARD 1
      const tx2 = await stakingInstance.receiveReward(1, false, false);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositFinish").withArgs(1, owner.address, endTimestamp, 1);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      // const stake1 = await stakingInstance.getStake(1);
      // expect(stake1).to.have.deep.nested.property("cycles", 1);
      // expect(stake1).to.have.deep.nested.property("activeDeposit", true);
      // expect(stake1.deposit[0]).to.have.deep.nested.property("amount", amount);

      const penalty1 = await stakingInstance.getPenalty(ZeroAddress, 1);
      expect(penalty1).to.equal(0);

      // REWARD 2
      const tx3 = stakingInstance.receiveReward(1, true, false);

      await expect(tx3)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp + 1);
      await expect(tx3).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      // const stake2 = await stakingInstance.getStake(1);
      // expect(stake2).to.have.deep.nested.property("cycles", 1);
      // expect(stake2).to.have.deep.nested.property("activeDeposit", false);
      // expect(stake2.deposit[0]).to.have.deep.nested.property("amount", 0);

      const penalty2 = await stakingInstance.getPenalty(ZeroAddress, 1);
      expect(penalty2).to.equal(0);
    });

    it("should stake NATIVE & receive ERC20", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const balance1 = await erc20Instance.balanceOf(stakingInstance);
      expect(balance1).to.equal(amount * BigInt(cycles));

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount * BigInt(cycles));
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(amount * BigInt(cycles));
    });

    it("should stake NATIVE & receive ERC721 Common", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, tokenId);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      const balance = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance).to.equal(cycles);
    });

    it("should stake NATIVE & receive ERC1155", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc1155Instance = await erc1155Factory();

      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty,
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, ZeroAddress, owner.address, tokenId, amount * BigInt(cycles));
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      const balance = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance).to.equal(amount * BigInt(cycles));
    });

    it("should stake ERC20 & receive NATIVE", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, tokenIds)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x");

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles);
      await expect(tx2).to.changeEtherBalances(
        [owner, stakingInstance],
        [amount * BigInt(cycles), -amount * BigInt(cycles)],
      );

      const balance3 = await erc20Instance.balanceOf(owner.address);
      expect(balance3).to.equal(amount);
    });

    it("should stake ERC20 & receive ERC20", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, tokenIds)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x");

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount * BigInt(cycles));

      const balance3 = await erc20Instance.balanceOf(owner.address);
      expect(balance3).to.equal(amount * BigInt(cycles) + amount);
    });

    it("should stake ERC20 & receive ERC721 Common", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, tokenIds)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x");

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, tokenId);

      const balance3 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance3).to.equal(cycles);
      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(amount);
    });

    it("should stake MIXED (ERC20 + NATIVE) & receive MIXED REWARD (ERC721 Common + ERC721 Common)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [
          [],
          [
            {
              tokenType: 2, // ERC721
              token: erc721SimpleInstance,
              tokenId,
              amount: 1n,
            },
          ],
        ],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      const tx1 = await stakingInstance.deposit(params, [0, 0], { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, [0, 0])
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x");
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, tokenId)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      const balance3 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance3).to.equal(cycles);
      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(amount /* deposit */);
    });

    it("should stake MIXED (ERC20 + NATIVE) & receive ADVANCE MIXED REWARD (ERC721 Common + ERC721 Common)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[], []],
        terms: {
          period,
          penalty,
          maxStake,
          recurrent: true,
          advance: true,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      const tx1 = await stakingInstance.deposit(params, [0, 0], { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, [0, 0])
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x")
        // ADVANCE REWARD
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, startTimestamp, 1)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, tokenId);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TRY TO RECEIVE REWARD WITH NO TIME PASSED
      const tx2 = stakingInstance.receiveReward(1, false, false);
      await expect(tx2).to.be.revertedWithCustomError(stakingInstance, "StakingDepositNotComplete");

      // TIME 1 CYCLE
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * 1);

      // GET SECOND ADVANCE REWARD
      const tx22 = await stakingInstance.receiveReward(1, false, false);
      const endTimestamp: number = await time.latest();

      await expect(tx22)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, 1n)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, tokenId + 1n);

      // TIME 0.5 CYCLE
      const current1 = await time.latestBlock();
      await time.advanceBlockTo(current1 + period / 2);

      // TRY TO RECEIVE REWARD WITH NOT ENOUGH TIME PASSED
      const tx3 = stakingInstance.receiveReward(1, false, false);
      await expect(tx3).to.be.revertedWithCustomError(stakingInstance, "StakingDepositNotComplete");

      // breakLastPeriod = RETURN DEPOSIT
      const tx33 = await stakingInstance.receiveReward(1, false, true);
      const endTimestamp1: number = await time.latest();
      await expect(tx33)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp1)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount)
        // do not receive reward
        .not.to.emit(stakingInstance, "DepositFinish")
        .not.to.emit(erc721SimpleInstance, "Transfer");
      await expect(tx33).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      const balance3 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance3).to.equal(cycles);
      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(amount /* deposit */);
    });

    it("should stake ERC20 & receive ERC1155", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc1155Instance = await erc1155Factory();

      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, tokenIds)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x");

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, ZeroAddress, owner.address, tokenId, amount * BigInt(cycles));

      const balance3 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance3).to.equal(amount * BigInt(cycles));
      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(amount);
    });

    it("should stake ERC721 & receive NATIVE", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();

      await erc721Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc721Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc721Instance.approve(stakingInstance, tokenId);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc721Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles);
      await expect(tx2).to.changeEtherBalances(
        [owner, stakingInstance],
        [amount * BigInt(cycles), -amount * BigInt(cycles)],
      );

      const balance3 = await erc721Instance.balanceOf(owner.address);
      expect(balance3).to.equal(1);
    });

    it("should stake ERC721 & receive ERC20", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc721Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc721Instance.approve(stakingInstance, tokenId);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc721Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount * BigInt(cycles));

      const balance3 = await erc20Instance.balanceOf(owner.address);
      expect(balance3).to.equal(amount * BigInt(cycles));
      const balance4 = await erc721Instance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake any ERC721 & receive ERC20", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721Instance = await erc721Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId: 0n, // any template
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721Instance.mintCommon(owner.address, templateId);
      await erc721Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc721Instance.balanceOf(owner.address);
      expect(balance1).to.equal(2);
      await erc721Instance.approve(stakingInstance, 2);

      const tx1 = await stakingInstance.deposit(params, [2]);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, [2])
        .to.emit(erc721Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, 2);

      const balance2 = await erc721Instance.balanceOf(owner.address);
      expect(balance2).to.equal(1);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount * BigInt(cycles));

      const balance3 = await erc20Instance.balanceOf(owner.address);
      expect(balance3).to.equal(amount * BigInt(cycles));
      const balance4 = await erc721Instance.balanceOf(owner.address);
      expect(balance4).to.equal(2);
    });

    it("should stake ERC721 & receive ERC721 Common", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc721RandomInstance = await erc721Factory("ERC721Random");

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721RandomInstance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721RandomInstance.mintCommon(owner.address, templateId);
      const balance1 = await erc721RandomInstance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc721RandomInstance.approve(stakingInstance, tokenId);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc721RandomInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc721RandomInstance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, tokenId);

      const balance3 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance3).to.equal(cycles);
      const balance4 = await erc721RandomInstance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake ERC721 & receive ERC1155", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721Instance = await erc721Factory();
      const erc1155Instance = await erc1155Factory();

      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc721Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc721Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc721Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, ZeroAddress, owner.address, tokenId, amount * BigInt(cycles));

      const balance3 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance3).to.equal(amount * BigInt(cycles));
      const balance4 = await erc721Instance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake ERC998 & receive NATIVE", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc998Instance = await erc721Factory("ERC998Simple");

      await erc998Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc998Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc998Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc998Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc998Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc998Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles);
      await expect(tx2).to.changeEtherBalances(
        [owner, stakingInstance],
        [amount * BigInt(cycles), -amount * BigInt(cycles)],
      );

      const balance3 = await erc998Instance.balanceOf(owner.address);
      expect(balance3).to.equal(1);
    });

    it("should stake ERC998 & receive ERC20", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc998Instance = await erc721Factory("ERC998Simple");

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc998Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc998Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc998Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc998Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc998Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount * BigInt(cycles));

      const balance3 = await erc20Instance.balanceOf(owner.address);
      expect(balance3).to.equal(amount * BigInt(cycles));
      const balance4 = await erc998Instance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake ERC998 & receive ERC721 Common", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc998Instance = await erc721Factory("ERC998Simple");

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc998Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc998Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc998Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc998Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc998Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, tokenId);

      const balance3 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance3).to.equal(cycles);
      const balance4 = await erc998Instance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake ERC998 & receive ERC998 Common", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc998Instance = await erc721Factory("ERC998Simple");

      await erc998Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc998Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc998Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc998Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc998Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc998Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles);

      const balance3 = await erc998Instance.balanceOf(owner.address);
      expect(balance3).to.equal(cycles + 1);
    });

    it("should stake ERC998 & receive ERC1155", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc998Instance = await erc721Factory("ERC998Simple");
      const erc1155Instance = await erc1155Factory();

      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc998Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc998Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc998Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc998Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc998Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, ZeroAddress, owner.address, tokenId, amount * BigInt(cycles));

      const balance3 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance3).to.equal(amount * BigInt(cycles));
      const balance4 = await erc998Instance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake ERC1155 & receive NATIVE", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc1155Instance = await erc1155Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance1 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance1).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);

      const balance2 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles);
      await expect(tx2).to.changeEtherBalances(
        [owner, stakingInstance],
        [amount * BigInt(cycles), -amount * BigInt(cycles)],
      );

      const balance3 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance3).to.equal(amount);
    });

    it("should stake ERC1155 & receive ERC20", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc1155Instance = await erc1155Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance1 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance1).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);

      const balance2 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount * BigInt(cycles));

      const balance3 = await erc20Instance.balanceOf(owner.address);
      expect(balance3).to.equal(amount * BigInt(cycles));
      const balance4 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance4).to.equal(amount);
    });

    it("should stake ERC1155 & receive ERC721 Common", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc1155Instance = await erc1155Factory();

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance1 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance1).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);

      const balance2 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, 1)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(ZeroAddress, owner.address, 2);

      const balance3 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance3).to.equal(cycles);
      const balance4 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance4).to.equal(amount);
    });

    it("should stake ERC1155 & receive ERC1155", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc1155Instance = await erc1155Factory();

      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: { period, penalty, maxStake, recurrent: true, advance: false },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance1 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance1).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);

      const balance2 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance2).to.equal(0);

      // TIME
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, stakingInstance, owner.address, tokenId, amount)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, ZeroAddress, owner.address, tokenId, amount * BigInt(cycles));

      const balance3 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance3).to.equal(amount * BigInt(cycles) + amount);
    });
  });

  describe("Permutations with penalty", function () {
    it("should stake NATIVE & receive DEPOSIT with 50% penalty", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period, // 60 sec
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME

      // REWARD
      await stakingInstance.topUp(
        [
          {
            tokenType: 0,
            token: ZeroAddress,
            tokenId,
            amount: amount * BigInt(cycles),
          },
        ],
        { value: amount * BigInt(cycles) },
      );

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();

      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount / 2n, -amount / 2n]);
    });

    it("should stake ERC20 & receive DEPOSIT with 50% penalty", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, tokenIds)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x");

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME
      // REWARD

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);
      await expect(tx2)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount / 2n);

      const balance3 = await erc20Instance.balanceOf(owner.address);
      expect(balance3).to.equal(amount / 2n);
    });

    it("should stake ERC721 & receive DEPOSIT with 0% penalty", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId: 2n,
            amount: 1n,
          },
        ],
        content: [],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721SimpleInstance.mintCommon(owner.address, templateId);
      const balance1 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc721SimpleInstance.approve(stakingInstance, tokenId);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);
      await expect(tx2).to.emit(erc721SimpleInstance, "Transfer").withArgs(stakingInstance, owner.address, tokenId);

      const balance4 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake ERC721 & DO NOT receive DEPOSIT ( 100% penalty )", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId: 2n,
            amount: 1n,
          },
        ],
        content: [],
        terms: {
          period,
          penalty: 10000, // 100%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc721SimpleInstance.mintCommon(owner.address, templateId);
      const balance1 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc721SimpleInstance.approve(stakingInstance, tokenId);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

      const balance4 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance4).to.equal(0);
    });

    it("should stake ERC998 & receive DEPOSIT with 0% penalty", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc998Instance = await erc721Factory("ERC998Simple");

      await erc998Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId: 2n,
            amount: 1n,
          },
        ],
        content: [],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc998Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc998Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc998Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc998Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc998Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);
      await expect(tx2).to.emit(erc998Instance, "Transfer").withArgs(stakingInstance, owner.address, tokenId);

      const balance4 = await erc998Instance.balanceOf(owner.address);
      expect(balance4).to.equal(1);
    });

    it("should stake ERC998 & DO NOT receive DEPOSIT ( 100% penalty )", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc998Instance = await erc721Factory("ERC998Simple");

      await erc998Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId,
            amount: 1n,
          },
        ],
        reward: [
          {
            tokenType: 3, // ERC998
            token: erc998Instance,
            tokenId: 2n,
            amount: 1n,
          },
        ],
        content: [],
        terms: {
          period,
          penalty: 10000, // 100%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc998Instance.mintCommon(owner.address, templateId);
      const balance1 = await erc998Instance.balanceOf(owner.address);
      expect(balance1).to.equal(1);
      await erc998Instance.approve(stakingInstance, 1);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc998Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId);

      const balance2 = await erc998Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);

      // TIME

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

      const balance4 = await erc998Instance.balanceOf(owner.address);
      expect(balance4).to.equal(0);
    });

    it("should stake ERC1155 & receive DEPOSIT with 50% penalty", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc1155Instance = await erc1155Factory();

      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        content: [],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance1 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance1).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, tokenIds);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIds)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);

      const balance2 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance2).to.equal(0);

      // TIME

      // REWARD
      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

      await expect(tx2)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, stakingInstance, owner.address, tokenId, amount / 2n);

      const balance3 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance3).to.equal(amount / 2n);
    });

    it("should stake MIXED (NATIVE + ERC20 + ERC721 + ERC1155) & receive MIXED DEPOSIT with 50% penalty (ERC721 0% penalty)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc1155Instance = await erc1155Factory();

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);
      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[], [], [], []],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      await erc721SimpleInstance.mintCommon(owner.address, templateId);
      const balance11 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance11).to.equal(1);
      await erc721SimpleInstance.approve(stakingInstance, tokenId);

      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance12 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance12).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, [0, 0, 1, 1], { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, [0, 0, 1, 1])
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x")
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);
      const balance21 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance21).to.equal(0);
      const balance22 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance22).to.equal(0);

      // TIME
      // REWARD

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount / 2n)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(stakingInstance, owner.address, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, stakingInstance, owner.address, tokenId, amount / 2n);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount / 2n, -amount / 2n]);

      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(amount / 2n /* deposit */);
      const balance41 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance41).to.equal(1);
      const balance42 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance42).to.equal(amount / 2n);
    });

    it("should stake MIXED (NATIVE + ERC20 + ERC721 + ERC1155) & receive MIXED DEPOSIT with 100% penalty", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc1155Instance = await erc1155Factory();

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);
      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[], [], [], []],
        terms: {
          period,
          penalty: 10000, // 100%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      await erc721SimpleInstance.mintCommon(owner.address, templateId);
      const balance11 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance11).to.equal(1);
      await erc721SimpleInstance.approve(stakingInstance, tokenId);

      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance12 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance12).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, [0, 0, 1, 1], { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, [0, 0, 1, 1])
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x")
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);
      const balance21 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance21).to.equal(0);
      const balance22 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance22).to.equal(0);

      // TIME
      // REWARD

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(0);
      const balance41 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance41).to.equal(0);
      const balance42 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance42).to.equal(0);
    });
  });

  describe("Withdraw penalty", function () {
    it("should stake mixed (NATIVE + ERC20 + ERC721 + ERC1155) & withdraw 50 % mixed PENALTIES (ERC721 0% penalty)", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc1155Instance = await erc1155Factory();

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);
      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[], [], [], []],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      await erc721SimpleInstance.mintCommon(owner.address, templateId);
      const balance11 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance11).to.equal(1);
      await erc721SimpleInstance.approve(stakingInstance, tokenId);

      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance12 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance12).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, [0, 0, 1, 1], { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, [0, 0, 1, 1])
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x")
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);
      const balance21 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance21).to.equal(0);
      const balance22 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance22).to.equal(0);

      // TIME
      // REWARD

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount / 2n)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(stakingInstance, owner.address, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, stakingInstance, owner.address, tokenId, amount / 2n)
        .to.emit(stakingInstance, "DepositPenalty")
        .withArgs(1, [0, ZeroAddress, 0, amount / 2n])
        .to.emit(stakingInstance, "DepositPenalty")
        .withArgs(1, [1, erc20Instance, 0, amount / 2n])
        .to.emit(stakingInstance, "DepositPenalty")
        .withArgs(1, [4, erc1155Instance, tokenId, amount / 2n]);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount / 2n, -amount / 2n]);

      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(amount / 2n /* deposit */);
      const balance41 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance41).to.equal(1);
      const balance42 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance42).to.equal(amount / 2n);

      // WITHDRAW PENALTY

      const tx3 = stakingInstance.withdrawBalance({
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount,
      });
      await expect(tx3)
        .to.emit(stakingInstance, "BalanceWithdraw")
        .withArgs(owner.address, [0, ZeroAddress, 0, amount / 2n]);
      await expect(tx3).to.changeEtherBalances([owner, stakingInstance], [amount / 2n, -amount / 2n]);

      const tx4 = stakingInstance.withdrawBalance({
        tokenType: 1,
        token: erc20Instance,
        tokenId: 0,
        amount,
      });
      await expect(tx4)
        .to.emit(stakingInstance, "BalanceWithdraw")
        .withArgs(owner.address, [1, erc20Instance, 0, amount / 2n]);

      const tx5 = stakingInstance.withdrawBalance({
        tokenType: 2,
        token: erc721SimpleInstance,
        tokenId,
        amount,
      });
      await expect(tx5).to.be.revertedWithCustomError(stakingInstance, "StakingZeroBalance");

      const tx6 = stakingInstance.withdrawBalance({
        tokenType: 4,
        token: erc1155Instance,
        tokenId,
        amount,
      });
      await expect(tx6)
        .to.emit(stakingInstance, "BalanceWithdraw")
        .withArgs(owner.address, [4, erc1155Instance, tokenId, amount / 2n])
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, stakingInstance, owner.address, tokenId, amount / 2n);
    });

    it("should stake mixed (NATIVE + ERC20 + ERC721 + ERC1155) & withdraw 100 % mixed PENALTIES", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc1155Instance = await erc1155Factory();

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);
      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
        ],
        content: [[], [], [], []],
        terms: {
          period,
          penalty: 10000, // 100%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");
      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      await erc721SimpleInstance.mintCommon(owner.address, templateId);
      const balance11 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance11).to.equal(1);
      await erc721SimpleInstance.approve(stakingInstance, tokenId);

      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance12 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance12).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, [0, 0, 1, 1], { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, [0, 0, 1, 1])
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x")
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);
      const balance21 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance21).to.equal(0);
      const balance22 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance22).to.equal(0);

      // TIME

      // REWARD
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositPenalty")
        .withArgs(1, [0, ZeroAddress, 0, amount])
        .to.emit(stakingInstance, "DepositPenalty")
        .withArgs(1, [1, erc20Instance, 0, amount])
        .to.emit(stakingInstance, "DepositPenalty")
        .withArgs(1, [2, erc721SimpleInstance, tokenId, 1])
        .to.emit(stakingInstance, "DepositPenalty")
        .withArgs(1, [4, erc1155Instance, tokenId, amount]);

      const balance4 = await erc20Instance.balanceOf(owner.address);
      expect(balance4).to.equal(0);
      const balance41 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance41).to.equal(0);
      const balance42 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance42).to.equal(0);

      // const stake = await stakingInstance.getStake(1);
      // expect(stake).to.have.deep.nested.property("cycles", 0);
      // expect(stake).to.have.deep.nested.property("activeDeposit", false);

      // WITHDRAW PENALTY
      const tx3 = stakingInstance.withdrawBalance({
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount,
      });
      await expect(tx3)
        .to.emit(stakingInstance, "BalanceWithdraw")
        .withArgs(owner.address, [0, ZeroAddress, 0, amount]);
      await expect(tx3).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);

      const tx4 = stakingInstance.withdrawBalance({
        tokenType: 1,
        token: erc20Instance,
        tokenId: 0,
        amount,
      });
      await expect(tx4)
        .to.emit(stakingInstance, "BalanceWithdraw")
        .withArgs(owner.address, [1, erc20Instance, 0, amount]);

      const tx5 = stakingInstance.withdrawBalance({
        tokenType: 2,
        token: erc721SimpleInstance,
        tokenId,
        amount,
      });

      await expect(tx5).to.emit(erc721SimpleInstance, "Transfer").withArgs(stakingInstance, owner.address, tokenId);

      const tx6 = stakingInstance.withdrawBalance({
        tokenType: 4,
        token: erc1155Instance,
        tokenId,
        amount,
      });
      await expect(tx6)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, stakingInstance, owner.address, tokenId, amount);
    });

    it("should stake and withdraw penalty", async function () {
      const [owner, receiver] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();

      // SET RULE 1
      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE 1
      await erc20Instance.mint(receiver.address, amount);
      const balance1 = await erc20Instance.balanceOf(receiver.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.connect(receiver).approve(stakingInstance, amount);

      // DEPOSIT 1
      const tx1 = await stakingInstance.connect(receiver).deposit(params, tokenIdsZero);
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, receiver.address, startTimestamp, tokenIdsZero)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(receiver.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, receiver.address, amount, "0x");

      const balance2 = await erc20Instance.balanceOf(receiver.address);
      expect(balance2).to.equal(0);

      // SET RULE 2
      const stakeRule1: IStakingRule = {
        deposit: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty: 10000, // 100%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };
      const tx10 = stakingInstance.setRules([stakeRule1]);
      await expect(tx10).to.emit(stakingInstance, "RuleCreated");

      // STAKE 2
      await erc20Instance.mint(owner.address, amount);
      const balance10 = await erc20Instance.balanceOf(owner.address);
      expect(balance10).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      // TIME 1
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // DEPOSIT 2
      const tx11 = await stakingInstance.deposit(
        {
          nonce,
          externalId: 2, // ruleId
          expiresAt,
          receiver: ZeroAddress,
          referrer: ZeroAddress,
          extra: ZeroHash,
        },
        tokenIdsZero,
      );
      const startTimestamp1: number = await time.latest();
      await expect(tx11)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(2, 2, owner.address, startTimestamp1, tokenIdsZero)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x");

      const balance21 = await erc20Instance.balanceOf(owner.address);
      expect(balance21).to.equal(0);

      // REWARD 1
      await erc20Instance.mint(owner.address, amount * BigInt(cycles));
      await erc20Instance.approve(stakingInstance, amount * BigInt(cycles));
      await stakingInstance.topUp([
        {
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount: amount * BigInt(cycles),
        },
      ]);

      const tx21 = await stakingInstance.connect(receiver).receiveReward(1, true, true);
      const endTimestamp1: number = await time.latest();
      await expect(tx21)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, receiver.address, endTimestamp1)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, receiver.address, endTimestamp1, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, receiver.address, amount * BigInt(cycles));

      const balance3 = await erc20Instance.balanceOf(receiver.address);
      expect(balance3).to.equal(amount * BigInt(cycles) + amount);

      // REWARD 2

      const tx22 = await stakingInstance.receiveReward(2, true, true);
      const endTimestamp2: number = await time.latest();
      await expect(tx22).to.emit(stakingInstance, "DepositWithdraw").withArgs(2, owner.address, endTimestamp2);

      const balance32 = await erc20Instance.balanceOf(owner.address);
      expect(balance32).to.equal(0);

      const penalty = await stakingInstance.getPenalty(erc20Instance, 0);
      expect(penalty).to.equal(amount);

      const stakingBalance = await erc20Instance.balanceOf(stakingInstance);
      expect(stakingBalance).to.equal(amount);
      const depositBalance = await stakingInstance.getDepositBalance(erc20Instance);
      expect(depositBalance).to.equal(0);
    });

    it("should fail withdraw: zero balance", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const tx0 = stakingInstance.withdrawBalance({
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount,
      });
      await expect(tx0).to.be.revertedWithCustomError(stakingInstance, "StakingZeroBalance");

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId: 0n,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId: 0n,
            amount,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIdsZero, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIdsZero);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      // REWARD

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount / 2n, -amount / 2n]);

      // WITHDRAW PENALTY
      const tx3 = stakingInstance.withdrawBalance({
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount,
      });
      await expect(tx3)
        .to.emit(stakingInstance, "BalanceWithdraw")
        .withArgs(owner.address, [0, ZeroAddress, 0, amount / 2n]);
      await expect(tx3).to.changeEtherBalances([owner, stakingInstance], [amount / 2n, -amount / 2n]);

      const tx4 = stakingInstance.withdrawBalance({
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount,
      });
      await expect(tx4).to.be.revertedWithCustomError(stakingInstance, "StakingZeroBalance");
    });

    it("should fail withdraw: UnsupportedTokenType", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId: 0n,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId: 0n,
            amount,
          },
        ],
        content: [[]],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      const tx1 = await stakingInstance.deposit(params, tokenIdsZero, { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, tokenId, owner.address, startTimestamp, tokenIdsZero);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      // TIME
      // REWARD

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount / 2n, -amount / 2n]);

      // WITHDRAW PENALTY
      const tx3 = stakingInstance.withdrawBalance({
        tokenType: 1,
        token: ZeroAddress,
        tokenId,
        amount,
      });
      await expect(tx3).to.be.reverted;
    });

    it("should fail for wrong role", async function () {
      const [_owner, receiver] = await ethers.getSigners();

      const stakingInstance = await factory();

      // WITHDRAW PENALTY
      const tx = stakingInstance.connect(receiver).withdrawBalance({
        tokenType: 0,
        token: ZeroAddress,
        tokenId: 0,
        amount,
      });
      await expect(tx)
        .to.be.revertedWithCustomError(stakingInstance, "AccessControlUnauthorizedAccount")
        .withArgs(receiver.address, DEFAULT_ADMIN_ROLE);
    });
  });

  describe("Return Deposit", function () {
    it("should stake mixed (NATIVE + ERC20 + ERC721 + ERC1155) & withdraw 100 % deposit without penalty", async function () {
      const [owner] = await ethers.getSigners();

      const stakingInstance = await factory();
      const erc20Instance = await erc20Factory();
      const erc721SimpleInstance = await erc721Factory("ERC721Simple");
      const erc1155Instance = await erc1155Factory();

      await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);
      await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

      const stakeRule: IStakingRule = {
        deposit: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
          {
            tokenType: 2, // ERC721
            token: erc721SimpleInstance,
            tokenId,
            amount: 1n,
          },
          {
            tokenType: 4, // ERC1155
            token: erc1155Instance,
            tokenId,
            amount,
          },
        ],
        reward: [
          {
            tokenType: 0, // NATIVE
            token: ZeroAddress,
            tokenId,
            amount,
          },
          {
            tokenType: 1, // ERC20
            token: erc20Instance,
            tokenId,
            amount,
          },
        ],
        content: [[], [], [], []],
        terms: {
          period,
          penalty: 5000, // 50%
          maxStake,
          recurrent: true,
          advance: false,
        },
        active: true,
      };

      // SET RULE
      const tx = stakingInstance.setRules([stakeRule]);
      await expect(tx).to.emit(stakingInstance, "RuleCreated");

      // STAKE
      await erc20Instance.mint(owner.address, amount);
      const balance1 = await erc20Instance.balanceOf(owner.address);
      expect(balance1).to.equal(amount);
      await erc20Instance.approve(stakingInstance, amount);

      await erc721SimpleInstance.mintCommon(owner.address, templateId);
      const balance11 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance11).to.equal(1);
      await erc721SimpleInstance.approve(stakingInstance, 1);

      await erc1155Instance.mint(owner.address, 1, amount, "0x");
      const balance12 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance12).to.equal(amount);
      await erc1155Instance.setApprovalForAll(stakingInstance, true);

      const tx1 = await stakingInstance.deposit(params, [0, 0, 1, 1], { value: amount });
      const startTimestamp: number = await time.latest();
      await expect(tx1)
        .to.emit(stakingInstance, "DepositStart")
        .withArgs(1, 1, owner.address, startTimestamp, [0, 0, 1, 1])
        .to.emit(stakingInstance, "TransferReceived")
        .withArgs(stakingInstance, owner.address, amount, "0x")
        .to.emit(erc20Instance, "Transfer")
        .withArgs(owner.address, stakingInstance, amount)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(owner.address, stakingInstance, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, owner.address, stakingInstance, tokenId, amount);
      await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

      const balance2 = await erc20Instance.balanceOf(owner.address);
      expect(balance2).to.equal(0);
      const balance21 = await erc721SimpleInstance.balanceOf(owner.address);
      expect(balance21).to.equal(0);
      const balance22 = await erc1155Instance.balanceOf(owner.address, 1);
      expect(balance22).to.equal(0);

      // TIME 1
      const current = await time.latestBlock();
      await time.advanceBlockTo(current + period * cycles);

      // REWARD

      const tx2 = await stakingInstance.receiveReward(1, true, true);
      const endTimestamp: number = await time.latest();
      await expect(tx2)
        .to.emit(stakingInstance, "DepositReturn")
        .withArgs(1, owner.address)
        .to.emit(stakingInstance, "DepositWithdraw")
        .withArgs(1, owner.address, endTimestamp)
        .to.emit(stakingInstance, "DepositFinish")
        .withArgs(1, owner.address, endTimestamp, cycles)
        .to.emit(erc20Instance, "Transfer")
        .withArgs(stakingInstance, owner.address, amount)
        .to.emit(erc721SimpleInstance, "Transfer")
        .withArgs(stakingInstance, owner.address, tokenId)
        .to.emit(erc1155Instance, "TransferSingle")
        .withArgs(stakingInstance, stakingInstance, owner.address, tokenId, amount);
      await expect(tx2).to.changeEtherBalances([owner, stakingInstance], [amount, -amount]);
    });
  });
});
