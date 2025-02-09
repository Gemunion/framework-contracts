import { ethers } from "hardhat";
import { BaseContract, ZeroAddress, Result } from "ethers";

import { recursivelyDecodeResult } from "@framework/utils-eth";

import { FacetCutAction, getSelector, getSelectors } from "../../shared/diamond";

export interface IDiamondCut {
  facetAddress: string;
  action: number;
  functionSelectors: Array<string>;
}

export async function loupeExists(addr: string): Promise<boolean> {
  const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", addr);
  try {
    await diamondLoupeFacet.facetAddresses();
    return true;
  } catch (e) {
    void e;
    return false;
  }
}

// get facet cut array depends on existence selector and in the current diamond
export async function getFacetCuts(
  cut: Array<IDiamondCut>,
  selectors: Array<string>, // function selectors
  facetAddress: string, // new facet address
  diamondAddr: string, // diamond loupe address
  remove = false, // remove facets flag
): Promise<void> {
  const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamondAddr);

  const toAdd = [];
  const toReplace = [];
  for (const selector of selectors) {
    const facet = await diamondLoupeFacet.facetAddress(selector);
    if (facet === ZeroAddress && !remove) {
      toAdd.push(selector);
    } else {
      toReplace.push(selector);
    }
  }

  if (toAdd.length > 0) {
    cut.push({
      facetAddress,
      action: FacetCutAction.Add,
      functionSelectors: toAdd,
    });
  }
  if (toReplace.length > 0) {
    cut.push({
      facetAddress,
      action: !remove ? FacetCutAction.Replace : FacetCutAction.Remove,
      functionSelectors: toReplace,
    });
  }
}

export async function deployDiamond(
  DiamondName = "Diamond",
  FacetNames: Array<string>,
  InitContractName: string,
  options?: Record<string, any>,
): Promise<BaseContract> {
  const { log, logSelectors } = options || {};
  const [owner] = await ethers.getSigners();

  // deploy DiamondCutFacet
  const diamondCutFacetFactory = await ethers.getContractFactory("DiamondCutFacet");
  const diamondCutFacet = await diamondCutFacetFactory.deploy();
  await diamondCutFacet.waitForDeployment();
  if (log) console.info("DiamondCutFacet deployed:", await diamondCutFacet.getAddress());

  // deploy Diamond
  const diamondFactory = await ethers.getContractFactory(DiamondName);
  const diamond = await diamondFactory.deploy(owner, await diamondCutFacet.getAddress());
  await diamond.waitForDeployment();
  if (log) console.info("Diamond deployed:", await diamond.getAddress());

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const diamondInitFactory = await ethers.getContractFactory(InitContractName);
  const diamondInit = await diamondInitFactory.deploy();
  await diamondInit.waitForDeployment();
  // if (log) console.info("DiamondInit deployed:", await diamond.getAddress());

  // * deploy facets
  if (log) console.info("");
  if (log) console.info("Deploying facets");
  const cut = [];
  for (const FacetName of FacetNames) {
    const facetFactory = await ethers.getContractFactory(FacetName);
    const facet = await facetFactory.deploy();
    await facet.waitForDeployment();
    if (log) console.info(`${FacetName} deployed: ${await facet.getAddress()}`);
    cut.push({
      facetAddress: await facet.getAddress(),
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet, { logSelectors }),
    });
  }

  // cut Facets & Init
  if (log) console.info("");
  if (log) console.info("Diamond Cut:", cut);
  const diamondCut = await ethers.getContractAt("IDiamondCut", diamond);
  // upgrade diamond with facets & call to init function
  const functionCall = diamondInit.interface.encodeFunctionData("init");

  const tx = await diamondCut.diamondCut(cut, diamondInit, functionCall);

  if (log) console.info("Diamond cut tx: ", tx.hash);
  const receipt = await tx.wait();
  if (!receipt?.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  if (log) console.info("Completed diamond cut");
  return diamond;
}

// ONLY IF ALL FUNCTIONS ARE NEW
export async function addFacetDiamond(
  DiamondName = "Diamond",
  diamondAddress: string,
  FacetNames: Array<string>,
  options?: Record<string, any>,
): Promise<BaseContract> {
  const { log, logSelectors } = options || {};

  // attach DIAMOND
  const diamond = await ethers.getContractAt(DiamondName, diamondAddress);
  // attach DiamondCutFacet
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamondAddress);
  if (log) console.info("Diamond attached:", await diamond.getAddress());

  // * deploy and ADD facets
  if (log) console.info("");
  if (log) console.info("Deploying new facets");
  const cut = [];
  for (const FacetName of FacetNames) {
    const facetFactory = await ethers.getContractFactory(FacetName);
    const facet = await facetFactory.deploy();
    await facet.waitForDeployment();
    if (log) console.info(`${FacetName} deployed: ${await facet.getAddress()}`);
    cut.push({
      facetAddress: await facet.getAddress(),
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet, { logSelectors }),
    });
  }

  // cut Facets
  if (log) console.info("");
  if (log) console.info("Diamond Cut:", cut);
  // ZeroAddress because we do not need to init diamond and 0x because do no need to make a functional call
  const tx = await diamondCutFacet.diamondCut(cut, ZeroAddress, "0x");

  if (log) console.info("Diamond cut tx: ", tx.hash);
  const receipt = await tx.wait();
  if (!receipt?.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  // LOG ALL FACET ADDRESSES
  if (log && (await loupeExists(diamondAddress))) {
    // TODO check diamondLoupe existence
    const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamondAddress);
    const result = await diamondLoupeFacet.facetAddresses();
    console.info("DiamondFacetAddresses:", result);
  }
  if (log) console.info("Completed diamond upgrade (ADD)");
  if (log) console.info("");
  return diamond;
}

// REPLACE = REMOVE OLD + ADD NEW
export async function updateFacetDiamond(
  DiamondName = "Diamond",
  diamondAddress: string,
  FacetNames: Array<string>, // Facet names which need to replace
  options?: Record<string, any>,
): Promise<BaseContract> {
  const { log, logSelectors } = options || {};

  // attach DIAMOND
  const diamond = await ethers.getContractAt(DiamondName, diamondAddress);
  // attach DiamondCutFacet
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamondAddress);
  const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamondAddress);
  if (log) console.info("Diamond attached:", await diamond.getAddress());

  // * deploy and REPLACE facets
  if (log) console.info("");
  if (log) console.info("Deploying new facets");
  const cut: Array<{ facetAddress: string; action: number; functionSelectors: string[] }> = [];
  for (const FacetName of FacetNames) {
    const facetFactory = await ethers.getContractFactory(FacetName);
    const facet = await facetFactory.deploy();
    await facet.waitForDeployment();
    const facetAddress = await facet.getAddress();
    if (log) console.info(`${FacetName} deployed: ${facetAddress}`);
    const facetSelectors = getSelectors(facet, { logSelectors });
    // combine selector cut actions
    if (await loupeExists(diamondAddress)) {
      await getFacetCuts(cut, facetSelectors, facetAddress, diamondAddress);
    } else {
      cut.push({
        facetAddress,
        action: FacetCutAction.Replace,
        functionSelectors: facetSelectors,
      });
    }
  }

  // cut Facets
  if (log) console.info("");
  if (log) console.info("Diamond Cut:", cut);

  // ZeroAddress because we do not need to init diamond and 0x because no need to make a functional call
  const tx = await diamondCutFacet.diamondCut(cut, ZeroAddress, "0x");

  if (log) console.info("Diamond cut tx: ", tx.hash);
  const receipt = await tx.wait();
  if (!receipt?.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  // LOG ALL FACET ADDRESSES
  if (log) {
    const result = await diamondLoupeFacet.facetAddresses();
    console.info("DiamondFacetAddresses:", recursivelyDecodeResult(result as unknown as Result));
  }
  if (log) console.info("Completed diamond upgrade (REPLACE)");
  if (log) console.info("");
  return diamond;
}

// REMOVE OLD FACE
export async function removeFacetDiamond(
  DiamondName = "Diamond",
  diamondAddress: string,
  FacetNames: Array<string>, // Facet names which need to replace
  options?: Record<string, any>,
): Promise<BaseContract> {
  const { log, logSelectors } = options || {};

  // attach DIAMOND
  const diamond = await ethers.getContractAt(DiamondName, diamondAddress);
  // attach DiamondCutFacet
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamondAddress);
  const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamondAddress);
  if (log) console.info("Diamond attached:", await diamond.getAddress());

  // * deploy and REPLACE facets
  if (log) console.info("");
  if (log) console.info("Deploying new facets");
  const cut: Array<{ facetAddress: string; action: number; functionSelectors: string[] }> = [];
  for (const FacetName of FacetNames) {
    const facet = await ethers.getContractAt(FacetName, diamondAddress);
    if (log) console.info(`${FacetName} attached: ${diamondAddress}`);
    const facetSelectors = getSelectors(facet, { logSelectors });
    // combine selector cut actions
    if (await loupeExists(diamondAddress)) {
      await getFacetCuts(cut, facetSelectors, ZeroAddress, diamondAddress, true);
    } else {
      cut.push({
        facetAddress: ZeroAddress,
        action: FacetCutAction.Remove,
        functionSelectors: facetSelectors,
      });
    }
  }

  // cut Facets
  if (log) console.info("");
  if (log) console.info("Diamond Cut:", cut);

  // ZeroAddress because we do not need to init diamond and 0x because no need to make a functional call
  const tx = await diamondCutFacet.diamondCut(cut, ZeroAddress, "0x");

  if (log) console.info("Diamond cut tx: ", tx.hash);
  const receipt = await tx.wait();
  if (!receipt?.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  // LOG ALL FACET ADDRESSES
  if (log) {
    const result = await diamondLoupeFacet.facetAddresses();
    console.info("DiamondFacetAddresses:", recursivelyDecodeResult(result as unknown as Result));
  }
  if (log) console.info("Completed diamond upgrade (REMOVE)");
  if (log) console.info("");
  return diamond;
}

// get facet address
export async function getFacetAddrByFunction(
  diamondAddress: string,
  FunctionSignature: string, // Function which we want to replace?
): Promise<string> {
  // attach DIAMOND LOUPE
  const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamondAddress);
  const funcSelector = getSelector(FunctionSignature);
  return diamondLoupeFacet.facetAddress(funcSelector);
}

// get facet address
export async function getFacetSelectorsByAddr(
  diamondAddress: string, // diamond address
  facetAddr: string, // faccet address
): Promise<Array<string>> {
  // attach DIAMOND LOUPE
  const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamondAddress);
  return diamondLoupeFacet.facetFunctionSelectors(facetAddr);
}
