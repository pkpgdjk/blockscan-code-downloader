import { chromium, type Page } from "playwright";
import type {
  ChainConfig,
  ContractMetadata,
  ScrapedContract,
  SourceFile,
} from "./types.js";
import { detectProxy } from "./proxy-detector.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeContract(
  address: string,
  chain: ChainConfig,
  timeout: number
): Promise<ScrapedContract> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    const result = await scrapeContractPage(page, address, chain);
    await browser.close();
    return result;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function scrapeContractPage(
  page: Page,
  address: string,
  chain: ChainConfig
): Promise<ScrapedContract> {
  const url = `${chain.explorerUrl}/address/${address}#code`;
  console.log(`  Navigating to ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await delay(6000);

  const metadata = await extractMetadata(page, address, chain);
  const sources = await extractSources(page, metadata.contractName);

  const proxyInfo = await detectProxy(page);
  metadata.isProxy = proxyInfo.isProxy;
  metadata.implementationAddress = proxyInfo.implementationAddress;

  return { metadata, sources };
}

async function extractMetadata(
  page: Page,
  address: string,
  chain: ChainConfig
): Promise<ContractMetadata> {
  const metadata: Record<string, string> = await page.evaluate(`
    (() => {
      var result = {
        contractName: "",
        compilerVersion: "",
        optimization: "",
        runs: "",
        evmVersion: "",
        license: ""
      };

      var codeDiv = document.querySelector("#ContentPlaceHolder1_contractCodeDiv");
      if (!codeDiv) return result;

      // Parse from the card's innerText — labels are UPPERCASE, values on next line
      var card = codeDiv.querySelector(".card");
      var allText = card ? card.innerText : codeDiv.innerText;

      var cnMatch = allText.match(/CONTRACT NAME:?\\s*\\n([^\\n]+)/i);
      if (cnMatch) result.contractName = cnMatch[1].trim();

      var cvMatch = allText.match(/COMPILER VERSION:?\\s*\\n([^\\n]+)/i);
      if (cvMatch) result.compilerVersion = cvMatch[1].trim();

      var optMatch = allText.match(/OPTIMIZATION ENABLED:?\\s*\\n([^\\n]+)/i);
      if (optMatch) {
        var optLine = optMatch[1].trim();
        // Format: "Yes with 10000000 runs" or "No"
        if (optLine.toLowerCase().indexOf("yes") === 0) {
          result.optimization = "Yes";
          var runsMatch = optLine.match(/(\\d+)\\s*runs/);
          if (runsMatch) result.runs = runsMatch[1];
        } else {
          result.optimization = "No";
        }
      }

      var settingsMatch = allText.match(/OTHER SETTINGS:?\\s*\\n([^\\n]+)/i);
      if (settingsMatch) {
        var settingsLine = settingsMatch[1].trim();
        // Format: "istanbul EvmVersion" or "default evmVersion, Apache-2.0 license"
        var evmMatch = settingsLine.match(/([a-zA-Z]+)\\s*EvmVersion/i);
        if (evmMatch) result.evmVersion = evmMatch[1];
        // Extract license from settings line if present
        var licFromSettings = settingsLine.match(/,\\s*([A-Za-z0-9\\-.]+)\\s*license/i);
        if (licFromSettings && !result.license) result.license = licFromSettings[1];
      }

      var licMatch = allText.match(/LICENSE\\s*\\n([^\\n]+)/i);
      if (licMatch) result.license = licMatch[1].trim();

      return result;
    })()
  `);

  return {
    address,
    chain: chain.name,
    contractName: metadata.contractName ?? "",
    compilerVersion: metadata.compilerVersion ?? "",
    optimization: metadata.optimization ?? "",
    runs: metadata.runs ?? "",
    evmVersion: metadata.evmVersion ?? "",
    license: metadata.license ?? "",
    isProxy: false,
  };
}

async function extractSources(
  page: Page,
  contractName: string
): Promise<SourceFile[]> {
  // Strategy 1: Read editor_contractJsonData global variable
  // Etherscan stores source as a JSON string: {"language":"Solidity","sources":{"/path/File.sol":{"content":"..."},...}}
  const editorSources: { path: string; content: string }[] | null =
    await page.evaluate(`
    (() => {
      try {
        if (typeof editor_contractJsonData === "undefined") return null;
        var jsonStr = editor_contractJsonData;
        if (typeof jsonStr !== "string" || jsonStr.length < 10) return null;
        var parsed = JSON.parse(jsonStr);
        if (!parsed || !parsed.sources) return null;

        var results = [];
        for (var key in parsed.sources) {
          if (parsed.sources.hasOwnProperty(key) && parsed.sources[key].content) {
            results.push({ path: key, content: parsed.sources[key].content });
          }
        }
        return results.length > 0 ? results : null;
      } catch (e) {
        return null;
      }
    })()
  `);

  if (editorSources) {
    return editorSources.map((s) => ({
      path: cleanSourcePath(s.path),
      content: s.content,
    }));
  }

  // Strategy 2: Use ace editor API (older Etherscan/BscScan layout)
  const aceSource: string | null = await page.evaluate(`
    (() => {
      try {
        if (typeof ace !== "undefined") {
          var editor = ace.edit("editor");
          if (editor) {
            var val = editor.getValue();
            if (val && val.length > 50) return val;
          }
        }
      } catch(e) {}
      return null;
    })()
  `);

  if (aceSource) {
    const name = contractName || "Contract";
    return [{ path: `contracts/${name}.sol`, content: aceSource }];
  }

  // Strategy 3: Extract from textareas containing Solidity/Vyper source
  const textareaSources: string[] = await page.evaluate(`
    (() => {
      var results = [];
      var textareas = document.querySelectorAll("textarea");
      for (var i = 0; i < textareas.length; i++) {
        var val = textareas[i].value || "";
        if (val.length > 50 && (
            val.indexOf("pragma solidity") !== -1 ||
            val.indexOf("pragma experimental") !== -1 ||
            val.indexOf("SPDX-License") !== -1 ||
            val.indexOf("// Vyper") !== -1)) {
          results.push(val);
        }
      }
      return results;
    })()
  `);

  if (textareaSources.length > 0) {
    const name = contractName || "Contract";
    return textareaSources.map((content, i) => ({
      path: `contracts/${i === 0 ? name : name + "_" + i}.sol`,
      content,
    }));
  }

  // Strategy 3: Look in ace editor or pre tags
  const editorContent: string | null = await page.evaluate(`
    (() => {
      var aceEl = document.querySelector(".ace_editor");
      if (aceEl) {
        var c = (aceEl.textContent || "").trim();
        if (c.length > 50) return c;
      }
      var pres = document.querySelectorAll("pre");
      for (var i = 0; i < pres.length; i++) {
        var t = (pres[i].textContent || "").trim();
        if (t.indexOf("pragma solidity") !== -1 || t.indexOf("SPDX-License") !== -1) {
          return t;
        }
      }
      return null;
    })()
  `);

  if (editorContent) {
    const name = contractName || "Contract";
    return [{ path: `contracts/${name}.sol`, content: editorContent }];
  }

  return [];
}

function cleanSourcePath(rawPath: string): string {
  // Source paths from Etherscan often include full local paths like:
  // /Users/dev/project/contracts/Token.sol or contracts/Token.sol
  let cleaned = rawPath.trim();

  // Remove absolute path prefixes — keep from "contracts/" or "@" onwards
  const contractsIdx = cleaned.indexOf("contracts/");
  const atIdx = cleaned.indexOf("@");
  const srcIdx = cleaned.indexOf("src/");
  const libIdx = cleaned.indexOf("lib/");

  // Find the earliest meaningful directory
  const candidates = [contractsIdx, atIdx, srcIdx, libIdx].filter(
    (i) => i >= 0
  );

  if (candidates.length > 0) {
    const earliest = Math.min(...candidates);
    cleaned = cleaned.substring(earliest);
  } else if (cleaned.startsWith("/")) {
    // Just use the filename
    const parts = cleaned.split("/");
    cleaned = "contracts/" + parts[parts.length - 1];
  }

  // Ensure it doesn't start with /
  cleaned = cleaned.replace(/^\/+/, "");

  // If no directory, wrap in contracts/
  if (!cleaned.includes("/")) {
    cleaned = "contracts/" + cleaned;
  }

  // Ensure source files have an extension
  if (!cleaned.match(/\.\w+$/)) {
    cleaned += ".sol";
  }

  return cleaned;
}
