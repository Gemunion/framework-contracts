import { expect } from "chai";
import { ethers } from "hardhat";
import { parseEther, ZeroAddress } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { amount, DEFAULT_ADMIN_ROLE, MINTER_ROLE, nonce } from "@ethberry/contracts-constants";

import { expiresAt, extra, templateId, tokenId, tokenIds } from "../../../constants";
import { IStakingRule } from "../interface/staking";
import { deployERC1363 } from "../../../ERC20/shared/fixtures";
import { deployERC721 } from "../../../ERC721/shared/fixtures";
import { deployERC1155 } from "../../../ERC1155/shared/fixtures";

export function shouldHaveReentrancyGuard(factory: () => Promise<any>) {
  const period = 30;
  const cycles = 2n;
  const maxStake = 2;

  const params = {
    nonce,
    externalId: 1,
    expiresAt,
    receiver: ZeroAddress,
    referrer: ZeroAddress,
    extra,
  };

  const erc20Factory = () => deployERC1363("ERC20Simple", { amount: parseEther("200000") });
  const erc721Factory = (name: string) => deployERC721(name);
  const erc1155Factory = () => deployERC1155();

  describe("Reentrancy Guard", function () {
    describe("receiveReward", function () {
      it("should not call twice (NATIVE)", async function () {
        const [owner] = await ethers.getSigners();

        const stakingInstance = await factory();
        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

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
        // const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
        const tx1 = await attakerInstance.deposit(params, tokenIds, { value: amount });
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, tokenId, attakerInstance, startTimestamp, tokenIds);
        await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);
        // return

        // FUND REWARD
        await stakingInstance.topUp(
          [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount: amount * cycles,
            },
          ],
          { value: amount * cycles },
        );

        // TIME 1
        const current1 = await time.latestBlock();
        await time.advanceBlockTo(current1 + period + 1);

        // REWARD 1
        // const tx2 = await stakingInstance.receiveReward(1, false, false);
        const tx2 = await attakerInstance.receiveReward(1, false, false);
        const endTimestamp: number = await time.latest();

        await expect(tx2).to.changeEtherBalances([attakerInstance, stakingInstance], [amount, -amount]);
        await expect(tx2).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx2).to.emit(stakingInstance, "DepositFinish").withArgs(1, attakerInstance, endTimestamp, 1);
      });

      it("should not call twice (ERC20)", async function () {
        const [owner] = await ethers.getSigners();
        const stakingInstance = await factory();
        const erc20Instance = await erc20Factory();

        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

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
        // const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
        const tx1 = await attakerInstance.deposit(params, tokenIds, { value: amount });
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, tokenId, attakerInstance, startTimestamp, tokenIds);
        await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);
        // return

        // FUND REWARD
        await erc20Instance.mint(stakingInstance, amount * cycles);

        // TIME 1
        const current1 = await time.latestBlock();
        await time.advanceBlockTo(current1 + period + 1);

        // REWARD 1
        const tx2 = await attakerInstance.receiveReward(1, false, false);
        const endTimestamp: number = await time.latest();

        await expect(tx2).to.changeTokenBalances(erc20Instance, [attakerInstance, stakingInstance], [amount, -amount]);
        await expect(tx2).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx2).to.emit(stakingInstance, "DepositFinish").withArgs(1, attakerInstance, endTimestamp, 1);
      });

      it("should not call twice (ERC721)", async function () {
        const [owner] = await ethers.getSigners();
        const stakingInstance = await factory();
        const erc721SimpleInstance = await erc721Factory("ERC721Simple");

        await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);

        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

        const stakeRule: IStakingRule = {
          deposit: [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount,
            },
          ],
          reward: [
            {
              tokenType: 2,
              token: erc721SimpleInstance,
              tokenId,
              amount: 1n,
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
        // const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
        const tx1 = await attakerInstance.deposit(params, tokenIds, { value: amount });
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, tokenId, attakerInstance, startTimestamp, tokenIds);
        await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);
        // return

        // FUND REWARD
        await stakingInstance.topUp(
          [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount: amount * cycles,
            },
          ],
          { value: amount * cycles },
        );

        // TIME 1
        const current1 = await time.latestBlock();
        await time.advanceBlockTo(current1 + period + 1);

        // REWARD 1
        const tx2 = await attakerInstance.receiveReward(1, false, false);
        const endTimestamp: number = await time.latest();
        const balance = await erc721SimpleInstance.balanceOf(attakerInstance);

        expect(balance).to.be.equal(1);
        await expect(tx2).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx2).to.emit(stakingInstance, "DepositFinish").withArgs(1, attakerInstance, endTimestamp, 1);

        // await expect(tx2).to.changeEtherBalances([attakerInstance, stakingInstance], [amount, -amount]);
      });

      it("should not call twice (ERC1155)", async function () {
        const [owner] = await ethers.getSigners();
        const stakingInstance = await factory();
        const erc1155Instance = await erc1155Factory();

        await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);

        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

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
              tokenType: 4, // NATIVE
              token: erc1155Instance,
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
        // const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
        const tx1 = await attakerInstance.deposit(params, tokenIds, { value: amount });
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, tokenId, attakerInstance, startTimestamp, tokenIds);
        await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);
        // return

        // FUND REWARD
        await stakingInstance.topUp(
          [
            {
              tokenType: 0,
              token: ZeroAddress,
              tokenId,
              amount: amount * cycles,
            },
          ],
          { value: amount * cycles },
        );

        // TIME 1
        const current1 = await time.latestBlock();
        await time.advanceBlockTo(current1 + period + 1);

        // REWARD 1
        const tx2 = await attakerInstance.receiveReward(1, false, false);
        const endTimestamp: number = await time.latest();
        const balance = await erc1155Instance.balanceOf(attakerInstance, tokenId);

        expect(balance).to.be.equal(amount);
        await expect(tx2).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx2).to.emit(stakingInstance, "DepositFinish").withArgs(1, attakerInstance, endTimestamp, 1);

        // await expect(tx2).to.changeEtherBalances([attakerInstance, stakingInstance], [amount, -amount]);
      });
    });

    describe("withdraw", function () {
      it("should not call twice (NATIVE)", async function () {
        const [owner, receiver] = await ethers.getSigners();

        const stakingInstance = await factory();
        const erc721SimpleInstance = await erc721Factory("ERC721Simple");
        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

        await erc721SimpleInstance.grantRole(MINTER_ROLE, stakingInstance);
        await stakingInstance.grantRole(DEFAULT_ADMIN_ROLE, attakerInstance);

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
              amount: 0n,
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

        const tx1 = await stakingInstance.deposit(params, tokenIds, { value: amount });
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, 1, owner.address, startTimestamp, tokenIds);
        await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

        const tx2 = await stakingInstance.connect(receiver).deposit(params, tokenIds, { value: amount });
        const startTimestamp2: number = await time.latest();
        await expect(tx2)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(2, 1, receiver.address, startTimestamp2, tokenIds);
        await expect(tx1).to.changeEtherBalances([owner, stakingInstance], [-amount, amount]);

        // TIME

        // REWARD

        const tx3 = await stakingInstance.receiveReward(1, true, true);
        const endTimestamp: number = await time.latest();
        await expect(tx3).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

        // const stake = await stakingInstance.getStake(1);
        // expect(stake).to.have.deep.nested.property("cycles", 0);
        // expect(stake).to.have.deep.nested.property("activeDeposit", false);

        // WITHDRAW PENALTY
        const tx4 = attakerInstance.withdrawBalance({
          tokenType: 0,
          token: ZeroAddress,
          tokenId,
          amount,
        });

        await expect(tx4).to.changeEtherBalances([attakerInstance, stakingInstance], [amount / 2n, -amount / 2n]);
        await expect(tx4).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx4)
          .to.emit(stakingInstance, "BalanceWithdraw")
          .withArgs(attakerInstance, [0, ZeroAddress, tokenId, amount / 2n]);
      });

      it("should not call twice (ERC20)", async function () {
        const [owner, receiver] = await ethers.getSigners();

        const stakingInstance = await factory();
        const erc20Instance = await erc20Factory();
        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

        await stakingInstance.grantRole(DEFAULT_ADMIN_ROLE, attakerInstance);

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
              amount: 0n,
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
        await erc20Instance.approve(stakingInstance, amount);

        await erc20Instance.mint(receiver.address, amount);
        await erc20Instance.connect(receiver).approve(stakingInstance, amount);

        const tx1 = await stakingInstance.deposit(params, tokenIds);
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, 1, owner.address, startTimestamp, tokenIds);
        await expect(tx1).to.changeTokenBalances(erc20Instance, [owner, stakingInstance], [-amount, amount]);

        const tx2 = await stakingInstance.connect(receiver).deposit(params, tokenIds);
        const startTimestamp2: number = await time.latest();
        await expect(tx2)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(2, 1, receiver.address, startTimestamp2, tokenIds);
        await expect(tx1).to.changeTokenBalances(erc20Instance, [owner, stakingInstance], [-amount, amount]);

        // TIME

        // REWARD

        const tx3 = await stakingInstance.receiveReward(1, true, true);
        const endTimestamp: number = await time.latest();
        await expect(tx3).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

        // const stake = await stakingInstance.getStake(1);
        // expect(stake).to.have.deep.nested.property("cycles", 0);
        // expect(stake).to.have.deep.nested.property("activeDeposit", false);

        // WITHDRAW PENALTY
        const tx4 = attakerInstance.withdrawBalance({
          tokenType: 1,
          token: erc20Instance,
          tokenId,
          amount,
        });

        await expect(tx4).to.changeTokenBalances(
          erc20Instance,
          [attakerInstance, stakingInstance],
          [amount / 2n, -amount / 2n],
        );
        await expect(tx4).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx4)
          .to.emit(stakingInstance, "BalanceWithdraw")
          .withArgs(attakerInstance, [1, erc20Instance, tokenId, amount / 2n]);
      });

      it("should not call twice (ERC721)", async function () {
        const [owner, receiver] = await ethers.getSigners();

        const stakingInstance = await factory();
        const erc721Instance = await erc721Factory("ERC721Simple");
        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

        await erc721Instance.grantRole(MINTER_ROLE, stakingInstance);
        await stakingInstance.grantRole(DEFAULT_ADMIN_ROLE, attakerInstance);

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
              amount: 0n,
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
        await erc721Instance.mintCommon(owner.address, templateId);
        await erc721Instance.approve(stakingInstance, tokenId);

        await erc721Instance.mintCommon(receiver.address, templateId);
        await erc721Instance.connect(receiver).approve(stakingInstance, tokenId + 1n);

        const tx1 = await stakingInstance.deposit(params, [tokenId]);
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, 1, owner.address, startTimestamp, [tokenId]);
        const balance_11 = await erc721Instance.balanceOf(owner.address);
        const balance_12 = await erc721Instance.balanceOf(stakingInstance);
        expect(balance_11).to.be.equal(0);
        expect(balance_12).to.be.equal(1);
        // await expect(tx1).to.changeTokenBalances(erc20Instance, [owner, stakingInstance], [-amount, amount]);

        const tx2 = await stakingInstance.connect(receiver).deposit(params, [tokenId + 1n]);
        const startTimestamp2: number = await time.latest();
        await expect(tx2)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(2, 1, receiver.address, startTimestamp2, [tokenId + 1n]);
        const balance_21 = await erc721Instance.balanceOf(owner.address);
        const balance_22 = await erc721Instance.balanceOf(stakingInstance);
        expect(balance_21).to.be.equal(0);
        expect(balance_22).to.be.equal(2);
        // await expect(tx1).to.changeTokenBalances(erc20Instance, [owner, stakingInstance], [-amount, amount]);

        // TIME

        // REWARD

        const tx3 = await stakingInstance.receiveReward(1, true, true);
        const endTimestamp: number = await time.latest();
        await expect(tx3).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

        // const stake = await stakingInstance.getStake(1);
        // expect(stake).to.have.deep.nested.property("cycles", 0);
        // expect(stake).to.have.deep.nested.property("activeDeposit", false);

        // WITHDRAW PENALTY
        const tx4 = attakerInstance.withdrawBalance({
          tokenType: 2,
          token: erc721Instance,
          tokenId,
          amount: 1n,
        });

        await expect(tx4).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx4)
          .to.emit(stakingInstance, "BalanceWithdraw")
          .withArgs(attakerInstance, [2, erc721Instance, tokenId, 1]);
        const balance_31 = await erc721Instance.balanceOf(attakerInstance);
        const balance_32 = await erc721Instance.balanceOf(stakingInstance);
        expect(balance_31).to.be.equal(1);
        expect(balance_32).to.be.equal(1);
      });

      it("should not call twice (ERC1155)", async function () {
        const [owner, receiver] = await ethers.getSigners();

        const stakingInstance = await factory();
        const erc1155Instance = await erc1155Factory();
        const Attaker = await ethers.getContractFactory("ReentrancyStakingReward");
        const attakerInstance = await Attaker.deploy(stakingInstance);

        await erc1155Instance.grantRole(MINTER_ROLE, stakingInstance);
        await stakingInstance.grantRole(DEFAULT_ADMIN_ROLE, attakerInstance);

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
              amount: 0n,
            },
          ],
          content: [],
          terms: {
            period,
            penalty: 10000, // 50%
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
        await erc1155Instance.mint(owner.address, tokenId, amount, "0x");
        await erc1155Instance.setApprovalForAll(stakingInstance, true);

        await erc1155Instance.mint(receiver.address, tokenId, amount, "0x");
        await erc1155Instance.connect(receiver).setApprovalForAll(stakingInstance, true);

        const tx1 = await stakingInstance.deposit(params, tokenIds);
        const startTimestamp: number = await time.latest();
        await expect(tx1)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(1, 1, owner.address, startTimestamp, tokenIds);
        const balance_11 = await erc1155Instance.balanceOf(owner.address, tokenId);
        const balance_12 = await erc1155Instance.balanceOf(stakingInstance, tokenId);
        expect(balance_11).to.be.equal(0);
        expect(balance_12).to.be.equal(amount);
        // await expect(tx1).to.changeTokenBalances(erc20Instance, [owner, stakingInstance], [-amount, amount]);

        const tx2 = await stakingInstance.connect(receiver).deposit(params, tokenIds);
        const startTimestamp2: number = await time.latest();
        await expect(tx2)
          .to.emit(stakingInstance, "DepositStart")
          .withArgs(2, 1, receiver.address, startTimestamp2, tokenIds);
        const balance_21 = await erc1155Instance.balanceOf(owner.address, tokenId);
        const balance_22 = await erc1155Instance.balanceOf(stakingInstance, tokenId);
        expect(balance_21).to.be.equal(0);
        expect(balance_22).to.be.equal(amount * 2n);
        // await expect(tx1).to.changeTokenBalances(erc20Instance, [owner, stakingInstance], [-amount, amount]);

        // TIME

        // REWARD

        const tx3 = await stakingInstance.receiveReward(1, true, true);
        const endTimestamp: number = await time.latest();
        await expect(tx3).to.emit(stakingInstance, "DepositWithdraw").withArgs(1, owner.address, endTimestamp);

        // const stake = await stakingInstance.getStake(1);
        // expect(stake).to.have.deep.nested.property("cycles", 0);
        // expect(stake).to.have.deep.nested.property("activeDeposit", false);

        // WITHDRAW PENALTY
        const tx4 = attakerInstance.withdrawBalance({
          tokenType: 4,
          token: erc1155Instance,
          tokenId,
          amount,
        });

        await expect(tx4).to.emit(attakerInstance, "Reentered").withArgs(false);
        await expect(tx4)
          .to.emit(stakingInstance, "BalanceWithdraw")
          .withArgs(attakerInstance, [4, erc1155Instance, tokenId, amount]);
        const balance_31 = await erc1155Instance.balanceOf(attakerInstance, tokenId);
        const balance_32 = await erc1155Instance.balanceOf(stakingInstance, tokenId);
        expect(balance_31).to.be.equal(amount);
        expect(balance_32).to.be.equal(amount);
      });
    });
  });
}
