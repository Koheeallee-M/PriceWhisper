const scanButton = document.getElementById("scan-button");
const productTitle = document.getElementById("product-title");
const productPrice = document.getElementById("product-price");
const productMessage = document.getElementById("product-message");

scanButton.addEventListener("click", () => {
    productTitle.textContent = "PriceWhisper is ready";
    productPrice.textContent = "Let's find a deal";
    productMessage.textContent =
    "Product detection TBA";

    scanButton.textContent ="Ready to scan";

});