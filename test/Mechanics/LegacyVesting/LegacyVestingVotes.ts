import { shouldSupportsInterface } from "@ethberry/contracts-utils";
import { shouldBehaveLikeOwnable } from "@ethberry/contracts-access";
import { InterfaceId } from "@ethberry/contracts-constants";

import { deployVesting } from "./shared/fixture";
import { calc } from "./shared/calc";
import { shouldBehaveLikeTopUp } from "../../shared/topUp";

describe("LegacyVestingVotes", function () {
  const factory = () => deployVesting("LegacyVestingVotes", 12, 417);

  shouldBehaveLikeOwnable(factory);
  shouldBehaveLikeTopUp(factory);

  describe("release", function () {
    it("AdvisorsVesting", async function () {
      await calc("LegacyVestingVotes", 12, 417);
    });

    it("MarketingVesting", async function () {
      await calc("LegacyVestingVotes", 1, 1500);
    });

    it("PartnershipVesting", async function () {
      await calc("LegacyVestingVotes", 6, 417);
    });

    it("PreSeedSaleVesting", async function () {
      await calc("LegacyVestingVotes", 3, 416);
    });

    it("PrivateSaleVesting", async function () {
      await calc("LegacyVestingVotes", 1, 624);
    });

    it("PublicSaleVesting", async function () {
      await calc("LegacyVestingVotes", 0, 3333);
    });

    it("SeedSaleVesting", async function () {
      await calc("LegacyVestingVotes", 2, 500);
    });

    it("TeamVesting", async function () {
      await calc("LegacyVestingVotes", 12, 417);
    });

    it("InitialLiquidityVesting", async function () {
      await calc("LegacyVestingVotes", 0, 5000);
    });

    it("TreasuryVesting", async function () {
      await calc("LegacyVestingVotes", 3, 10000);
    });
  });

  shouldSupportsInterface(factory)([InterfaceId.IERC165, InterfaceId.IERC1363Receiver, InterfaceId.IERC1363Spender]);
});
