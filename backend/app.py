import math
import re
import unicodedata
from difflib import SequenceMatcher
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

        columns = {
            row["name"]
            for row in db.execute("PRAGMA table_info(products)").fetchall()
        }

        if "target_price" not in columns:
            db.execute(
                "ALTER TABLE products ADD COLUMN target_price REAL"
            )

        if "target_currency" not in columns:
            db.execute(
                "ALTER TABLE products ADD COLUMN target_currency TEXT"
            )


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

    if not all(
        isinstance(value, str) and value.strip()
        for value in (name, site, url)
    ):
        return jsonify({
            "error": "name, site, and url are required."
        }), 400

    name = name.strip()
    site = site.strip()
    url = url.strip()
    currency = currency.strip() if isinstance(currency, str) else None

    if price is not None:
        price = str(price).strip() or None

    def numeric_price(value):
        if value is None:
            return None

        try:
            result = float(str(value).replace(",", "").strip())
            if result < 0:
                return None
            return result
        except (ValueError, TypeError):
            return None

    new_price = numeric_price(price)
    now = utc_now()

    price_change = {
        "status": "unavailable",
        "previous_price": None,
        "current_price": price,
        "difference": None,
        "percentage_change": None,
        "currency": currency
    }

    with get_db() as db:
        # Read the previous observation before updating the product.
        existing = db.execute(
            "SELECT * FROM products WHERE url = ?", (url,)
        ).fetchone()

        previous_price = None
        previous_currency = None

        if existing:
            previous = db.execute("""
                SELECT price, currency
                FROM price_history
                WHERE product_id = ?
                ORDER BY recorded_at DESC, id DESC
                LIMIT 1
            """, (existing["id"],)).fetchone()

            # Fall back to the saved product price if history is empty.
            if previous:
                previous_price = numeric_price(previous["price"])
                previous_currency = previous["currency"]
            else:
                previous_price = numeric_price(existing["current_price"])
                previous_currency = existing["currency"]

        if new_price is not None and previous_price is not None:
            same_currency = (
                (currency or "").upper()
                == (previous_currency or "").upper()
            )

            if same_currency:
                difference = round(new_price - previous_price, 2)

                if previous_price > 0:
                    percentage = round(
                        (difference / previous_price) * 100, 2
                    )
                else:
                    percentage = None

                if difference < 0:
                    status = "price_drop"
                elif difference > 0:
                    status = "price_increase"
                else:
                    status = "unchanged"

                price_change = {
                    "status": status,
                    "previous_price": previous_price,
                    "current_price": new_price,
                    "difference": difference,
                    "percentage_change": percentage,
                    "currency": currency
                }
            else:
                price_change["status"] = "currency_mismatch"
                price_change["previous_price"] = previous_price

        elif new_price is not None:
            price_change["status"] = "first_observation"

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

    
    target_alert = {
        "status": "not_set",
        "target_price": None,
        "target_currency": None,
        "current_price": new_price,
        "message": "No target price has been set."
    }

    if new_price is not None:
        with get_db() as db:
            target = db.execute("""
                SELECT target_price, target_currency
                FROM products
                WHERE id = ?
            """, (saved["id"],)).fetchone()

        if target and target["target_price"] is not None:
            target_price = float(target["target_price"])
            target_currency = target["target_currency"]

            target_alert = {
                "status": "currency_mismatch",
                "target_price": target_price,
                "target_currency": target_currency,
                "current_price": new_price,
                "message": "The target and current price use different currencies."
            }

            if (
                currency
                and target_currency
                and currency.upper() == target_currency.upper()
            ):
                reached = new_price <= target_price

                target_alert = {
                    "status": "reached" if reached else "not_reached",
                    "target_price": target_price,
                    "target_currency": target_currency,
                    "current_price": new_price,
                    "message": (
                        "Target price reached!"
                        if reached
                        else "Current price is still above your target."
                    )
                }

    return jsonify({
        "message": "Product saved successfully.",
        "product": dict(saved),
        "price_change": price_change,
        "target_alert": target_alert
    }), 201


@app.get("/api/products")
def list_products():
    def numeric_price(value):
        if value is None:
            return None

        try:
            result = float(str(value).replace(",", "").strip())
            if result >= 0 and math.isfinite(result):
                return result
            return None
        except (ValueError, TypeError):
            return None

    with get_db() as db:
        rows = db.execute("""
            SELECT *
            FROM products
            ORDER BY updated_at DESC
        """).fetchall()

        products = []

        for row in rows:
            product = dict(row)

            history = db.execute("""
                SELECT price, currency, recorded_at
                FROM price_history
                WHERE product_id = ?
                ORDER BY recorded_at DESC, id DESC
                LIMIT 2
            """, (product["id"],)).fetchall()

            product["previous_price"] = None
            product["price_change_status"] = "unavailable"
            product["price_difference"] = None
            product["price_percentage_change"] = None

            if history:
                latest = history[0]
                current_price = numeric_price(latest["price"])

                if len(history) == 1:
                    if current_price is not None:
                        product["price_change_status"] = "first_observation"

                else:
                    previous = history[1]
                    previous_price = numeric_price(previous["price"])

                    product["previous_price"] = previous["price"]

                    if current_price is not None and previous_price is not None:
                        same_currency = (
                            (latest["currency"] or "").upper()
                            == (previous["currency"] or "").upper()
                        )

                        if not same_currency:
                            product["price_change_status"] = "currency_mismatch"
                        else:
                            difference = round(
                                current_price - previous_price, 2
                            )

                            product["price_difference"] = difference

                            if previous_price > 0:
                                product["price_percentage_change"] = round(
                                    difference / previous_price * 100, 2
                                )

                            if difference < 0:
                                product["price_change_status"] = "price_drop"
                            elif difference > 0:
                                product["price_change_status"] = "price_increase"
                            else:
                                product["price_change_status"] = "unchanged"

            products.append(product)

    return jsonify(products)



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


@app.post("/api/products/<int:product_id>/target")
def set_target_price(product_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a valid JSON object."}), 400

    target_price = data.get("target_price")
    target_currency = data.get("target_currency")

    try:
        target_price = float(target_price)
        if not math.isfinite(target_price) or target_price < 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({
            "error": "Target price must be a valid non-negative number."
        }), 400

    if not isinstance(target_currency, str) or not target_currency.strip():
        return jsonify({"error": "Target currency is required."}), 400

    target_currency = target_currency.strip().upper()

    with get_db() as db:
        product = db.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,)
        ).fetchone()

        if product is None:
            return jsonify({"error": "Product not found."}), 404

        db.execute("""
            UPDATE products
            SET target_price = ?, target_currency = ?
            WHERE id = ?
        """, (target_price, target_currency, product_id))

    return jsonify({
        "message": "Target price saved successfully.",
        "product_id": product_id,
        "target_price": target_price,
        "target_currency": target_currency
    }), 200


@app.get("/api/products/<int:product_id>/target")
def get_target_price(product_id):
    with get_db() as db:
        product = db.execute("""
            SELECT id, name, target_price, target_currency
            FROM products
            WHERE id = ?
        """, (product_id,)).fetchone()

    if product is None:
        return jsonify({"error": "Product not found."}), 404

    return jsonify({
        "product_id": product["id"],
        "name": product["name"],
        "target_price": product["target_price"],
        "target_currency": product["target_currency"]
    }), 200




def normalize_product_text(text):
    """Normalize a title for more consistent text comparison."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(
        char for char in text
        if not unicodedata.combining(char)
    )
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def get_product_tokens(text):
    """Split a normalized title into useful comparison tokens."""
    ignored_words = {
        "the", "and", "for", "with", "from", "new",
        "official", "original", "best", "buy", "sale",
        "in", "on", "at", "by", "a", "an"
    }

    return {
        token
        for token in normalize_product_text(text).split()
        if token not in ignored_words
    }


def get_model_tokens(text):
    """Find tokens containing both letters and digits."""
    tokens = get_product_tokens(text)

    return {
        token for token in tokens
        if any(char.isalpha() for char in token)
        and any(char.isdigit() for char in token)
    }


def calculate_match_score(query, product_name):
    """Return a text similarity score between 0 and 1."""
    normalized_query = normalize_product_text(query)
    normalized_name = normalize_product_text(product_name)

    if not normalized_query or not normalized_name:
        return 0.0

    query_tokens = get_product_tokens(normalized_query)
    name_tokens = get_product_tokens(normalized_name)

    if not query_tokens or not name_tokens:
        return 0.0

    shared_tokens = query_tokens & name_tokens
    all_tokens = query_tokens | name_tokens

    token_similarity = len(shared_tokens) / len(all_tokens)

    title_similarity = SequenceMatcher(
        None,
        normalized_query,
        normalized_name
    ).ratio()

    query_models = get_model_tokens(normalized_query)
    name_models = get_model_tokens(normalized_name)
    shared_models = query_models & name_models

    # Matching model identifiers provide a strong additional signal.
    if shared_models:
        return min(
            1.0,
            0.65 + (0.20 * title_similarity)
            + (0.15 * token_similarity)
        )

    return (
        0.55 * token_similarity
        + 0.45 * title_similarity
    )


@app.get("/api/compare")
def compare_products():
    query = request.args.get("q", "").strip()

    if len(query) < 2:
        return jsonify({
            "error": "Enter at least two characters."
        }), 400

    with get_db() as db:
        rows = db.execute("""
            SELECT id, name, site, url, current_price,
                   currency, updated_at
            FROM products
            WHERE current_price IS NOT NULL
        """).fetchall()

    matches = []

    for row in rows:
        product = dict(row)

        score = calculate_match_score(
            query,
            product.get("name", "")
        )

        # Exclude very weak matches.
        if score < 0.25:
            continue

        product["match_score"] = round(score, 3)

        if score >= 0.70:
            product["match_confidence"] = "Likely match"
        elif score >= 0.40:
            product["match_confidence"] = "Possible match"
        else:
            product["match_confidence"] = "Weak match"

        matches.append(product)

    matches.sort(
        key=lambda product: (
            -product["match_score"],
            float(
                str(product["current_price"])
                .replace(",", "")
            )
        )
    )

    return jsonify(matches)

init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
