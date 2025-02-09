import { snakeToCamelCase } from "@ethberry/utils";
import {
  AbiCoder,
  concat,
  hexlify,
  id,
  keccak256,
  Provider,
  randomBytes,
  toBeArray,
  toBeHex,
  zeroPadValue
} from "ethers";

import { patchBigInt } from "@framework/utils-eth";
import { Networks } from "@framework/types-blockchain";

patchBigInt();

export const getNumbersBytes = (selected = [8, 5, 3, 2, 1, 0]) => {
  const numbers: Array<any> = [];
  selected.forEach(s => {
    numbers.push(toBeHex(s));
  });
  return zeroPadValue(concat(numbers), 32);
};

export const decodeNumbersBytes = (selected = "0x0000000000000000000000000000000000000000000000000000010203040506") => {
  const numbers: Array<number> = [];
  for (let i = 0; i < 6; i++) {
    numbers.push(Number(selected.substring(selected.length - 12, selected.length).substring(2 * i, 2 + 2 * i)));
  }
  return numbers;
};

export const getBytesNumbersArr = (selected = "4328719624n"): Array<number> => {
  const arrStr = toBeArray(selected);
  const arr = [];
  for (const item of arrStr) {
    arr.push(Number(item));
  }
  return arr;
};

export const getContractName = (base: string, network: string) => {
  return base.includes("Random") || base.includes("Genes") || base.includes("LootBox") || base.startsWith("Lottery") || base.startsWith("Raffle") ?
    snakeToCamelCase(`${base}_${network}`) : base;
};

export const isEqualArray = (...args: any[]): any => {
  return (eventValues: any[]): boolean => {
    for (let i = 0; i < eventValues.length; i++) {
      if (JSON.stringify(eventValues[i]) !== JSON.stringify(args[i])) {
        console.error("eventValues[i]", JSON.stringify(eventValues[i]));
        console.error("args[i]", JSON.stringify(args[i]));
        return false;
      }
    }
    return true;
  };
};

export const isEqualEventArgObj = (args: any): any => {
  return (eventValues: any): boolean => {
    for (const key of Object.keys(args)) {
      if (JSON.stringify(eventValues[key]) !== JSON.stringify(args[key])) {
        return false;
      }
    }
    return true;
  };
};

export const isEqualEventArgArrObj = (...args: any[]): any => {
  return (eventValues: any[]): boolean => {
    for (let i = 0; i < eventValues.length; i++) {
      for (const key of Object.keys(args[i])) {
        if (JSON.stringify(eventValues[i][key]) !== JSON.stringify(args[i][key])) {
          console.error(`eventValues[${i}][${key}]`, JSON.stringify(eventValues[i][key]));
          console.error(`args[${i}][${key}]`, JSON.stringify(args[i][key]));
          return false;
        }
      }
    }
    return true;
  };
};

// solidity-create2-deployer/src/utils
// const encoded = AbiCoder.defaultAbiCoder().encode(abi, input);

export const encodeParam = (dataType: any, data: any) => {
  const abiCoder = AbiCoder.defaultAbiCoder();
  return data && dataType ? abiCoder.encode([dataType], [data]) : "";
};

export const encodeParams = (dataTypes: any[], data: any[]) => {
  const abiCoder = AbiCoder.defaultAbiCoder();
  return dataTypes.length > 0 && data.length > 0 ? abiCoder.encode(dataTypes, data) : "";
};

export const getInitCodeHash = (constructorTypes: any[], constructorArgs: any[], contractBytecode: string) =>
  keccak256(`${contractBytecode}${encodeParams(constructorTypes, constructorArgs).slice(2)}`);

export const buildCreate2Address = (factory: string, saltHex: string, byteCode: string) => {
  return `0x${keccak256(
    `0x${["ff", factory, saltHex, keccak256(byteCode)].map(x => x.replace(/0x/, "")).join("")}`,
  ).slice(-40)}`.toLowerCase();
};

export const numberToUint256 = (value: number) => {
  const hex = value.toString(16);
  return `0x${"0".repeat(64 - hex.length)}${hex}`;
};

export const saltToHex = (salt: string | number) => id(salt.toString());

export const isContract = async (address: string, provider: Provider) => {
  const code = await provider.getCode(address);
  return code.slice(2).length > 0;
};

export const chainIdToSuffix = (chainId: string | bigint | number) => {
  return Object.keys(Networks)[Object.values(Networks).indexOf(Number(chainId))];
};

export const decodeNumber = (encoded: bigint) => {
  const genes = {
    baseColor: encoded >> 176n,
    highlightColor: (encoded >> 160n) & 0xffffn,
    accentColor: (encoded >> 144n) & 0xffffn,
    mouth: (encoded >> 128n) & 0xffffn,
    fur: (encoded >> 112n) & 0xffffn,
    pattern: (encoded >> 95n) & 0xffffn,
    eyeShape: (encoded >> 80n) & 0xffffn,
    eyeColor: (encoded >> 64n) & 0xffffn,
    wild: (encoded >> 48n) & 0xffffn,
    environment: (encoded >> 32n) & 0xffffn,
    secret: (encoded >> 16n) & 0xffffn,
    purrstige: (encoded >> 0n) & 0xffffn,
  };
  return genes;
};

export const mixGenes = (motherGenes: bigint, fatherGenes: bigint, randomWord: bigint): bigint => {
  let childGenes = 0n;
  let mask = 1n;

  for (let i = 0; i < 256; i++) {
    if ((randomWord & mask) === 0n) {
      childGenes |= motherGenes & mask;
    } else {
      childGenes |= fatherGenes & mask;
    }
    mask <<= 1n;
  }

  return childGenes;
};

export const generateRandomGenes = () => {
  return BigInt("0x" + hexlify(randomBytes(32)).slice(2));
};
