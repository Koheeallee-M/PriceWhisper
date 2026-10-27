# PriceWhisper

PriceWhisper is a browser extension project designed to help users compare product prices, record price changes, and make more informed purchasing decisions.

It combines a browser-based interface with a Python Flask backend and an SQLite database. The project also includes a basic regression-based price estimate to explore how historical observations can be used to assess possible future prices.

## Features

- **Product scanning:** Extracts product information and prices from supported shopping websites.
- **Price history:** Stores price observations so changes can be tracked over time.
- **Price comparison:** Provides basic comparisons using available product information.
- **Price targets:** Allows users to set a target price and check for alerts when a scan meets the target.
- **Price estimates:** Uses basic linear regression on recorded observations to estimate a possible future price.
- **Dashboard:** Displays saved products and their available price history.

Website compatibility and price extraction may vary depending on the site's page structure, currency formatting, and dynamic content.

## Technology Stack

- **Browser extension:** JavaScript, HTML, CSS, Chrome Extensions API (Manifest V3)
- **Backend:** Python and Flask
- **Database:** SQLite
- **Price estimation:** Basic linear regression

## How It Works

1. Open a supported product page in your browser.
2. Use the PriceWhisper extension to scan the product.
3. Save the product and its price observation.
4. Review saved products and available price history in the dashboard.
5. Where sufficient historical data is available, view a regression-based price estimate.

## Getting Started

### Requirements

- Google Chrome or a compatible Chromium-based browser
- Python installed on your computer
- Git, if you want to clone the repository

### 1. Download the project

Clone the repository:

```bash
git clone https://github.com/Koheeallee-M/PriceWhisper.git
cd PriceWhisper
```

Alternatively, download the repository as a ZIP file and extract it.

### 2. Install backend dependencies

Open a terminal in the project directory and run:

```bash
cd backend
python -m pip install -r requirements.txt
```

### 3. Start the backend

From the `backend` directory, run:

```bash
python app.py
```

The local Flask server should start at the address shown in the terminal, typically `http://127.0.0.1:5000`.

Keep the backend running while using features that depend on it.

### 4. Load the browser extension

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Microsoft Edge.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the project's `extension` folder containing `manifest.json`.
5. Open a supported shopping product page and test the extension.

## Limitations

- Price extraction is dependent on individual shopping websites and may not work on every product page.
- Price estimates are experimental and based on available historical observations. They are not guaranteed forecasts or financial advice.
- Price-target alerts are checked through the application's scanning workflow; continuous background price monitoring is not guaranteed.
- The current setup uses a local backend and SQLite database. Data is not automatically shared between different users or devices.
- A local installation does not provide a publicly hosted backend.

## Future Improvements

Potential future work includes a shared price-history service, broader website support, improved price-estimation methods, and more robust alerting.

## Project Status

PriceWhisper is a personal development project built to explore browser extension development, web data extraction, backend APIs, price-history storage, and basic predictive analysis.

## License

No license has been specified yet. Unless a license is added to the repository, reuse and redistribution are subject to the applicable default copyright rules.
