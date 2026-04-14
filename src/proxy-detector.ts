import type { Page } from "playwright";

export interface ProxyInfo {
  isProxy: boolean;
  implementationAddress?: string;
}

export async function detectProxy(page: Page): Promise<ProxyInfo> {
  // Use string-based evaluate to avoid tsx __name injection issue
  const result: ProxyInfo = await page.evaluate(`
    (() => {
      var bodyText = document.body.innerText;
      var bodyHtml = document.body.innerHTML;

      // Pattern 1: Direct implementation address mention
      var implPatterns = [
        /(?:implementation|impl)\\s*(?:address|contract)\\s*(?:is\\s*(?:at\\s*)?)?:?\\s*(0x[a-fA-F0-9]{40})/i,
        /(?:points?\\s*to|delegates?\\s*to|redirects?\\s*to)\\s*:?\\s*(0x[a-fA-F0-9]{40})/i,
        /ABI for the implementation contract at\\s*:?\\s*(0x[a-fA-F0-9]{40})/i
      ];

      for (var i = 0; i < implPatterns.length; i++) {
        var match = bodyText.match(implPatterns[i]);
        if (match) {
          return { isProxy: true, implementationAddress: match[1] };
        }
      }

      // Pattern 2: Look for implementation address in links
      var links = document.querySelectorAll("a[href]");
      for (var j = 0; j < links.length; j++) {
        var link = links[j];
        var href = link.getAttribute("href") || "";
        var parentText = (link.parentElement ? link.parentElement.textContent : "") || "";

        if (parentText.toLowerCase().indexOf("implementation") !== -1 &&
            href.match(/\\/address\\/(0x[a-fA-F0-9]{40})/)) {
          var addrMatch = href.match(/\\/address\\/(0x[a-fA-F0-9]{40})/);
          if (addrMatch) {
            return { isProxy: true, implementationAddress: addrMatch[1] };
          }
        }
      }

      // Pattern 3: Check for proxy indicators
      var readAsProxy = bodyText.indexOf("Read as Proxy") !== -1 ||
                        bodyText.indexOf("Write as Proxy") !== -1;
      var proxyBadge = bodyHtml.indexOf("contract-badge-proxy") !== -1 ||
                       bodyText.indexOf("Proxy Contract") !== -1 ||
                       bodyText.indexOf("This is a proxy") !== -1;

      if (readAsProxy || proxyBadge) {
        return { isProxy: true, implementationAddress: undefined };
      }

      return { isProxy: false };
    })()
  `);

  // If we detected proxy but couldn't get implementation from page text,
  // try clicking "Read as Proxy" to reveal the implementation address
  if (result.isProxy && !result.implementationAddress) {
    const implAddr = await tryReadAsProxy(page);
    if (implAddr) {
      result.implementationAddress = implAddr;
    }
  }

  return result;
}

async function tryReadAsProxy(page: Page): Promise<string | undefined> {
  try {
    // Look for the "Read as Proxy" tab and click it
    const proxyTab = await page.$(
      'a:has-text("Read as Proxy"), button:has-text("Read as Proxy"), [data-bs-target*="readProxyContract"]'
    );

    if (proxyTab) {
      await proxyTab.click();
      await new Promise((r) => setTimeout(r, 2000));

      const implAddr: string | null = await page.evaluate(`
        (() => {
          var text = document.body.innerText;
          var match = text.match(
            /implementation\\s*(?:address|contract)\\s*(?:is\\s*(?:at\\s*)?)?:?\\s*(0x[a-fA-F0-9]{40})/i
          );
          if (match) return match[1];

          var proxySection = document.querySelector(
            "#readProxyContract, .proxy-contract-section"
          );
          if (proxySection) {
            var addrMatch = (proxySection.textContent || "").match(/0x[a-fA-F0-9]{40}/);
            if (addrMatch) return addrMatch[0];
          }

          return null;
        })()
      `);

      return implAddr ?? undefined;
    }
  } catch {
    // Proxy detection is best-effort
  }
  return undefined;
}
