import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { ScrapedContract } from "./types.js";

export async function writeContract(
  contract: ScrapedContract,
  outputDir: string
): Promise<string> {
  const contractDir = join(
    outputDir,
    contract.metadata.chain,
    contract.metadata.address
  );

  // Write metadata
  const metadataPath = join(contractDir, "metadata.json");
  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(
    metadataPath,
    JSON.stringify(contract.metadata, null, 2),
    "utf-8"
  );

  // Write source files
  for (const source of contract.sources) {
    const filePath = join(contractDir, source.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, source.content, "utf-8");
  }

  return contractDir;
}
