import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getChain, chains } from "./chains.js";
import { scrapeContract } from "./scraper.js";
import { writeContract } from "./file-writer.js";
import type { CliOptions } from "./types.js";

async function downloadContract(
  address: string,
  chain: ReturnType<typeof getChain>,
  opts: CliOptions
) {
  const timeoutMs = Number(opts.timeout);

  console.log(
    chalk.blue(`\nBlockscan Downloader`) + chalk.gray(` — ${chain.label}`)
  );
  console.log(chalk.gray(`Address: ${address}\n`));

  const spinner = ora("Scraping contract source code...").start();
  const contract = await scrapeContract(address, chain, timeoutMs);
  spinner.succeed(
    `Found ${contract.sources.length} source file(s): ${chalk.green(contract.metadata.contractName || "Unknown")}`
  );

  const writeSpinner = ora("Writing files...").start();
  const outputPath = await writeContract(contract, opts.output);
  writeSpinner.succeed(`Written to ${chalk.cyan(outputPath)}`);

  // Handle proxy
  if (contract.metadata.isProxy && opts.proxy !== false) {
    if (contract.metadata.implementationAddress) {
      console.log(
        chalk.yellow(
          `\nProxy detected! Implementation: ${contract.metadata.implementationAddress}`
        )
      );

      const implSpinner = ora("Scraping implementation contract...").start();
      try {
        const implContract = await scrapeContract(
          contract.metadata.implementationAddress,
          chain,
          timeoutMs
        );
        implSpinner.succeed(
          `Found ${implContract.sources.length} implementation source file(s): ${chalk.green(implContract.metadata.contractName || "Unknown")}`
        );

        const implWriteSpinner = ora("Writing implementation files...").start();
        const implOutputPath = await writeContract(implContract, opts.output);
        implWriteSpinner.succeed(`Written to ${chalk.cyan(implOutputPath)}`);
      } catch (err: any) {
        implSpinner.fail(`Failed to scrape implementation: ${err.message}`);
      }
    } else {
      console.log(
        chalk.yellow(
          "\nProxy detected but could not resolve implementation address."
        )
      );
    }
  }

  console.log(chalk.green("\nDone!"));
}

const program = new Command();

program
  .name("blockscan-downloader")
  .description("Download EVM contract source code from block explorers")
  .version("1.0.0")
  .argument("<address>", "Contract address to download")
  .requiredOption(
    "-c, --chain <chain>",
    "Target chain (e.g., ethereum, bsc, polygon)"
  )
  .option("-o, --output <dir>", "Output directory", "./output")
  .option("--no-proxy", "Skip proxy implementation download")
  .option("-t, --timeout <ms>", "Page load timeout in ms", "30000")
  .addHelpText(
    "after",
    `\nSupported chains:\n  ${Object.keys(chains).join(", ")}\n\nExamples:
  $ npx tsx src/index.ts -c ethereum 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
  $ npx tsx src/index.ts -c bsc 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 -o ./contracts`
  )
  .action(async (address: string, opts: CliOptions) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      console.error(chalk.red(`Invalid address: ${address}`));
      process.exit(1);
    }

    let chain;
    try {
      chain = getChain(opts.chain);
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }

    try {
      await downloadContract(address, chain, opts);
    } catch (err: any) {
      console.error(chalk.red(`Scraping failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse();
