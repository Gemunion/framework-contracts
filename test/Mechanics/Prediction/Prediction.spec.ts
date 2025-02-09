import { shouldBehaveLikePausable, shouldSupportsInterface } from "@ethberry/contracts-utils";
import { InterfaceId } from "@ethberry/contracts-constants";

import { TokenType } from "@framework/types-blockchain";

import { shouldBehaveLikePrediction } from "./shared/predictionBehavior";
import { deployPredictionContract } from "./shared/fixtures";

describe("Prediction", function () {
  shouldBehaveLikePausable(deployPredictionContract);

  shouldBehaveLikePrediction(deployPredictionContract, TokenType.NATIVE);
  shouldBehaveLikePrediction(deployPredictionContract, TokenType.ERC20);

  shouldSupportsInterface(deployPredictionContract)([
    InterfaceId.IERC165,
    InterfaceId.IERC1363Receiver,
    InterfaceId.IERC1363Spender,
    InterfaceId.IAccessControl,
  ]);
});
