"""
QuickBooks Online A/R Aging Report
Pull open invoices via QBO REST API, group into aging buckets, display formatted table.

Setup:
  1. Create an app at https://developer.intuit.com
  2. Set redirect URI to http://localhost:8085/callback
  3. Copy Client ID and Client Secret
  4. Run: python qbo_aging.py --setup
  5. After initial auth, run: python qbo_aging.py
"""

import argparse
import json
import logging
import os
import sys
import time
import webbrowser
import urllib.parse
from datetime import datetime, date
from pathlib import Path as _Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

try:
    import requests
except ImportError:
    print("Missing dependency: requests")
    print("Install with: pip install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CREDENTIALS_FILE = Path(__file__).parent / ".qbo_credentials.json"
TOKEN_FILE = Path(__file__).parent / ".qbo_tokens.json"
LOG_FILE = Path(__file__).parent / "qbo_aging.log"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("qbo_aging")

AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
REDIRECT_URI = "https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl"
SCOPES = "com.intuit.quickbooks.accounting"

# Production base — switch to sandbox for testing
API_BASE_PROD = "https://quickbooks.api.intuit.com"
API_BASE_SANDBOX = "https://sandbox-quickbooks.api.intuit.com"


def get_api_base(sandbox: bool) -> str:
    return API_BASE_SANDBOX if sandbox else API_BASE_PROD


# ---------------------------------------------------------------------------
# Credentials (client_id, client_secret, realm_id)
# ---------------------------------------------------------------------------

def save_credentials(client_id: str, client_secret: str, realm_id: str):
    CREDENTIALS_FILE.write_text(json.dumps({
        "client_id": client_id,
        "client_secret": client_secret,
        "realm_id": realm_id,
    }, indent=2))
    print(f"Credentials saved to {CREDENTIALS_FILE}")


def load_credentials() -> dict:
    if not CREDENTIALS_FILE.exists():
        print("No credentials found. Run: python qbo_aging.py --setup")
        sys.exit(1)
    return json.loads(CREDENTIALS_FILE.read_text())


# ---------------------------------------------------------------------------
# Token persistence + refresh
# ---------------------------------------------------------------------------

def save_tokens(tokens: dict):
    tokens["saved_at"] = time.time()
    TOKEN_FILE.write_text(json.dumps(tokens, indent=2))


def load_tokens() -> dict | None:
    if not TOKEN_FILE.exists():
        return None
    return json.loads(TOKEN_FILE.read_text())


def exchange_code_for_tokens(code: str, creds: dict) -> dict:
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }, auth=(creds["client_id"], creds["client_secret"]), headers={
        "Accept": "application/json",
    })
    resp.raise_for_status()
    tokens = resp.json()
    save_tokens(tokens)
    return tokens


def refresh_tokens(creds: dict, tokens: dict) -> dict:
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "refresh_token",
        "refresh_token": tokens["refresh_token"],
    }, auth=(creds["client_id"], creds["client_secret"]), headers={
        "Accept": "application/json",
    })
    resp.raise_for_status()
    new_tokens = resp.json()
    save_tokens(new_tokens)
    return new_tokens


def get_valid_tokens(creds: dict) -> dict:
    """Load tokens and refresh if expired (access_token ~3600s)."""
    tokens = load_tokens()
    if tokens is None:
        print("No tokens found. Run: python qbo_aging.py --auth")
        sys.exit(1)

    saved_at = tokens.get("saved_at", 0)
    expires_in = tokens.get("expires_in", 3600)
    elapsed = time.time() - saved_at

    if elapsed >= (expires_in - 120):  # refresh 2 min before expiry
        print("Access token expired, refreshing...")
        tokens = refresh_tokens(creds, tokens)
        print("Token refreshed successfully.")

    return tokens


# ---------------------------------------------------------------------------
# OAuth 2.0 browser flow with local callback server
# ---------------------------------------------------------------------------

class OAuthCallbackHandler(BaseHTTPRequestHandler):
    """Captures the authorization code from QBO redirect."""
    auth_code = None
    realm_id = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            OAuthCallbackHandler.auth_code = params["code"][0]
            OAuthCallbackHandler.realm_id = params.get("realmId", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>Authorization successful! You can close this tab.</h2>")
        else:
            error = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(f"<h2>Authorization failed: {error}</h2>".encode())

    def log_message(self, format, *args):
        pass  # suppress server logs


def run_oauth_flow(creds: dict) -> dict:
    """Open browser for QBO auth, user pastes redirect URL back, exchange for tokens."""
    params = urllib.parse.urlencode({
        "client_id": creds["client_id"],
        "scope": SCOPES,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "state": "qbo_aging",
    })
    auth_url = f"{AUTH_URL}?{params}"

    print(f"\nOpening browser for QuickBooks authorization...")
    print(f"If the browser doesn't open, visit:\n{auth_url}\n")
    webbrowser.open(auth_url)

    print("After authorizing, you'll be redirected to a page.")
    print("Copy the FULL URL from your browser's address bar and paste it here.\n")
    redirect_url = input("Paste redirect URL: ").strip()

    # Parse code and realmId from the pasted URL
    parsed = urllib.parse.urlparse(redirect_url)
    query_params = urllib.parse.parse_qs(parsed.query)

    code = query_params.get("code", [None])[0]
    realm_id = query_params.get("realmId", [None])[0]

    if not code:
        print("Could not find authorization code in that URL.")
        sys.exit(1)

    if realm_id:
        creds["realm_id"] = realm_id
        save_credentials(creds["client_id"], creds["client_secret"], creds["realm_id"])
        print(f"Realm ID updated: {creds['realm_id']}")

    tokens = exchange_code_for_tokens(code, creds)
    print("Authorization complete. Tokens saved.")
    return tokens


# ---------------------------------------------------------------------------
# QBO API calls
# ---------------------------------------------------------------------------

def qbo_query(sql: str, creds: dict, tokens: dict, sandbox: bool) -> list:
    """Execute a QBO query and return all entities, handling pagination."""
    base = get_api_base(sandbox)
    realm_id = creds["realm_id"]
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "Accept": "application/json",
    }

    all_entities = []
    start_position = 1
    page_size = 1000

    while True:
        paged_sql = f"{sql} STARTPOSITION {start_position} MAXRESULTS {page_size}"
        url = f"{base}/v3/company/{realm_id}/query"
        params = {"query": paged_sql, "minorversion": "75"}
        resp = requests.get(url, params=params, headers=headers)
        intuit_tid = resp.headers.get("intuit_tid", "N/A")
        log.info(f"QBO query | status={resp.status_code} | intuit_tid={intuit_tid}")

        if resp.status_code == 401:
            log.warning(f"401 Unauthorized (intuit_tid={intuit_tid}), refreshing token...")
            tokens = refresh_tokens(creds, tokens)
            headers["Authorization"] = f"Bearer {tokens['access_token']}"
            resp = requests.get(url, params=params, headers=headers)
            intuit_tid = resp.headers.get("intuit_tid", "N/A")
            log.info(f"QBO query retry | status={resp.status_code} | intuit_tid={intuit_tid}")

        if not resp.ok:
            log.error(f"API error {resp.status_code} | intuit_tid={intuit_tid} | body={resp.text}")
            resp.raise_for_status()
        data = resp.json()

        query_response = data.get("QueryResponse", {})
        entities = query_response.get("Invoice", [])
        if not entities:
            break

        all_entities.extend(entities)
        if len(entities) < page_size:
            break
        start_position += page_size

    return all_entities


def fetch_open_invoices(creds: dict, tokens: dict, sandbox: bool) -> list[dict]:
    """Fetch all open invoices (Balance > 0) from QBO."""
    sql = "SELECT * FROM Invoice WHERE Balance > '0' ORDERBY DueDate"
    raw_invoices = qbo_query(sql, creds, tokens, sandbox)

    today = date.today()
    invoices = []

    for inv in raw_invoices:
        customer_name = inv.get("CustomerRef", {}).get("name", "Unknown")
        doc_number = inv.get("DocNumber", "N/A")
        txn_date_str = inv.get("TxnDate", "")
        due_date_str = inv.get("DueDate", txn_date_str)
        balance = float(inv.get("Balance", 0))

        # Parse dates
        try:
            invoice_date = datetime.strptime(txn_date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            invoice_date = today
        try:
            due_date = datetime.strptime(due_date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            due_date = invoice_date

        days_outstanding = (today - due_date).days

        invoices.append({
            "customer": customer_name,
            "invoice_num": doc_number,
            "invoice_date": invoice_date,
            "due_date": due_date,
            "balance": balance,
            "days_outstanding": days_outstanding,
        })

    return invoices


# ---------------------------------------------------------------------------
# Aging buckets
# ---------------------------------------------------------------------------

BUCKETS = [
    ("Current", lambda d: d <= 0),
    ("1-30", lambda d: 1 <= d <= 30),
    ("31-60", lambda d: 31 <= d <= 60),
    ("61-90", lambda d: 61 <= d <= 90),
    ("90+", lambda d: d > 90),
]


def classify_bucket(days_outstanding: int) -> str:
    for name, test in BUCKETS:
        if test(days_outstanding):
            return name
    return "90+"


def build_aging_report(invoices: list[dict]) -> dict:
    """Group invoices into aging buckets and compute totals."""
    buckets = {name: [] for name, _ in BUCKETS}

    for inv in invoices:
        bucket = classify_bucket(inv["days_outstanding"])
        buckets[bucket].append(inv)

    return buckets


# ---------------------------------------------------------------------------
# Formatted output
# ---------------------------------------------------------------------------

def format_currency(amount: float) -> str:
    return f"${amount:,.2f}"


def print_aging_report(buckets: dict):
    all_invoices = []
    for bucket_invoices in buckets.values():
        all_invoices.extend(bucket_invoices)

    if not all_invoices:
        print("\nNo open invoices found.")
        return

    # Column widths
    col_cust = max(len("Customer"), max(len(i["customer"]) for i in all_invoices))
    col_inv = max(len("Invoice #"), max(len(str(i["invoice_num"])) for i in all_invoices))
    col_date = 12  # YYYY-MM-DD + padding
    col_due = 12
    col_bal = 14
    col_days = 8
    col_bucket = 8

    header = (
        f"{'Customer':<{col_cust}}  "
        f"{'Invoice #':<{col_inv}}  "
        f"{'Inv Date':<{col_date}}"
        f"{'Due Date':<{col_due}}"
        f"{'Balance':>{col_bal}}  "
        f"{'Days':>{col_days}}  "
        f"{'Bucket':<{col_bucket}}"
    )
    separator = "-" * len(header)

    print(f"\n{'A/R AGING REPORT':^{len(header)}}")
    print(f"{'As of ' + str(date.today()):^{len(header)}}")
    print(separator)
    print(header)
    print(separator)

    for bucket_name, _ in BUCKETS:
        bucket_invoices = buckets[bucket_name]
        if not bucket_invoices:
            continue

        # Sort by days outstanding descending within bucket
        bucket_invoices.sort(key=lambda i: i["days_outstanding"], reverse=True)

        for inv in bucket_invoices:
            print(
                f"{inv['customer']:<{col_cust}}  "
                f"{inv['invoice_num']:<{col_inv}}  "
                f"{str(inv['invoice_date']):<{col_date}}"
                f"{str(inv['due_date']):<{col_due}}"
                f"{format_currency(inv['balance']):>{col_bal}}  "
                f"{inv['days_outstanding']:>{col_days}}  "
                f"{bucket_name:<{col_bucket}}"
            )

    print(separator)

    # Bucket summary
    print(f"\n{'AGING SUMMARY':^{len(header)}}")
    print(separator)
    print(f"{'Bucket':<12} {'# Invoices':>12} {'Total Balance':>16}")
    print("-" * 42)

    grand_total = 0.0
    grand_count = 0

    for bucket_name, _ in BUCKETS:
        bucket_invoices = buckets[bucket_name]
        bucket_total = sum(i["balance"] for i in bucket_invoices)
        count = len(bucket_invoices)
        grand_total += bucket_total
        grand_count += count
        print(f"{bucket_name:<12} {count:>12} {format_currency(bucket_total):>16}")

    print("-" * 42)
    print(f"{'TOTAL':<12} {grand_count:>12} {format_currency(grand_total):>16}")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_setup():
    """Interactive setup: collect client credentials."""
    print("=== QuickBooks Online Setup ===\n")
    print("1. Go to https://developer.intuit.com and create/select your app")
    print("2. Under Keys & credentials, copy Client ID and Client Secret")
    print(f"3. Add redirect URI: {REDIRECT_URI}\n")

    client_id = input("Client ID: ").strip()
    client_secret = input("Client Secret: ").strip()

    if not all([client_id, client_secret]):
        print("Client ID and Client Secret are required.")
        sys.exit(1)

    save_credentials(client_id, client_secret, "")
    print("\nSetup complete. Now run: python qbo_aging.py --auth")
    print("(Realm ID will be captured automatically during authorization.)")


def cmd_auth():
    """Run OAuth browser flow."""
    creds = load_credentials()
    run_oauth_flow(creds)


def cmd_report(sandbox: bool):
    """Fetch invoices and print aging report."""
    creds = load_credentials()
    tokens = get_valid_tokens(creds)

    env_label = "SANDBOX" if sandbox else "PRODUCTION"
    print(f"Fetching open invoices from QBO ({env_label})...")

    invoices = fetch_open_invoices(creds, tokens, sandbox)
    print(f"Found {len(invoices)} open invoice(s).")

    buckets = build_aging_report(invoices)
    print_aging_report(buckets)


def main():
    parser = argparse.ArgumentParser(description="QuickBooks Online A/R Aging Report")
    parser.add_argument("--setup", action="store_true", help="Configure QBO credentials")
    parser.add_argument("--auth", action="store_true", help="Run OAuth 2.0 authorization flow")
    parser.add_argument("--sandbox", action="store_true", help="Use QBO sandbox environment")
    args = parser.parse_args()

    if args.setup:
        cmd_setup()
    elif args.auth:
        cmd_auth()
    else:
        cmd_report(sandbox=args.sandbox)


if __name__ == "__main__":
    main()
