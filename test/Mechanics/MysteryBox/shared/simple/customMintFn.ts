import { BaseContract, Signer } from "ethers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { MINTER_ROLE } from "@ethberry/contracts-constants";

import { templateId } from "../../../../constants";
import { deployERC721 } from "../../../../ERC721/shared/fixtures";

export const customMint = async (
  mysteryBoxInstance: any,
  signer: Signer,
  receiver: SignerWithAddress | BaseContract | string,
) => {
  const erc721Factory = (name: string) => deployERC721(name);

  const erc721SimpleInstance = await erc721Factory("ERC721Random");
  await erc721SimpleInstance.grantRole(MINTER_ROLE, mysteryBoxInstance);

  return mysteryBoxInstance.connect(signer).mintBox(receiver, templateId, [
    {
      tokenType: 2,
      token: erc721SimpleInstance,
      tokenId: templateId,
      amount: 1n,
    },
  ]) as Promise<any>;
};
