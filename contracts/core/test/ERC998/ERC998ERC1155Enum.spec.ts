import { shouldSupportsInterface } from "@gemunion/contracts-utils";
import { shouldBehaveLikeAccessControl } from "@gemunion/contracts-access";
import { DEFAULT_ADMIN_ROLE, InterfaceId, MINTER_ROLE } from "@gemunion/contracts-constants";
import {
  shouldBehaveLikeERC998Enumerable,
  shouldBehaveLikeERC998ERC1155,
  shouldBehaveLikeERC998ERC1155Enumerable,
} from "@gemunion/contracts-erc998td";

import { deployERC721 } from "../ERC721/shared/fixtures";
import { customMintCommonERC721 } from "../ERC721/shared/customMintFn";
import { shouldMintCommon } from "../ERC721/shared/simple/base/mintCommon";
import { shouldBehaveLikeERC998Simple } from "./shared/simple";
import { FrameworkInterfaceId, tokenId } from "../constants";

describe("ERC998ERC1155Enum", function () {
  const factory = () => deployERC721(this.title);
  const options = { mint: customMintCommonERC721, tokenId };

  shouldBehaveLikeAccessControl(factory)(DEFAULT_ADMIN_ROLE, MINTER_ROLE);
  shouldBehaveLikeERC998Simple(factory);
  shouldBehaveLikeERC998Enumerable(factory, options);
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
    InterfaceId.IERC998TDEnumerable,
    InterfaceId.IERC998TDERC1155,
    InterfaceId.IERC998TDERC1155Enumerable,
    InterfaceId.IERC1155Receiver,
    FrameworkInterfaceId.ERC721Simple,
  ]);
});
