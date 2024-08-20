import { ethers } from "hardhat";
import { MaxUint256 } from "ethers";
import { deployERC1363 } from "../../../ERC20/shared/fixtures";

export async function deployPredictionContract() {
  const [owner, admin, operator, bettor1, bettor2] = await ethers.getSigners();

  const token = await deployERC1363("ERC20Simple", { amount: MaxUint256 });

  const treasuryFee = BigInt(1000);

  const betUnit = {
    tokenType: 1,
    token: token,
    tokenId: 0,
    amount: ethers.parseUnits("5", 18),
  };

  const PredictionContractFactory = await ethers.getContractFactory("Prediction");
  const prediction = await PredictionContractFactory.deploy(
    betUnit,
    admin,
    operator,
    3,
    treasuryFee,
  );

  return { prediction, token, owner, admin, operator, bettor1, bettor2, treasuryFee };
}
