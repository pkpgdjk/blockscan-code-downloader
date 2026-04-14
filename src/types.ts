export interface ChainConfig {
  name: string;
  explorerUrl: string;
  label: string;
}

export interface ContractMetadata {
  address: string;
  chain: string;
  contractName: string;
  compilerVersion: string;
  optimization: string;
  runs: string;
  evmVersion: string;
  license: string;
  isProxy: boolean;
  implementationAddress?: string;
}

export interface SourceFile {
  path: string;
  content: string;
}

export interface ScrapedContract {
  metadata: ContractMetadata;
  sources: SourceFile[];
}

export interface CliOptions {
  chain: string;
  output: string;
  proxy: boolean;
  timeout: number;
}
