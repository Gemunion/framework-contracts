import { shouldSupportsInterface } from "@ethberry/contracts-utils";
import { shouldBehaveLikeAccessControl } from "@ethberry/contracts-access";
import { DEFAULT_ADMIN_ROLE, InterfaceId, MINTER_ROLE } from "@ethberry/contracts-constants";
import {
  shouldBehaveLikeERC998Enumerable,
  shouldBehaveLikeERC998ERC1155,
  shouldBehaveLikeERC998ERC1155Enumerable,
  shouldBehaveLikeERC998ERC20,
  shouldBehaveLikeERC998ERC20Enumerable,
} from "@ethberry/contracts-erc998td";

import { shouldMintCommon } from "../ERC721/shared/simple/base/mintCommon";
import { deployERC721 } from "../ERC721/shared/fixtures";
import { shouldBehaveLikeERC998Simple } from "./shared/simple";
import { customMintCommonERC721 } from "../ERC721/shared/customMintFn";
import { FrameworkInterfaceId, tokenId } from "../constants";

describe("ERC998ERC1155ERC20Enum", function () {
  const factory = () => deployERC721(this.title);
  const options = { mint: customMintCommonERC721, tokenId };

  shouldBehaveLikeAccessControl(factory)(DEFAULT_ADMIN_ROLE, MINTER_ROLE);
  shouldBehaveLikeERC998Simple(factory);
  shouldBehaveLikeERC998Enumerable(factory, options);
  shouldBehaveLikeERC998ERC20(factory, options);
  shouldBehaveLikeERC998ERC20Enumerable(factory, options);
  shouldBehaveLikeERC998ERC1155(factory, options);
  shouldBehaveLikeERC998ERC1155Enumerable(factory, options);
  shouldMintCommon(factory);

  shouldSupportsInterface(factory)([
    InterfaceId.IERC165,
    InterfaceId.IAccessControl,
    InterfaceId.IERC721,
    InterfaceId.IERC721Metadata,
    InterfaceId.IRoyalty,
    InterfaceId.IERC998TD,
    InterfaceId.IERC998WL,
    InterfaceId.IERC998TDERC20Enumerable,
    InterfaceId.IERC998TDEnumerable,
    InterfaceId.IERC998TDERC1155Enumerable,
    InterfaceId.IERC998TDERC1155,
    FrameworkInterfaceId.ERC721Simple,
  ]);
});