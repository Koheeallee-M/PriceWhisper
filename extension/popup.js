
const scanButton = document.getElementById("scan-button");
const buttonText = document.getElementById("button-text");
const productName = document.getElementById("product-name");
const productSite = document.getElementById("product-site");
const productPrice = document.getElementById("product-price");
const statusMessage = document.getElementById("status-message");

function setStatus(message) {
  statusMessage.textContent = message;
}

function showProduct(product) {
  productName.textContent = product.name || "Unknown product";
  productSite.textContent = product.site || "Website not identified";

  if (product.price !== null && product.price !== undefined &&
      String(product.price).trim() !== "") {
    const currency = product.currency ? ` ${product.currency}` : "";
    productPrice.textContent = `${product.price}${currency}`;
  } else {
    productPrice.textContent = "Price unavailable";
  }
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

    showProduct(response.product);

    if (response.product.price !== null &&
        response.product.price !== undefined &&
        String(response.product.price).trim() !== "") {
      setStatus("Product scanned successfully.");
    } else {
      setStatus("Product found, but its price could not be detected.");
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
