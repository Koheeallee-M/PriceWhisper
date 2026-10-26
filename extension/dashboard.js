
const API_URL = "http://127.0.0.1:5000";

const statusElement = document.getElementById("status");
const productsElement = document.getElementById("products");
const compareForm = document.getElementById("compare-form");
const searchInput = document.getElementById("search-query");
const comparisonResults = document.getElementById("comparison-results");
const historyTitle = document.getElementById("history-title");
const historyDescription = document.getElementById("history-description");
const historyDetails = document.getElementById("history-details");
const chart = document.getElementById("history-chart");

let savedProducts = [];
let selectedProductId = null;

function setStatus(message) {
  statusElement.textContent = message;
}

function formatPrice(price, currency) {
  if (price === null || price === undefined || price === "") {
    return "Price unavailable";
  }

  return `${price}${currency ? ` ${currency}` : ""}`;
}

function numericPrice(price) {
  if (price === null || price === undefined) return null;

  const value = Number(String(price).replace(/,/g, "").trim());
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function makeCell(row, text, tag = "td") {
  const cell = document.createElement(tag);
  cell.textContent = text ?? "";
  row.appendChild(cell);
  return cell;
}

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/api/products`);

    if (!response.ok) {
      throw new Error(`API returned HTTP ${response.status}`);
    }

    savedProducts = await response.json();
    renderProducts(savedProducts);

    setStatus(
      `${savedProducts.length} saved product(s) loaded from your local database.`
    );
  } catch (error) {
    console.error("Could not load saved products:", error);
    productsElement.textContent =
      "Could not load products. Check that the Flask server is running.";
    setStatus("Backend unavailable. Start Flask and refresh this page.");
  }
}

function renderProducts(products) {
  productsElement.replaceChildren();

  if (products.length === 0) {
    productsElement.textContent =
      "No products saved yet. Scan a product with PriceWhisper first.";
    return;
  }

  for (const product of products) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-card";

    if (product.id === selectedProductId) {
      button.classList.add("selected");
    }

    const name = document.createElement("h3");
    name.textContent = product.name || "Unknown product";

    const site = document.createElement("p");
    site.textContent = product.site || "Unknown website";

    const price = document.createElement("p");
    price.className = "product-price";
    price.textContent = formatPrice(
      product.current_price,
      product.currency
    );

    const date = document.createElement("p");
    date.textContent = product.updated_at
      ? `Last scanned: ${new Date(product.updated_at).toLocaleString()}`
      : "Scan date unavailable";

    
    const change = document.createElement("p");
    change.className = "price-change";

    const difference = Number(product.price_difference);
    const percentage = Number(product.price_percentage_change);

    switch (product.price_change_status) {
      case "price_drop":
        change.classList.add("price-drop");
        change.textContent =
          `↓ Price dropped by ${formatPrice(
            Math.abs(difference).toFixed(2),
            product.currency
          )}` +
          (Number.isFinite(percentage)
            ? ` (${Math.abs(percentage).toFixed(2)}%)`
            : "");
        break;

      case "price_increase":
        change.classList.add("price-increase");
        change.textContent =
          `↑ Price increased by ${formatPrice(
            difference.toFixed(2),
            product.currency
          )}` +
          (Number.isFinite(percentage)
            ? ` (${percentage.toFixed(2)}%)`
            : "");
        break;

      case "unchanged":
        change.classList.add("price-unchanged");
        change.textContent = "Price unchanged since previous scan.";
        break;

      case "first_observation":
        change.textContent = "First price recorded.";
        break;

      case "currency_mismatch":
        change.textContent = "Currency changed; comparison skipped.";
        break;

      default:
        change.textContent = "Price change unavailable.";
    }

    button.append(name, site, price, change, date);
    button.addEventListener("click", () => selectProduct(product));
    productsElement.appendChild(button);

  }
}

async function selectProduct(product) {
  selectedProductId = product.id;
  renderProducts(savedProducts);

  historyTitle.textContent = `Price history: ${product.name}`;
  historyDescription.textContent =
    "Recorded observations for this saved product.";
  historyDetails.textContent = "Loading price history...";

  try {
    const response = await fetch(
      `${API_URL}/api/products/${product.id}/history`
    );

    if (!response.ok) {
      throw new Error(`API returned HTTP ${response.status}`);
    }

    const result = await response.json();
    renderHistory(result.history || [], product);
  } catch (error) {
    console.error("Could not load price history:", error);
    clearChart("Could not load price history.");
    historyDetails.textContent =
      "Could not load history. Check the Flask server.";
  }
}

function clearChart(message) {
  const context = chart.getContext("2d");
  context.clearRect(0, 0, chart.width, chart.height);
  context.font = "14px Arial";
  context.fillStyle = "#706d83";
  context.fillText(message, 12, 30);
}

function renderHistory(history, product) {
  const observations = history
    .map(item => ({
      ...item,
      numeric: numericPrice(item.price),
      date: new Date(item.recorded_at)
    }))
    .filter(item =>
      item.numeric !== null && !Number.isNaN(item.date.getTime())
    );

  const currencies = [
    ...new Set(observations.map(item => item.currency).filter(Boolean))
  ];

  if (currencies.length > 1) {
    clearChart("Multiple currencies: convert them before comparing values.");
    historyDetails.textContent =
      `This product has observations in different currencies: ${currencies.join(", ")}. ` +
      "The chart is hidden to avoid a misleading comparison.";
    return;
  }

  if (observations.length === 0) {
    clearChart("No numeric price observations yet.");
    historyDetails.textContent =
      "Scan this product with a detectable price to start building its history.";
    return;
  }

  drawChart(observations);

  historyDetails.textContent =
    `${observations.length} recorded price observation(s). ` +
    `Latest recorded price: ${formatPrice(
      observations[observations.length - 1].price,
      observations[observations.length - 1].currency || product.currency
    )}.`;
}

function drawChart(points) {
  const context = chart.getContext("2d");
  const width = Math.max(chart.clientWidth, 320);
  const height = 280;
  const ratio = window.devicePixelRatio || 1;

  chart.width = width * ratio;
  chart.height = height * ratio;
  chart.style.height = `${height}px`;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const left = 64;
  const right = width - 20;
  const top = 20;
  const bottom = height - 48;
  const values = points.map(point => point.numeric);

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const padding = min === 0 ? 1 : min * 0.05;
    min = Math.max(0, min - padding);
    max += padding;
  } else {
    const padding = (max - min) * 0.12;
    min = Math.max(0, min - padding);
    max += padding;
  }

  const x = index =>
    points.length === 1
      ? (left + right) / 2
      : left + index * (right - left) / (points.length - 1);

  const y = value =>
    bottom - ((value - min) / (max - min)) * (bottom - top);

  context.font = "11px Arial";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let i = 0; i <= 4; i++) {
    const value = min + ((max - min) * i) / 4;
    const lineY = y(value);

    context.beginPath();
    context.strokeStyle = "#ece8f5";
    context.moveTo(left, lineY);
    context.lineTo(right, lineY);
    context.stroke();

    context.fillStyle = "#706d83";
    context.fillText(value.toFixed(2), left - 8, lineY);
  }

  context.beginPath();
  context.strokeStyle = "#7654d6";
  context.lineWidth = 2;

  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(x(index), y(point.numeric));
    } else {
      context.lineTo(x(index), y(point.numeric));
    }
  });

  context.stroke();

  points.forEach((point, index) => {
    context.beginPath();
    context.fillStyle = "#7654d6";
    context.arc(x(index), y(point.numeric), 4, 0, Math.PI * 2);
    context.fill();
  });

  context.fillStyle = "#706d83";
  context.textAlign = "center";
  context.textBaseline = "top";

  const labelIndices = [...new Set([
    0,
    Math.floor((points.length - 1) / 2),
    points.length - 1
  ])];

  for (const index of labelIndices) {
    context.fillText(
      points[index].date.toLocaleDateString(),
      x(index),
      bottom + 12
    );
  }
}

compareForm.addEventListener("submit", async event => {
  event.preventDefault();

  const query = searchInput.value.trim();

  if (query.length < 2) {
    comparisonResults.textContent = "Enter at least two characters.";
    return;
  }

  comparisonResults.textContent = "Searching saved products...";

  try {
    const response = await fetch(
      `${API_URL}/api/compare?q=${encodeURIComponent(query)}`
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Search failed.");
    }

    renderComparison(result);
  } catch (error) {
    console.error("Comparison search failed:", error);
    comparisonResults.textContent =
      error.message || "Could not search saved products.";
  }
});

function renderComparison(products) {
  comparisonResults.replaceChildren();

  if (products.length === 0) {
    comparisonResults.textContent =
      "No matching saved products found. Scan matching listings first, then try shared keywords.";
    return;
  }

  const note = document.createElement("p");
  note.className = "section-help";
  note.textContent =
    "Check product identity, condition, shipping, and currency before deciding which offer is cheapest.";
  comparisonResults.appendChild(note);

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const label of ["Product", "Store", "Recorded price"]) {
    makeCell(headerRow, label, "th");
  }

  head.appendChild(headerRow);
  table.appendChild(head);

  const body = document.createElement("tbody");

  for (const product of products) {
    const row = document.createElement("tr");

    makeCell(row, product.name);
    makeCell(row, product.site);
    makeCell(row, formatPrice(product.current_price, product.currency));

    body.appendChild(row);
  }

  table.appendChild(body);
  comparisonResults.appendChild(table);
}

window.addEventListener("resize", () => {
  if (selectedProductId === null) return;

  const product = savedProducts.find(item => item.id === selectedProductId);
  if (product) selectProduct(product);
});

loadProducts();
