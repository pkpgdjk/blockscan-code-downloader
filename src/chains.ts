import type { ChainConfig } from "./types.js";

export const chains: Record<string, ChainConfig> = {
  ethereum: {
    name: "ethereum",
    explorerUrl: "https://etherscan.io",
    label: "Etherscan",
  },
  bsc: {
    name: "bsc",
    explorerUrl: "https://bscscan.com",
    label: "BscScan",
  },
  polygon: {
    name: "polygon",
    explorerUrl: "https://polygonscan.com",
    label: "PolygonScan",
  },
  arbitrum: {
    name: "arbitrum",
    explorerUrl: "https://arbiscan.io",
    label: "Arbiscan",
  },
  optimism: {
    name: "optimism",
    explorerUrl: "https://optimistic.etherscan.io",
    label: "Optimistic Etherscan",
  },
  avalanche: {
    name: "avalanche",
    explorerUrl: "https://snowscan.xyz",
    label: "Snowscan",
  },
  fantom: {
    name: "fantom",
    explorerUrl: "https://ftmscan.com",
    label: "FTMScan",
  },
  base: {
    name: "base",
    explorerUrl: "https://basescan.org",
    label: "BaseScan",
  },
  linea: {
    name: "linea",
    explorerUrl: "https://lineascan.build",
    label: "LineaScan",
  },
  scroll: {
    name: "scroll",
    explorerUrl: "https://scrollscan.com",
    label: "ScrollScan",
  },
  zksync: {
    name: "zksync",
    explorerUrl: "https://era.zksync.network",
    label: "zkSync Explorer",
  },
  blast: {
    name: "blast",
    explorerUrl: "https://blastscan.io",
    label: "BlastScan",
  },
};

export function getChain(name: string): ChainConfig {
  const chain = chains[name.toLowerCase()];
  if (!chain) {
    const available = Object.keys(chains).join(", ");
    throw new Error(`Unknown chain: ${name}. Available: ${available}`);
  }
  return chain;
}
