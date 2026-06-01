"""
Publisher Pricing API Server
Extension → this server → Trino

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Production:
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
"""

from __future__ import annotations

import os
import re
import time
import logging
from functools import lru_cache
from typing import Optional

import requests
import trino
from fastapi import FastAPI, HTTPException, Query, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from jose.backends import RSAKey

# ─── Config ─────────────────────────────────────────────────────────────────
TRINO_HOST       = os.getenv("TRINO_HOST",       "trino.data-infra")
TRINO_PORT       = int(os.getenv("TRINO_PORT",   "8443"))
TRINO_CATALOG    = os.getenv("TRINO_CATALOG",    "hafez")
TRINO_SCHEMA     = os.getenv("TRINO_SCHEMA",     "data_operation")
TRINO_TABLE      = os.getenv("TRINO_TABLE",      "nashereman")
TRINO_HTTP_SCHEME = os.getenv("TRINO_HTTP_SCHEME", "https")
TRINO_VERIFY_SSL = os.getenv("TRINO_VERIFY_SSL", "false").lower() not in ("false", "0", "no")
TRINO_USER       = os.getenv("TRINO_USER",       "publisher-pricing-api")

KEYCLOAK_BASE    = os.getenv("KEYCLOAK_BASE", "https://heimdall.yektanet.tech")
KEYCLOAK_REALM   = os.getenv("KEYCLOAK_REALM", "Tech")
OIDC_ISSUER      = f"{KEYCLOAK_BASE}/realms/{KEYCLOAK_REALM}"
JWKS_URL         = f"{OIDC_ISSUER}/protocol/openid-connect/certs"

# If true, verify the incoming Bearer token from the extension before querying.
# Disable only in dev/testing.
VERIFY_TOKEN     = os.getenv("VERIFY_TOKEN", "true").lower() not in ("false", "0", "no")

# Allowed Chrome extension IDs (comma-separated).  Empty string = allow all.
ALLOWED_ORIGINS  = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else []

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Publisher Pricing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # internal network — all origins OK; tighten if needed
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── JWKS cache (refreshed every hour) ──────────────────────────────────────
_jwks_cache: dict = {}
_jwks_fetched_at: float = 0.0
_JWKS_TTL = 3600


def _get_jwks() -> dict:
    global _jwks_cache, _jwks_fetched_at
    if time.time() - _jwks_fetched_at > _JWKS_TTL:
        try:
            r = requests.get(JWKS_URL, timeout=5, verify=False)
            r.raise_for_status()
            _jwks_cache = r.json()
            _jwks_fetched_at = time.time()
            log.info("JWKS refreshed (%d keys)", len(_jwks_cache.get("keys", [])))
        except Exception as e:
            log.warning("Could not refresh JWKS: %s", e)
            if not _jwks_cache:
                raise HTTPException(status_code=503, detail="Cannot reach Keycloak to validate token")
    return _jwks_cache


def _verify_token(token: str) -> dict:
    """Decode and validate a Keycloak JWT; return the claims dict."""
    jwks = _get_jwks()
    try:
        claims = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},  # trino client has no fixed audience
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")
    if claims.get("iss") != OIDC_ISSUER:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token issuer")
    return claims


def get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


# ─── Trino helper ────────────────────────────────────────────────────────────

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_APP_ID_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def _trino_conn(token: Optional[str] = None) -> trino.dbapi.Connection:
    """
    Open a Trino connection.  If `token` is provided it is passed as the
    Authorization header (useful for user-level access control in Trino).
    Otherwise the API server's own service user is used.
    """
    http_headers = {}
    if token:
        http_headers["Authorization"] = f"Bearer {token}"

    return trino.dbapi.connect(
        host=TRINO_HOST,
        port=TRINO_PORT,
        http_scheme=TRINO_HTTP_SCHEME,
        http_headers=http_headers if http_headers else None,
        user=TRINO_USER,
        verify=TRINO_VERIFY_SSL,
        request_timeout=60,
    )


def _run_query(sql: str, token: Optional[str] = None) -> tuple[list[str], list[list]]:
    conn = _trino_conn(token)
    cur = conn.cursor()
    cur.execute(sql)
    columns = [d[0].lower() for d in cur.description]
    rows = cur.fetchall()
    conn.close()
    return columns, rows


# ─── Response builder ────────────────────────────────────────────────────────

def _rows_to_publisher_data(columns: list[str], rows: list[list]) -> dict:
    """
    Convert flat Trino rows into the same structure as publisher_data.json:
    {
      "publisher_name": "...",
      "positions": {
        "<positionId>": {
          "desc": "...",
          "type": "...",
          "rows": [[date, cost, pv, device], ...]
        }
      }
    }
    """
    ci = {c: i for i, c in enumerate(columns)}
    positions: dict = {}
    publisher_name = ""

    for row in rows:
        pos_id = str(row[ci["position_id"]] if row[ci["position_id"]] is not None else "")
        if not pos_id:
            continue
        publisher_name = str(row[ci.get("publisher_name", -1)] or publisher_name) if "publisher_name" in ci else publisher_name
        date   = str(row[ci["date"]]                 or "")
        cost   = float(row[ci["total_adv_cost"]]     or 0)
        pv     = float(row[ci["page_views"]]          or 0)
        device = str(row[ci["device"]]).lower() if "device" in ci and row[ci["device"]] is not None else None
        desc   = str(row[ci.get("description", -1)]   or "") if "description"   in ci else ""
        ptype  = str(row[ci.get("position_type", -1)] or "") if "position_type" in ci else ""

        if pos_id not in positions:
            positions[pos_id] = {"desc": desc, "type": ptype, "rows": []}
        positions[pos_id]["rows"].append([date, cost, pv, device])

    return {"publisher_name": publisher_name, "positions": positions}


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/publisher/{app_id}")
def get_publisher_data(
    app_id: str,
    from_date: str = Query(..., alias="from"),
    to_date:   str = Query(..., alias="to"),
    request:   Request = None,
):
    """
    Return historical RPM data for a publisher.

    Query params:
        from  ISO date, e.g. 2024-01-01
        to    ISO date, e.g. 2024-12-31

    Returns data in the same shape as publisher_data.json so the extension
    can pass it straight into runAnalysis().
    """

    # ── input validation ─────────────────────────────────────────
    if not _APP_ID_RE.match(app_id):
        raise HTTPException(status_code=400, detail="Invalid app_id")
    if not _DATE_RE.match(from_date) or not _DATE_RE.match(to_date):
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from must be ≤ to")

    # ── auth ─────────────────────────────────────────────────────
    token = get_bearer_token(request)
    if VERIFY_TOKEN:
        if not token:
            raise HTTPException(status_code=401, detail="Authorization header missing")
        _verify_token(token)

    # ── query ────────────────────────────────────────────────────
    sql = (
        f"SELECT app_id, position_id, date, total_adv_cost, page_views, "
        f"       device, description, position_type, publisher_name "
        f"FROM {TRINO_CATALOG}.{TRINO_SCHEMA}.{TRINO_TABLE} "
        f"WHERE app_id = '{app_id}' "
        f"  AND date >= '{from_date}' "
        f"  AND date <= '{to_date}'"
    )

    try:
        # Pass token to Trino so Trino-level ACL still applies if configured
        columns, rows = _run_query(sql, token=token)
    except Exception as e:
        log.error("Trino query failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Database error: {e}")

    if not rows:
        raise HTTPException(status_code=404, detail="No data found for this publisher and date range")

    return _rows_to_publisher_data(columns, rows)


@app.get("/publishers")
def list_publishers(
    request: Request,
    search: str = Query("", description="Filter by app_id prefix or publisher name"),
    limit:  int = Query(50, ge=1, le=500),
):
    """
    Return a list of distinct publishers (for the comparison feature).
    """
    token = get_bearer_token(request)
    if VERIFY_TOKEN:
        if not token:
            raise HTTPException(status_code=401, detail="Authorization header missing")
        _verify_token(token)

    where = ""
    if search:
        s = search.replace("'", "''")
        where = f"WHERE app_id LIKE '%{s}%' OR lower(publisher_name) LIKE '%{s.lower()}%'"

    sql = (
        f"SELECT DISTINCT app_id, publisher_name "
        f"FROM {TRINO_CATALOG}.{TRINO_SCHEMA}.{TRINO_TABLE} "
        f"{where} "
        f"ORDER BY publisher_name "
        f"LIMIT {limit}"
    )

    try:
        columns, rows = _run_query(sql, token=token)
    except Exception as e:
        log.error("Trino query failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Database error: {e}")

    ci = {c: i for i, c in enumerate(columns)}
    return [
        {"app_id": str(r[ci["app_id"]] or ""), "publisher_name": str(r[ci["publisher_name"]] or "")}
        for r in rows
    ]
