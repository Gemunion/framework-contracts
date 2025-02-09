import { ethers } from "hardhat";

import { amount } from "@ethberry/contracts-constants";
import { TokenType } from "@framework/types-blockchain";

import { deployERC1363 } from "../../../ERC20/shared/fixtures";
import { cap, tokenId, tokenZero, treasuryFee } from "../../../constants";

export async function deployPredictionContract() {
  const PredictionContractFactory = await ethers.getContractFactory("Prediction");
  return PredictionContractFactory.deploy({ treasuryFee });
}

export function getBetAsset(tokenType: TokenType): () => Promise<any> {
  return async () => {
    if (tokenType === TokenType.NATIVE) {
      return Promise.resolve({
        tokenType: 0,
        token: tokenZero,
        tokenId,
        amount,
      });
    }

    const tokenInstance = await deployERC1363("ERC20Simple", { amount: cap });

    return {
      tokenType: 1,
      token: await tokenInstance.getAddress(),
      tokenId,
      amount,
    };
  };
}
