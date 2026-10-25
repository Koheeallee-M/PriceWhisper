
from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)

DATABASE = Path(__file__).with_name("pricewhisper.db")


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                site TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                current_price TEXT,
                currency TEXT,
                updated_at TEXT NOT NULL
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                price TEXT NOT NULL,
                currency TEXT,
                recorded_at TEXT NOT NULL,
                FOREIGN KEY (product_id)
                    REFERENCES products(id)
            )
        """)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "app": "PriceWhisper API"
    })


@app.post("/api/products")
def save_product():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a valid JSON object."}), 400

    name = data.get("name")
    site = data.get("site")
    url = data.get("url")
    price = data.get("price")
    currency = data.get("currency")

    if not all(isinstance(value, str) and value.strip()
               for value in (name, site, url)):
        return jsonify({
            "error": "name, site, and url are required."
        }), 400

    name = name.strip()
    site = site.strip()
    url = url.strip()
    currency = currency.strip() if isinstance(currency, str) else None

    if price is not None:
        price = str(price).strip() or None

    now = utc_now()

    with get_db() as db:
        db.execute("""
            INSERT INTO products
                (name, site, url, current_price, currency, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                name = excluded.name,
                site = excluded.site,
                current_price = excluded.current_price,
                currency = excluded.currency,
                updated_at = excluded.updated_at
        """, (name, site, url, price, currency, now))

        product = db.execute(
            "SELECT * FROM products WHERE url = ?", (url,)
        ).fetchone()

        if price is not None:
            db.execute("""
                INSERT INTO price_history
                    (product_id, price, currency, recorded_at)
                VALUES (?, ?, ?, ?)
            """, (product["id"], price, currency, now))

        saved = db.execute(
            "SELECT * FROM products WHERE id = ?",
            (product["id"],)
        ).fetchone()

    return jsonify({
        "message": "Product saved successfully.",
        "product": dict(saved)
    }), 201


@app.get("/api/products")
def list_products():
    with get_db() as db:
        products = db.execute("""
            SELECT * FROM products
            ORDER BY updated_at DESC
        """).fetchall()

    return jsonify([dict(product) for product in products])


@app.get("/api/products/<int:product_id>/history")
def product_history(product_id):
    with get_db() as db:
        product = db.execute(
            "SELECT id, name, url FROM products WHERE id = ?",
            (product_id,)
        ).fetchone()

        if product is None:
            return jsonify({"error": "Product not found."}), 404

        history = db.execute("""
            SELECT price, currency, recorded_at
            FROM price_history
            WHERE product_id = ?
            ORDER BY recorded_at ASC
        """, (product_id,)).fetchall()

    return jsonify({
        "product": dict(product),
        "history": [dict(item) for item in history]
    })


@app.get("/api/compare")
def compare_products():
    query = request.args.get("q", "").strip()
    terms = query.split()

    if not terms:
        return jsonify({"error": "Enter a product name or keywords."}), 400

    # Every search term must appear somewhere in the product name.
    conditions = " AND ".join(
        ["LOWER(name) LIKE ?" for _ in terms]
    )
    parameters = [f"%{term.lower()}%" for term in terms]

    with get_db() as db:
        rows = db.execute(
            f"""
            SELECT id, name, site, url, current_price, currency, updated_at
            FROM products
            WHERE current_price IS NOT NULL
              AND {conditions}
            ORDER BY CAST(
                REPLACE(current_price, ',', '') AS REAL
            ) ASC
            """,
            parameters
        ).fetchall()

    return jsonify([dict(row) for row in rows])

init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
