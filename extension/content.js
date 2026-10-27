
function getText(element) {
  return element?.textContent?.trim() || null;
}

function getMetaContent(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const value = element?.getAttribute("content")?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function getProductObjects(data) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.flatMap(getProductObjects);
  }

  if (typeof data !== "object") {
    return [];
  }

  const results = [];
  const types = data["@type"];
  const typeList = Array.isArray(types) ? types : [types];

  if (typeList.some((type) =>
    typeof type === "string" && type.toLowerCase() === "product"
  )) {
    results.push(data);
  }

  if (data["@graph"]) {
    results.push(...getProductObjects(data["@graph"]));
  }

  return results;
}

function getStructuredProducts() {
  const products = [];

  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]'
  )) {
    try {
      const data = JSON.parse(script.textContent);
      products.push(...getProductObjects(data));
    } catch (error) {
      // Ignore invalid JSON-LD and continue scanning.
    }
  }

  return products;
}


function getProductData() {
  const site = window.location.hostname.replace(/^www\./, "");
  const isAmazon = /(^|\.)amazon\./i.test(site);

  const structuredProducts = getStructuredProducts();
  const product = structuredProducts[0] || {};

  const offers = Array.isArray(product.offers)
    ? product.offers[0]
    : product.offers || {};

  const name =
    (isAmazon
      ? document.querySelector("#productTitle")?.textContent?.trim()
      : null) ||
    product.name ||
    getMetaContent([
      'meta[property="og:title"]',
      'meta[name="twitter:title"]'
    ]) ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title ||
    "Unknown product";

  let rawPrice = null;
  let currency = offers.priceCurrency || null;

  if (isAmazon) {
    const priceArea =
      document.querySelector("#corePriceDisplay_desktop_feature_div") ||
      document.querySelector("#corePrice_feature_div") ||
      document.querySelector("#apex_desktop");

    const currentPrice = priceArea?.querySelector(
      ".reinventPricePriceToPayMargin"
    );

    if (currentPrice) {
      const accessibleText =
        currentPrice.querySelector(".a-offscreen")?.textContent?.trim();

      const whole =
        currentPrice.querySelector(".a-price-whole")?.textContent?.trim();

      const fraction =
        currentPrice.querySelector(".a-price-fraction")?.textContent?.trim();

      if (accessibleText) {
        rawPrice = accessibleText;
      } else if (whole && fraction) {
        rawPrice = `${whole.replace(/[^\d,]/g, "")}.${fraction.replace(/\D/g, "")}`;
      }

      const symbol =
        currentPrice.querySelector(".a-price-symbol")?.textContent?.trim();

      if (symbol) {
        currency = symbol;
      }
    }

    // Fallbacks for other Amazon page layouts.
    if (rawPrice === null) {
      const fallback = document.querySelector(
        "#price_inside_buybox, #newBuyBoxPrice, #priceblock_ourprice, #priceblock_dealprice"
      );

      rawPrice = fallback?.textContent?.trim() || null;
    }
  } else {
    rawPrice =
      offers.price ??
      offers.lowPrice ??
      offers.highPrice ??
      getMetaContent([
        'meta[property="product:price:amount"]',
        'meta[property="og:price:amount"]',
        'meta[itemprop="price"]',
        'meta[name="twitter:data1"]'
      ]) ??
      document.querySelector('[itemprop="price"]')?.getAttribute("content") ??
      document.querySelector('[itemprop="price"]')?.textContent?.trim() ??
      null;

    currency =
      currency ||
      getMetaContent([
        'meta[property="product:price:currency"]',
        'meta[property="og:price:currency"]'
      ]) ||
      null;
  }

  return {
    name: String(name).trim(),
    price: rawPrice === null ? null : String(rawPrice).trim(),
    currency,
    site,
    url: window.location.href
  };
}


if (!globalThis.__priceWhisperScannerInstalled) {
  globalThis.__priceWhisperScannerInstalled = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== "SCAN_PRODUCT") {
      return;
    }

    try {
      sendResponse({
        success: true,
        product: getProductData()
      });
    } catch (error) {
      console.error("PriceWhisper content scanner error:", error);

      sendResponse({
        success: false,
        error: "Could not read product information from this page."
      });
    }
  });
}
