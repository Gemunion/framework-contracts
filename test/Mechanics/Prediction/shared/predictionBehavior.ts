import { TokenType } from "@framework/types-blockchain";

import { getBetAsset } from "./fixtures";
import { shouldStartPrediction } from "./start";
import { shouldBetPosition } from "./bet";
import { shouldResolvePrediction } from "./resolve";
import { shouldClaim } from "./claim";
import { shouldClaimTreasury } from "./claimTreasury";
import { shouldPreventReentrancy } from "./reentrancy";

export function shouldBehaveLikePrediction(predictionFactory: () => Promise<any>, tokenType: TokenType) {
  describe(`prediction behavior with ${tokenType} tokens`, function () {
    shouldStartPrediction(predictionFactory, getBetAsset(tokenType));
    shouldBetPosition(predictionFactory, getBetAsset(tokenType));
    shouldResolvePrediction(predictionFactory, getBetAsset(tokenType));
    shouldClaim(predictionFactory, getBetAsset(tokenType));
    shouldClaimTreasury(predictionFactory, getBetAsset(tokenType));
    shouldPreventReentrancy(predictionFactory, getBetAsset(tokenType));
  });
}
