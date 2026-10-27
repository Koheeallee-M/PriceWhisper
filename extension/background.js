
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("PriceWhisper installed successfully.");
  } else if (details.reason === "update") {
    console.log("PriceWhisper updated successfully.");
  }
});
