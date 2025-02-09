import { task } from "hardhat/config";
import { Result } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

task("erc721-mint-common", "Mints ERC721 tokens")
  .addParam("contract", "The ERC721 contract's address")
  .addParam("to", "The account's address")
  .addParam("id", "Template id")
  .setAction(async (args, hre) => {
    const { contract, to, id } = args;

    const blockNumber = await hre.ethers.provider.getBlockNumber();

    const contractInstance = await hre.ethers.getContractAt("ERC721Simple", contract);
    const tx = await contractInstance.mintCommon(to, id);
    await tx.wait();

    const eventFilter = contractInstance.filters.Transfer();
    const events = await contractInstance.queryFilter(eventFilter, blockNumber);
    const result = recursivelyDecodeResult(events[0].args as unknown as Result);

    console.info("ERC721 mint", result);
  });

// hardhat erc721-mint --contract 0x5FbDB2315678afecb367f032d93F642f64180aa3 --to 0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73 --id 1 --network ethberry_besu
