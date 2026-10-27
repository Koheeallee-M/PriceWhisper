
const scanButton = document.getElementById("scan-button");
const buttonText = document.getElementById("button-text");
const productName = document.getElementById("product-name");
const productSite = document.getElementById("product-site");
const productPrice = document.getElementById("product-price");
const statusMessage = document.getElementById("status-message");
const dashboardButton = document.getElementById("dashboard-button");

const API_URL = "http://127.0.0.1:5000";


function setStatus(message, type = "neutral") {
  statusMessage.textContent = message;

  statusMessage.classList.remove(
    "price-drop",
    "price-increase",
    "price-unchanged",
    "status-neutral"
  );

  const statusClasses = {
    drop: "price-drop",
    increase: "price-increase",
    unchanged: "price-unchanged",
    neutral: "status-neutral"
  };

  statusMessage.classList.add(
    statusClasses[type] || statusClasses.neutral
  );
}


function showProduct(product) {
  productName.textContent = product.name || "Unknown product";
  productSite.textContent = product.site || "Website not identified";

  if (
    product.price !== null &&
    product.price !== undefined &&
    String(product.price).trim() !== ""
  ) {
    const currency = product.currency ? ` ${product.currency}` : "";
    productPrice.textContent = `${product.price}${currency}`;
  } else {
    productPrice.textContent = "Price unavailable";
  }
}

async function saveProductToBackend(product) {
  const response = await fetch(`${API_URL}/api/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: product.name,
      site: product.site,
      url: product.url,
      price: product.price,
      currency: product.currency
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Backend returned HTTP ${response.status}`);
  }

  return response.json();
}

async function scanProduct() {
  scanButton.disabled = true;
  buttonText.textContent = "Scanning...";
  setStatus("Reading product information from this page.");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id || !tab.url) {
      throw new Error("No active browser tab was found.");
    }

    const url = new URL(tab.url);

    const isWebsite = ["http:", "https:"].includes(url.protocol);
    const isLocalTestFile =
      url.protocol === "file:" &&
      url.pathname.toLowerCase().endsWith("/test-product.html");

    if (!isWebsite && !isLocalTestFile) {
      throw new Error(
        "Open a website or the test-product.html page before scanning."
      );
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "SCAN_PRODUCT"
    });

    if (!response?.success || !response.product) {
      throw new Error(
        response?.error || "Product information could not be read."
      );
    }

    const product = response.product;

    showProduct(product);

    // Keep the scan successful even if the backend is unavailable.
    
    try {
      const result = await saveProductToBackend(product);
      const change = result.price_change;

      if (
        product.price === null ||
        product.price === undefined ||
        String(product.price).trim() === ""
      ) {
        setStatus("Product saved, but its price could not be detected.");
      } else if (!change) {
        setStatus("Product scanned and saved to price history.");
      } else {
        const currency = change.currency || product.currency || "";
        const formatPrice = (value) => {
          const number = Number(value);

          return Number.isFinite(number)
            ? `${currency} ${number.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}`.trim()
            : "unavailable";
        };

        switch (change.status) {
          case "first_observation":
            setStatus(
              `First price recorded: ${formatPrice(change.current_price)}.`
            );
            break;

          case "price_drop":
            setStatus(
              `Price dropped! ${formatPrice(change.previous_price)} → ` +
              `${formatPrice(change.current_price)}. ` +
              `Saved ${formatPrice(Math.abs(change.difference))}` +
              (change.percentage_change !== null
                ? ` (${Math.abs(change.percentage_change)}%).`
                : ".")
            );
            break;

          case "price_increase":
            setStatus(
              `Price increased: ${formatPrice(change.previous_price)} → ` +
              `${formatPrice(change.current_price)}.`
            );
            break;

          case "unchanged":
            setStatus(
              `Price unchanged: ${formatPrice(change.current_price)}.`
            );
            break;

          case "currency_mismatch":
            setStatus(
              "Price saved, but the currency changed. Comparison skipped."
            );
            break;

          default:
            setStatus("Product scanned and saved to price history.");
        }
      }
    } catch (error) {
      console.error("PriceWhisper backend error:", error);
      setStatus("Product scanned, but could not be saved. Is Flask running?");
    }

  } catch (error) {
    console.error("PriceWhisper scan error:", error);

    setStatus(
      error.message ||
      "Something went wrong. Refresh the product page and try again."
    );
  } finally {
    scanButton.disabled = false;
    buttonText.textContent = "Scan this product";
  }
}

scanButton.addEventListener("click", scanProduct);

dashboardButton?.addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard.html")
  });
});

