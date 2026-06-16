#!/usr/bin/env python3
"""
CIMB CFO Agent — Synthetic Data Generator (PoC v2)

Reads: source/derived/catalog/products.json
Outputs: workspace/w04/supabase/migrations/0002_seed_data.sql

Generates 12 months of realistic data for Ahmad Bakri / Sunrise Trading Sdn Bhd,
mapping to all 25 tables defined in 0001_initial_schema.sql.

Reference: goals/architecture-v2.md §4 + goals/demo-storyboard-v2.md (state variables).
"""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

# Seeded for reproducibility
random.seed(20260615)

# =============================================================================
# DEMO CONSTANTS
# =============================================================================

CUSTOMER_ID = "ahmad_01"
CUSTOMER_LEGAL_NAME = "Sunrise Trading Sdn Bhd"
CUSTOMER_TRADE_NAME = "Sunrise Wines & Provisions"
PRIMARY_CONTACT = "Ahmad Bakri"

DEMO_BACKFILL_START = date(2025, 6, 1)   # 12 months of history
DEMO_BACKFILL_END = date(2026, 6, 7)     # day before Step 1
DEMO_CURRENT_DATE = date(2026, 6, 8)     # Step 1 = Monday 8 Jun
KL_TZ_OFFSET = "+08:00"                  # Asia/Kuala_Lumpur

PROJECT_ROOT = Path(__file__).resolve().parents[3]  # ada_projects/CIMB
CATALOG_FILE = PROJECT_ROOT / "source" / "derived" / "catalog" / "products.json"
OUTPUT_FILE = PROJECT_ROOT / "workspace" / "w04" / "supabase" / "migrations" / "0002_seed_data.sql"

# =============================================================================
# SQL EMITTER HELPERS
# =============================================================================

_sql_chunks: list[str] = []


def emit(text: str) -> None:
    _sql_chunks.append(text)


def quote(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float, Decimal)):
        return str(v)
    if isinstance(v, (datetime,)):
        return f"'{v.isoformat()}'"
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    if isinstance(v, list):
        if not v:
            return "ARRAY[]::TEXT[]"
        escaped = ",".join(quote(x) for x in v)
        return f"ARRAY[{escaped}]"
    if isinstance(v, dict):
        s = json.dumps(v).replace("'", "''")
        return f"'{s}'::JSONB"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def insert(table: str, columns: list[str], rows: list[dict]) -> None:
    if not rows:
        emit(f"-- {table}: 0 rows\n")
        return
    emit(f"-- {table}: {len(rows)} rows")
    emit(f"INSERT INTO {table} ({', '.join(columns)}) VALUES")
    parts = []
    for r in rows:
        vals = ", ".join(quote(r.get(c)) for c in columns)
        parts.append(f"  ({vals})")
    emit(",\n".join(parts) + ";\n")


def ts(d: date, hour: int = 9, minute: int = 0) -> str:
    return f"{d.isoformat()}T{hour:02d}:{minute:02d}:00{KL_TZ_OFFSET}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =============================================================================
# TABLE 1: bank_customers
# =============================================================================

def gen_customers() -> list[dict]:
    return [{
        "customer_id": CUSTOMER_ID,
        "legal_name": CUSTOMER_LEGAL_NAME,
        "trade_name": CUSTOMER_TRADE_NAME,
        "business_type_declared": "food_beverage_importer",
        "msic_code": "46306",  # MSIC: Wholesale of beverages
        "incorporation_date": date(2018, 3, 22),
        "employee_count_bucket_declared": "10_to_30",
        "annual_revenue_bucket_declared": "3m_to_8m",
        "registered_address": "Unit 5A, Plaza Kelana Jaya, Jalan SS7/13A, 47301 Petaling Jaya, Selangor",
        "primary_contact_name": PRIMARY_CONTACT,
        "primary_contact_role_declared": "Owner & Finance Lead",
        "primary_contact_phone": "+60123456789",
        "primary_contact_email": "ahmad@sunrisetrading.my",
        "preferred_language": "en",
        "timezone": "Asia/Kuala_Lumpur",
        "kyc_status": "verified",
        "kyc_declared_at": date(2024, 3, 15),
        "onboarded_at": ts(date(2024, 3, 15)),
        "source": "core_banking",
        "schema_version": 1,
        "created_at": ts(date(2024, 3, 15)),
        "updated_at": ts(DEMO_CURRENT_DATE),
    }]


# =============================================================================
# TABLE 2: bank_accounts
# =============================================================================

ACCOUNTS = [
    {"account_id": "acc_myr_current", "currency": "MYR", "type": "current", "product": "OCTO Biz Current Account", "is_primary": True},
    {"account_id": "acc_eur_holding", "currency": "EUR", "type": "current", "product": "Multi-Currency Account (EUR)", "is_primary": False},
    {"account_id": "acc_aud_holding", "currency": "AUD", "type": "current", "product": "Multi-Currency Account (AUD)", "is_primary": False},
    {"account_id": "acc_myr_fd_001", "currency": "MYR", "type": "fd", "product": "Fixed Deposit (MYR) 180d", "is_primary": False, "maturity": date(2026, 9, 30), "rate": 4.0},
]


def gen_accounts() -> list[dict]:
    rows = []
    for a in ACCOUNTS:
        rows.append({
            "account_id": a["account_id"],
            "customer_id": CUSTOMER_ID,
            "account_number_masked": f"****{random.randint(1000, 9999)}",
            "currency": a["currency"],
            "account_type": a["type"],
            "product_name": a["product"],
            "opened_date": date(2024, 3, 20),
            "closed_date": None,
            "status": "active",
            "is_primary": a["is_primary"],
            "maturity_date": a.get("maturity"),
            "interest_rate": a.get("rate"),
            "source": "core_banking",
            "schema_version": 1,
            "created_at": ts(date(2024, 3, 20)),
            "updated_at": ts(DEMO_CURRENT_DATE),
        })
    return rows


# =============================================================================
# COUNTERPARTIES (used for transactions)
# =============================================================================

COUNTERPARTIES = [
    # Suppliers
    {"id": "cp_lafont", "name": "Domaine Lafont", "raw_aliases": ["DOMAINE LAFONT SARL", "LAFONT D", "Domaine Lafont"], "type": "supplier", "country": "FR", "currency": "EUR", "industry": "winery", "freq": "monthly", "avg": 8200},
    {"id": "cp_wynns", "name": "Wynns Estate", "raw_aliases": ["WYNNS ESTATE PTY", "Wynns Coonawarra", "WYNNS COONAWARRA"], "type": "supplier", "country": "AU", "currency": "AUD", "industry": "winery", "freq": "monthly", "avg": 6300},
    {"id": "cp_kl_distributor", "name": "KL Premium Imports", "raw_aliases": ["KL PREMIUM IMPORTS SDN BHD"], "type": "supplier", "country": "MY", "currency": "MYR", "industry": "logistics", "freq": "monthly", "avg": 4500},
    # Customers (Ahmad's customers — restaurants/cafes)
    {"id": "cp_lumiere", "name": "Café Lumière", "raw_aliases": ["CAFE LUMIERE KL", "Cafe Lumiere", "LUMIERE CAFE SDN BHD"], "type": "customer", "country": "MY", "currency": "MYR", "industry": "f_and_b", "freq": "monthly", "avg": 8500},
    {"id": "cp_khalid", "name": "Restaurant Khalid", "raw_aliases": ["RESTAURANT KHALID", "Khalid Bistro"], "type": "customer", "country": "MY", "currency": "MYR", "industry": "f_and_b", "freq": "monthly", "avg": 12000},
    {"id": "cp_marble", "name": "The Marble Room", "raw_aliases": ["MARBLE ROOM SDN BHD", "THE MARBLE ROOM"], "type": "customer", "country": "MY", "currency": "MYR", "industry": "f_and_b", "freq": "monthly", "avg": 15500},
    {"id": "cp_swt_grand", "name": "Swiss-Garden Hotel", "raw_aliases": ["SWISS GARDEN HOTEL KL", "SWISS-GARDEN GROUP"], "type": "customer", "country": "MY", "currency": "MYR", "industry": "hospitality", "freq": "monthly", "avg": 22000},
    {"id": "cp_provence", "name": "Provence Restaurant", "raw_aliases": ["PROVENCE RESTAURANT", "Provence KL"], "type": "customer", "country": "MY", "currency": "MYR", "industry": "f_and_b", "freq": "quarterly", "avg": 18000},
    # Employees (payroll receivers — aggregated)
    {"id": "cp_payroll_batch", "name": "Payroll Batch", "raw_aliases": ["PAYROLL BATCH", "STAFF SALARY BATCH"], "type": "employee", "country": "MY", "currency": "MYR", "industry": None, "freq": "monthly", "avg": 80000},
    # Utilities / Tax / Rent
    {"id": "cp_tnb", "name": "Tenaga Nasional Bhd", "raw_aliases": ["TNB", "TENAGA NASIONAL"], "type": "utility", "country": "MY", "currency": "MYR", "industry": "utility", "freq": "monthly", "avg": 1800},
    {"id": "cp_air_selangor", "name": "Air Selangor", "raw_aliases": ["AIR SELANGOR"], "type": "utility", "country": "MY", "currency": "MYR", "industry": "utility", "freq": "monthly", "avg": 350},
    {"id": "cp_maxis", "name": "Maxis Berhad", "raw_aliases": ["MAXIS BERHAD", "MAXIS"], "type": "utility", "country": "MY", "currency": "MYR", "industry": "utility", "freq": "monthly", "avg": 950},
    {"id": "cp_landlord", "name": "Plaza Kelana Properties", "raw_aliases": ["PLAZA KELANA PROPERTIES SB", "PLAZA KELANA"], "type": "supplier", "country": "MY", "currency": "MYR", "industry": "real_estate", "freq": "monthly", "avg": 12000},
    {"id": "cp_lhdn", "name": "Lembaga Hasil Dalam Negeri", "raw_aliases": ["LHDN", "LEMBAGA HASIL DLM NEGERI"], "type": "tax_authority", "country": "MY", "currency": "MYR", "industry": "government", "freq": "quarterly", "avg": 18000},
    {"id": "cp_epf", "name": "EPF", "raw_aliases": ["EPF", "KWSP", "EMPLOYEES PROVIDENT FUND"], "type": "tax_authority", "country": "MY", "currency": "MYR", "industry": "government", "freq": "monthly", "avg": 9600},
    {"id": "cp_socso", "name": "SOCSO/PERKESO", "raw_aliases": ["SOCSO", "PERKESO", "SOCIAL SECURITY"], "type": "tax_authority", "country": "MY", "currency": "MYR", "industry": "government", "freq": "monthly", "avg": 1800},
]


def cp_by_id(cid: str) -> dict:
    return next(c for c in COUNTERPARTIES if c["id"] == cid)


def random_alias(cp: dict) -> str:
    return random.choice(cp["raw_aliases"])


# =============================================================================
# TABLE 4: bank_transactions (the big one)
# =============================================================================

class TxnGenerator:
    def __init__(self):
        self.txns: list[dict] = []
        self.next_id = 1

    def add(self, **kw) -> str:
        tid = f"txn_{self.next_id:06d}"
        self.next_id += 1
        kw.setdefault("transaction_id", tid)
        kw.setdefault("customer_id", CUSTOMER_ID)
        kw.setdefault("source", "core_banking")
        kw.setdefault("schema_version", 1)
        kw.setdefault("created_at", ts(kw["transaction_date"]))
        self.txns.append(kw)
        return tid


def gen_transactions() -> tuple[list[dict], list[date]]:
    g = TxnGenerator()
    all_dates: list[date] = []

    # Iterate month by month
    cur = DEMO_BACKFILL_START.replace(day=1)
    while cur <= DEMO_BACKFILL_END:
        month_start = cur
        # next month
        if cur.month == 12:
            nxt = date(cur.year + 1, 1, 1)
        else:
            nxt = date(cur.year, cur.month + 1, 1)
        month_end = min(nxt - timedelta(days=1), DEMO_BACKFILL_END)

        # ---- Monthly outflows ----

        # 1. Rent (1st of month, MYR 12,000, standing order)
        rent_date = month_start
        if rent_date <= DEMO_BACKFILL_END:
            g.add(
                account_id="acc_myr_current",
                transaction_date=rent_date,
                posted_at=ts(rent_date, 8, 0),
                value_date=rent_date,
                amount=Decimal("-12000.00"),
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_landlord")),
                description="Monthly rent — Unit 5A",
                channel="standing_order",
                reference=f"SO-RENT-{rent_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )
            all_dates.append(rent_date)

        # 2. Payroll batch (25th, MYR 80,000-85,000, batch)
        payroll_day = min(25, (month_end.day if month_end.month == cur.month else 28))
        payroll_date = date(cur.year, cur.month, payroll_day)
        if payroll_date <= DEMO_BACKFILL_END:
            amt = Decimal(str(round(random.uniform(78000, 84000), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=payroll_date,
                posted_at=ts(payroll_date, 14, 30),
                value_date=payroll_date,
                amount=-amt,
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_payroll_batch")),
                description=f"Monthly payroll batch — {payroll_date.strftime('%b %Y')}",
                channel="api",
                reference=f"PAYROLL-{payroll_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )
            all_dates.append(payroll_date)

        # 3. EPF (last working day of month, MYR ~9,600)
        epf_day = min(28, month_end.day)
        epf_date = date(cur.year, cur.month, epf_day)
        if epf_date <= DEMO_BACKFILL_END:
            amt = Decimal(str(round(random.uniform(9400, 9800), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=epf_date,
                posted_at=ts(epf_date, 11, 0),
                value_date=epf_date,
                amount=-amt,
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_epf")),
                description="EPF employer + employee contribution",
                channel="direct_debit",
                reference=f"EPF-{epf_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )
            all_dates.append(epf_date)

        # 4. SOCSO (same day as EPF, ~MYR 1,800)
        if epf_date <= DEMO_BACKFILL_END:
            amt = Decimal(str(round(random.uniform(1700, 1900), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=epf_date,
                posted_at=ts(epf_date, 11, 5),
                value_date=epf_date,
                amount=-amt,
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_socso")),
                description="SOCSO contribution",
                channel="direct_debit",
                reference=f"SOCSO-{epf_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )

        # 5. TNB (5-7th, varies MYR 1,500-2,100)
        tnb_day = random.randint(5, 7)
        tnb_date = date(cur.year, cur.month, tnb_day)
        if tnb_date <= DEMO_BACKFILL_END:
            amt = Decimal(str(round(random.uniform(1500, 2100), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=tnb_date,
                posted_at=ts(tnb_date, 9, 30),
                value_date=tnb_date,
                amount=-amt,
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_tnb")),
                description="Electricity",
                channel="direct_debit",
                reference=f"TNB-{tnb_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )

        # 6. Air Selangor (5-7th, MYR 300-400)
        if tnb_date <= DEMO_BACKFILL_END:
            amt = Decimal(str(round(random.uniform(300, 400), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=tnb_date,
                posted_at=ts(tnb_date, 9, 31),
                value_date=tnb_date,
                amount=-amt,
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_air_selangor")),
                description="Water",
                channel="direct_debit",
                reference=f"AS-{tnb_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )

        # 7. Maxis (5-7th, MYR 900-1,000)
        if tnb_date <= DEMO_BACKFILL_END:
            amt = Decimal(str(round(random.uniform(900, 1000), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=tnb_date,
                posted_at=ts(tnb_date, 9, 32),
                value_date=tnb_date,
                amount=-amt,
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_maxis")),
                description="Telco / business broadband",
                channel="direct_debit",
                reference=f"MAXIS-{tnb_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )

        # 8. EUR supplier (Lafont) — 14-20th, monthly, EUR 7,800-8,500 with FX conversion
        eur_day = random.randint(14, 20)
        eur_date = date(cur.year, cur.month, eur_day)
        if eur_date <= DEMO_BACKFILL_END:
            amt_eur = round(random.uniform(7800, 8500), 2)
            rate = round(random.uniform(4.75, 4.95), 4)
            amt_myr = round(amt_eur * rate, 2)
            g.add(
                account_id="acc_myr_current",
                transaction_date=eur_date,
                posted_at=ts(eur_date, 13, 15),
                value_date=eur_date,
                amount=Decimal(str(-amt_myr)),
                currency="MYR",
                direction="debit",
                transaction_type="fx_conversion",
                counterparty_raw_text=random_alias(cp_by_id("cp_lafont")),
                description=f"FX outbound EUR {amt_eur} to Lafont wine shipment",
                channel="online",
                reference=f"FX-EUR-{eur_date.strftime('%Y%m%d')}",
                fx_pair="EUR/MYR",
                fx_rate=Decimal(str(rate)),
            )
            all_dates.append(eur_date)

        # 9. AUD supplier (Wynns) — 8-12th, monthly, AUD 6,000-6,700
        aud_day = random.randint(8, 12)
        aud_date = date(cur.year, cur.month, aud_day)
        if aud_date <= DEMO_BACKFILL_END:
            amt_aud = round(random.uniform(6000, 6700), 2)
            rate = round(random.uniform(2.85, 3.05), 4)
            amt_myr = round(amt_aud * rate, 2)
            g.add(
                account_id="acc_myr_current",
                transaction_date=aud_date,
                posted_at=ts(aud_date, 12, 0),
                value_date=aud_date,
                amount=Decimal(str(-amt_myr)),
                currency="MYR",
                direction="debit",
                transaction_type="fx_conversion",
                counterparty_raw_text=random_alias(cp_by_id("cp_wynns")),
                description=f"FX outbound AUD {amt_aud} to Wynns wine shipment",
                channel="online",
                reference=f"FX-AUD-{aud_date.strftime('%Y%m%d')}",
                fx_pair="AUD/MYR",
                fx_rate=Decimal(str(rate)),
            )

        # 10. KL distributor (local supplier) — 10-15th, MYR 4,200-4,800
        kl_day = random.randint(10, 15)
        kl_date = date(cur.year, cur.month, kl_day)
        if kl_date <= DEMO_BACKFILL_END:
            amt = Decimal(str(round(random.uniform(4200, 4800), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=kl_date,
                posted_at=ts(kl_date, 10, 0),
                value_date=kl_date,
                amount=-amt,
                currency="MYR",
                direction="debit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp_by_id("cp_kl_distributor")),
                description="Local supplier — KL Premium Imports",
                channel="online",
                reference=f"INV-KLP-{kl_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )

        # ---- Monthly inflows ----

        # Customer payments — each on a different day of the month
        customer_schedule = [
            ("cp_lumiere", 5, 1.00),
            ("cp_khalid", 8, 1.00),
            ("cp_marble", 12, 1.00),
            ("cp_swt_grand", 18, 1.00),
        ]
        for cid, day, prob in customer_schedule:
            if random.random() > prob:
                continue
            day = min(day, month_end.day)
            inflow_date = date(cur.year, cur.month, day)
            if inflow_date > DEMO_BACKFILL_END:
                continue
            cp = cp_by_id(cid)
            # Inject the "Café Lumière overdue" scenario near demo end:
            # skip Café Lumière inflow for June 2026 (so it shows as overdue on 8 Jun)
            if cid == "cp_lumiere" and cur.year == 2026 and cur.month == 6:
                continue
            amt = Decimal(str(round(random.uniform(cp["avg"] * 0.90, cp["avg"] * 1.10), 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=inflow_date,
                posted_at=ts(inflow_date, 16, 30),
                value_date=inflow_date,
                amount=amt,
                currency="MYR",
                direction="credit",
                transaction_type="payment",
                counterparty_raw_text=random_alias(cp),
                description=f"Customer payment — {cp['name']}",
                channel="online",
                reference=f"INV-{cid[3:].upper()}-{inflow_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )
            all_dates.append(inflow_date)

        # Quarterly customer — Provence
        if cur.month in (3, 6, 9, 12):
            day = min(20, month_end.day)
            inflow_date = date(cur.year, cur.month, day)
            if inflow_date <= DEMO_BACKFILL_END:
                cp = cp_by_id("cp_provence")
                amt = Decimal(str(round(random.uniform(cp["avg"] * 0.95, cp["avg"] * 1.10), 2)))
                g.add(
                    account_id="acc_myr_current",
                    transaction_date=inflow_date,
                    posted_at=ts(inflow_date, 14, 0),
                    value_date=inflow_date,
                    amount=amt,
                    currency="MYR",
                    direction="credit",
                    transaction_type="payment",
                    counterparty_raw_text=random_alias(cp),
                    description="Quarterly customer payment — Provence",
                    channel="online",
                    reference=f"INV-PROV-{inflow_date.strftime('%Y%m')}",
                    fx_pair=None, fx_rate=None,
                )

        # Quarterly LHDN (tax)
        if cur.month in (3, 6, 9, 12):
            day = min(20, month_end.day)
            tax_date = date(cur.year, cur.month, day)
            if tax_date <= DEMO_BACKFILL_END:
                amt = Decimal(str(round(random.uniform(16000, 22000), 2)))
                g.add(
                    account_id="acc_myr_current",
                    transaction_date=tax_date,
                    posted_at=ts(tax_date, 15, 0),
                    value_date=tax_date,
                    amount=-amt,
                    currency="MYR",
                    direction="debit",
                    transaction_type="payment",
                    counterparty_raw_text=random_alias(cp_by_id("cp_lhdn")),
                    description="Quarterly tax — LHDN",
                    channel="online",
                    reference=f"LHDN-{tax_date.strftime('%Y%m')}",
                    fx_pair=None, fx_rate=None,
                )

        # Loan repayment (existing working capital — paying interest monthly)
        # Working Capital outstanding 160K * 7.2% / 12 = ~960/month
        loan_date = date(cur.year, cur.month, min(15, month_end.day))
        if loan_date <= DEMO_BACKFILL_END:
            interest_amt = Decimal(str(round(160000 * 0.072 / 12, 2)))
            g.add(
                account_id="acc_myr_current",
                transaction_date=loan_date,
                posted_at=ts(loan_date, 11, 30),
                value_date=loan_date,
                amount=-interest_amt,
                currency="MYR",
                direction="debit",
                transaction_type="interest",
                counterparty_raw_text="CIMB WORKING CAPITAL FACILITY",
                description="Working Capital — monthly interest",
                channel="direct_debit",
                reference=f"WC-INT-{loan_date.strftime('%Y%m')}",
                fx_pair=None, fx_rate=None,
            )

        cur = nxt

    return g.txns, all_dates


# =============================================================================
# TABLE 3: bank_balances_daily — derived from transactions
# =============================================================================

def gen_balances_daily(transactions: list[dict]) -> list[dict]:
    rows = []
    # Group by account
    accs_seen = set(t["account_id"] for t in transactions)
    for account_id in accs_seen:
        if account_id not in ["acc_myr_current"]:
            continue  # Only MYR current for cashflow modeling
        # Sum daily inflow/outflow
        days: dict[date, dict] = {}
        for t in transactions:
            if t["account_id"] != account_id:
                continue
            d = t["transaction_date"]
            agg = days.setdefault(d, {"inflow": Decimal("0"), "outflow": Decimal("0"), "inflow_count": 0, "outflow_count": 0})
            amt = Decimal(str(t["amount"]))
            if amt >= 0:
                agg["inflow"] += amt
                agg["inflow_count"] += 1
            else:
                agg["outflow"] += -amt
                agg["outflow_count"] += 1

        # Iterate dates
        # Opening tuned so that final closing on 2026-06-07 lands near MYR 52,300
        # (storyboard reference). Sunrise Trading's revenue (MYR 3-8M) is largely
        # off-account — most inflows route through customer-side FX accounts and
        # local distributor wallets, not the OCTO Biz Current. The visible MYR
        # current is essentially a working-capital sweep account.
        balance = Decimal("1474537.00")  # opening on backfill start (closing on 2026-06-07 lands at MYR ~52,300 per storyboard)
        cur = DEMO_BACKFILL_START
        bid = 1
        while cur <= DEMO_BACKFILL_END:
            day = days.get(cur, {"inflow": Decimal("0"), "outflow": Decimal("0"), "inflow_count": 0, "outflow_count": 0})
            opening = balance
            net = day["inflow"] - day["outflow"]
            balance = opening + net
            rows.append({
                "balance_id": f"bal_{account_id[4:]}_{cur.isoformat()}",
                "customer_id": CUSTOMER_ID,
                "account_id": account_id,
                "balance_date": cur,
                "opening_balance": opening.quantize(Decimal("0.01")),
                "closing_balance": balance.quantize(Decimal("0.01")),
                "currency": "MYR",
                "total_inflow": day["inflow"].quantize(Decimal("0.01")),
                "total_outflow": day["outflow"].quantize(Decimal("0.01")),
                "inflow_count": day["inflow_count"],
                "outflow_count": day["outflow_count"],
                "snapshot_type": "eod",
                "source": "core_banking",
                "schema_version": 1,
                "created_at": ts(cur, 23, 59),
            })
            cur += timedelta(days=1)
            bid += 1
    # Final closing should be ~MYR 52,300 (storyboard) — let me tune opening above iteratively
    # NOTE: The opening 48000 is a starting heuristic; actual final depends on net flows.
    return rows


# =============================================================================
# TABLE 5: bank_scheduled_payments (forward-looking only)
# =============================================================================

def gen_scheduled_payments() -> list[dict]:
    rows = []
    # 1. Rent SO — next 6 months from demo current
    for i in range(6):
        next_rent = date(DEMO_CURRENT_DATE.year, DEMO_CURRENT_DATE.month + 1, 1) if DEMO_CURRENT_DATE.month < 12 else date(DEMO_CURRENT_DATE.year + 1, 1, 1)
        d = next_rent + timedelta(days=30 * i)
        rows.append({
            "scheduled_payment_id": f"sched_rent_{d.isoformat()}",
            "customer_id": CUSTOMER_ID,
            "account_id": "acc_myr_current",
            "schedule_type": "standing_order",
            "scheduled_date": d,
            "amount": Decimal("-12000.00"),
            "currency": "MYR",
            "counterparty_raw_text": "PLAZA KELANA PROPERTIES SB",
            "fx_pair": None, "fx_amount_local": None,
            "payment_method": "standing_order",
            "reference": f"SO-RENT-{d.strftime('%Y%m')}",
            "recurrence": "monthly",
            "status": "pending",
            "executed_at": None,
            "linked_transaction_id": None,
            "source": "core_banking",
            "schema_version": 1,
            "created_at": ts(DEMO_CURRENT_DATE),
            "updated_at": ts(DEMO_CURRENT_DATE),
        })

    # 2. Utility direct debits (next month forecast)
    next_month = DEMO_CURRENT_DATE.replace(day=6) + timedelta(days=30)
    for cp_id, amt in [("cp_tnb", -1850), ("cp_air_selangor", -350), ("cp_maxis", -950)]:
        rows.append({
            "scheduled_payment_id": f"sched_{cp_id}_{next_month.isoformat()}",
            "customer_id": CUSTOMER_ID,
            "account_id": "acc_myr_current",
            "schedule_type": "direct_debit",
            "scheduled_date": next_month,
            "amount": Decimal(str(amt)),
            "currency": "MYR",
            "counterparty_raw_text": cp_by_id(cp_id)["raw_aliases"][0],
            "fx_pair": None, "fx_amount_local": None,
            "payment_method": "bank_transfer",
            "reference": None,
            "recurrence": "monthly",
            "status": "pending",
            "executed_at": None,
            "linked_transaction_id": None,
            "source": "core_banking",
            "schema_version": 1,
            "created_at": ts(DEMO_CURRENT_DATE),
            "updated_at": ts(DEMO_CURRENT_DATE),
        })

    # 3. Payroll batch (25 Jun)
    payroll_date = DEMO_CURRENT_DATE.replace(day=25)
    rows.append({
        "scheduled_payment_id": f"sched_payroll_{payroll_date.isoformat()}",
        "customer_id": CUSTOMER_ID,
        "account_id": "acc_myr_current",
        "schedule_type": "standing_order",
        "scheduled_date": payroll_date,
        "amount": Decimal("-81000.00"),
        "currency": "MYR",
        "counterparty_raw_text": "PAYROLL BATCH",
        "fx_pair": None, "fx_amount_local": None,
        "payment_method": "bank_transfer",
        "reference": f"PAYROLL-{payroll_date.strftime('%Y%m')}",
        "recurrence": "monthly",
        "status": "pending",
        "executed_at": None,
        "linked_transaction_id": None,
        "source": "core_banking",
        "schema_version": 1,
        "created_at": ts(DEMO_CURRENT_DATE),
        "updated_at": ts(DEMO_CURRENT_DATE),
    })

    # 4. WC loan interest (15 Jun)
    loan_date = DEMO_CURRENT_DATE.replace(day=15)
    rows.append({
        "scheduled_payment_id": f"sched_wcint_{loan_date.isoformat()}",
        "customer_id": CUSTOMER_ID,
        "account_id": "acc_myr_current",
        "schedule_type": "loan_repayment_scheduled",
        "scheduled_date": loan_date,
        "amount": Decimal("-960.00"),
        "currency": "MYR",
        "counterparty_raw_text": "CIMB WORKING CAPITAL FACILITY",
        "fx_pair": None, "fx_amount_local": None,
        "payment_method": "bank_transfer",
        "reference": f"WC-INT-{loan_date.strftime('%Y%m')}",
        "recurrence": "monthly",
        "status": "pending",
        "executed_at": None,
        "linked_transaction_id": None,
        "source": "core_banking",
        "schema_version": 1,
        "created_at": ts(DEMO_CURRENT_DATE),
        "updated_at": ts(DEMO_CURRENT_DATE),
    })

    # 5. FD maturity (existing FD acc_myr_fd_001 matures 2026-09-30)
    rows.append({
        "scheduled_payment_id": "sched_fd_maturity_001",
        "customer_id": CUSTOMER_ID,
        "account_id": "acc_myr_fd_001",
        "schedule_type": "fd_maturity",
        "scheduled_date": date(2026, 9, 30),
        "amount": Decimal("51000.00"),  # MYR 50K + interest
        "currency": "MYR",
        "counterparty_raw_text": "INTERNAL FD MATURITY",
        "fx_pair": None, "fx_amount_local": None,
        "payment_method": "bank_transfer",
        "reference": "FD-001",
        "recurrence": "one_off",
        "status": "pending",
        "executed_at": None,
        "linked_transaction_id": None,
        "source": "core_banking",
        "schema_version": 1,
        "created_at": ts(DEMO_CURRENT_DATE),
        "updated_at": ts(DEMO_CURRENT_DATE),
    })

    return rows


# =============================================================================
# TABLES 6-8: Credit limits, drawdowns, preapproved offers
# =============================================================================

def gen_credit_limits() -> list[dict]:
    return [{
        "credit_limit_id": "cl_wc_001",
        "customer_id": CUSTOMER_ID,
        "product_holding_id": "ph_wc_001",
        "limit_type": "working_capital",
        "limit_amount": Decimal("200000.00"),
        "outstanding_amount": Decimal("160000.00"),
        "available_amount": Decimal("40000.00"),
        "currency": "MYR",
        "interest_rate": Decimal("7.2"),
        "effective_from": date(2024, 4, 1),
        "effective_to": None,
        "status": "active",
        "source": "core_banking",
        "schema_version": 1,
        "created_at": ts(date(2024, 4, 1)),
        "updated_at": ts(DEMO_CURRENT_DATE),
    }]


def gen_credit_drawdowns(transactions: list[dict]) -> list[dict]:
    rows = []
    # The 160K outstanding came from earlier drawdowns
    rows.append({
        "drawdown_id": "drw_001",
        "customer_id": CUSTOMER_ID,
        "credit_limit_id": "cl_wc_001",
        "event_type": "drawdown",
        "amount": Decimal("160000.00"),
        "currency": "MYR",
        "event_date": date(2025, 1, 15),
        "linked_transaction_id": None,
        "source": "core_banking",
        "schema_version": 1,
        "created_at": ts(date(2025, 1, 15)),
    })
    return rows


def gen_preapproved_offers() -> list[dict]:
    return [{
        "offer_id": "offer_flx_001",
        "customer_id": CUSTOMER_ID,
        "product_type": "flexicash",
        "approved_amount": Decimal("65000.00"),
        "currency": "MYR",
        "offer_terms": {
            "interest_rate_pa": 8.5,
            "draw_period_days": 365,
            "min_drawdown": 1000,
            "no_setup_fee": True
        },
        "valid_from": date(2026, 6, 1),
        "valid_to": date(2026, 8, 31),
        "status": "open",
        "accepted_at": None,
        "accepted_via": None,
        "generated_by": "rule_engine",
        "source": "core_banking",
        "schema_version": 1,
        "created_at": ts(date(2026, 6, 1)),
        "updated_at": ts(date(2026, 6, 1)),
    }]


# =============================================================================
# TABLES 9-10: products_held, products_history
# =============================================================================

def gen_products_held() -> list[dict]:
    return [
        {
            "product_holding_id": "ph_octo_current",
            "customer_id": CUSTOMER_ID, "product_id": "octo_biz_current_myr",
            "product_name": "OCTO Biz Current Account (MYR)",
            "product_type": "current_account",
            "account_id": "acc_myr_current",
            "enrolled_at": date(2024, 3, 20),
            "status": "active",
            "principal_amount": None, "outstanding_amount": None, "currency": "MYR",
            "source": "core_banking", "schema_version": 1,
            "created_at": ts(date(2024, 3, 20)), "updated_at": ts(DEMO_CURRENT_DATE),
        },
        {
            "product_holding_id": "ph_mca",
            "customer_id": CUSTOMER_ID, "product_id": "multi_currency_account",
            "product_name": "Multi-Currency Account",
            "product_type": "current_account",
            "account_id": "acc_eur_holding",
            "enrolled_at": date(2024, 5, 1),
            "status": "active",
            "principal_amount": None, "outstanding_amount": None, "currency": None,
            "source": "core_banking", "schema_version": 1,
            "created_at": ts(date(2024, 5, 1)), "updated_at": ts(DEMO_CURRENT_DATE),
        },
        {
            "product_holding_id": "ph_wc_001",
            "customer_id": CUSTOMER_ID, "product_id": "working_capital_facility",
            "product_name": "Working Capital Facility",
            "product_type": "working_capital",
            "account_id": None,
            "enrolled_at": date(2024, 4, 1),
            "status": "active",
            "principal_amount": Decimal("200000.00"),
            "outstanding_amount": Decimal("160000.00"),
            "currency": "MYR",
            "source": "core_banking", "schema_version": 1,
            "created_at": ts(date(2024, 4, 1)), "updated_at": ts(DEMO_CURRENT_DATE),
        },
        {
            "product_holding_id": "ph_lc_001",
            "customer_id": CUSTOMER_ID, "product_id": "letter_of_credit",
            "product_name": "Letter of Credit (LC)",
            "product_type": "lc",
            "account_id": None,
            "enrolled_at": date(2024, 6, 15),
            "status": "active",
            "principal_amount": Decimal("500000.00"),
            "outstanding_amount": Decimal("0.00"),
            "currency": "MYR",
            "source": "core_banking", "schema_version": 1,
            "created_at": ts(date(2024, 6, 15)), "updated_at": ts(DEMO_CURRENT_DATE),
        },
        {
            "product_holding_id": "ph_fd_001",
            "customer_id": CUSTOMER_ID, "product_id": "fd_myr",
            "product_name": "Fixed Deposit (MYR) 180d",
            "product_type": "fd",
            "account_id": "acc_myr_fd_001",
            "enrolled_at": date(2026, 3, 30),
            "status": "active",
            "principal_amount": Decimal("50000.00"),
            "outstanding_amount": None, "currency": "MYR",
            "source": "core_banking", "schema_version": 1,
            "created_at": ts(date(2026, 3, 30)), "updated_at": ts(DEMO_CURRENT_DATE),
        },
    ]


def gen_products_history() -> list[dict]:
    return [
        {"product_history_id": "phh_001", "customer_id": CUSTOMER_ID, "product_holding_id": "ph_octo_current", "product_id": "octo_biz_current_myr", "event_type": "enrolled", "event_date": date(2024, 3, 20), "event_details": None, "source": "core_banking", "schema_version": 1, "created_at": ts(date(2024, 3, 20))},
        {"product_history_id": "phh_002", "customer_id": CUSTOMER_ID, "product_holding_id": "ph_wc_001", "product_id": "working_capital_facility", "event_type": "enrolled", "event_date": date(2024, 4, 1), "event_details": {"limit": 200000}, "source": "core_banking", "schema_version": 1, "created_at": ts(date(2024, 4, 1))},
        {"product_history_id": "phh_003", "customer_id": CUSTOMER_ID, "product_holding_id": "ph_mca", "product_id": "multi_currency_account", "event_type": "enrolled", "event_date": date(2024, 5, 1), "event_details": None, "source": "core_banking", "schema_version": 1, "created_at": ts(date(2024, 5, 1))},
        {"product_history_id": "phh_004", "customer_id": CUSTOMER_ID, "product_holding_id": "ph_lc_001", "product_id": "letter_of_credit", "event_type": "enrolled", "event_date": date(2024, 6, 15), "event_details": {"trade_facility_limit": 500000}, "source": "core_banking", "schema_version": 1, "created_at": ts(date(2024, 6, 15))},
        {"product_history_id": "phh_005", "customer_id": CUSTOMER_ID, "product_holding_id": "ph_fd_001", "product_id": "fd_myr", "event_type": "enrolled", "event_date": date(2026, 3, 30), "event_details": {"placement": 50000, "tenor_days": 180}, "source": "core_banking", "schema_version": 1, "created_at": ts(date(2026, 3, 30))},
    ]


def gen_rm_assignments() -> list[dict]:
    return [{
        "assignment_id": "rm_assign_001",
        "customer_id": CUSTOMER_ID,
        "rm_id": "rm_kl_sme_042",
        "rm_name": "Siti Aishah Rahman",
        "rm_branch": "CIMB SME Centre — Petaling Jaya",
        "rm_contact_email": "siti.rahman@cimb.com",
        "rm_contact_phone": "+60378829042",
        "assigned_at": date(2024, 3, 20),
        "source": "core_banking", "schema_version": 1,
        "created_at": ts(date(2024, 3, 20)), "updated_at": ts(DEMO_CURRENT_DATE),
    }]


# =============================================================================
# TABLE 12: bank_fx_rates — 12 months EOD for 3 pairs
# =============================================================================

def gen_fx_rates() -> list[dict]:
    rows = []
    pairs = [
        ("EUR/MYR", 4.81, 0.06),  # base, volatility (annual std dev approx)
        ("AUD/MYR", 2.95, 0.04),
        ("USD/MYR", 4.45, 0.03),
    ]
    fid = 1
    for pair, base, vol in pairs:
        mid = base
        cur = DEMO_BACKFILL_START
        while cur <= DEMO_CURRENT_DATE:
            # Random walk
            mid = max(base * 0.85, min(base * 1.15, mid + random.uniform(-vol/30, vol/30)))
            # Tune for demo storyboard: bring EUR/MYR up to ~4.95 by 8 Jun
            if pair == "EUR/MYR" and cur >= date(2026, 5, 25):
                # Force upward drift to ~4.95 by 8 Jun
                target = 4.95
                days_left = max(1, (date(2026, 6, 8) - cur).days + 1)
                mid = mid + (target - mid) / days_left
            spread_bps = round(random.uniform(15, 35), 2)
            spread = mid * spread_bps / 10000
            bid = round(mid - spread / 2, 6)
            ask = round(mid + spread / 2, 6)
            rows.append({
                "fx_rate_id": f"fx_{fid:06d}",
                "pair": pair,
                "ts": ts(cur, 18, 0),
                "bid": Decimal(str(bid)),
                "ask": Decimal(str(ask)),
                "mid": Decimal(str(round(mid, 6))),
                "spread_bps": Decimal(str(spread_bps)),
                "granularity": "eod",
                "source_provider": "cimb_treasury",
                "source": "external_feed",
                "schema_version": 1,
                "created_at": ts(cur, 19, 0),
            })
            fid += 1
            cur += timedelta(days=1)
    return rows


# =============================================================================
# TABLE 13: bank_interactions — seed historical (10 sample interactions)
# =============================================================================

def gen_interactions_seed() -> list[dict]:
    rows = []
    # Sparse historical interactions
    samples = [
        (date(2026, 5, 5), "agent_to_user", "trigger_alert", "Good morning, Mr. Bakri. This week's snapshot: net inflow MYR 38K, outflow MYR 35K. EUR/MYR moved 0.4% in your favour."),
        (date(2026, 5, 5), "user_to_agent", "chat_message", "Thanks."),
        (date(2026, 5, 12), "agent_to_user", "trigger_alert", "Good morning, Mr. Bakri. This week's snapshot: net inflow MYR 42K, outflow MYR 39K. One scheduled FX payment to AUD supplier this week."),
        (date(2026, 5, 12), "user_to_agent", "chat_message", "Got it."),
        (date(2026, 5, 19), "agent_to_user", "trigger_alert", "Good morning, Mr. Bakri. This week's snapshot: net inflow MYR 40K, outflow MYR 41K. EUR payment of about MYR 38K expected later this week based on your pattern."),
        (date(2026, 5, 26), "agent_to_user", "trigger_alert", "Good morning, Mr. Bakri. This week's snapshot: net inflow MYR 41K, outflow MYR 38K. Quarterly tax payment to LHDN expected later this month."),
        (date(2026, 5, 26), "user_to_agent", "chat_message", "Yes thanks."),
        (date(2026, 6, 2), "agent_to_user", "trigger_alert", "Good morning, Mr. Bakri. This week's snapshot: net inflow MYR 43K, outflow MYR 40K. AUD payment expected this week based on your pattern."),
    ]
    for i, (d, dir_, typ, content) in enumerate(samples):
        rows.append({
            "interaction_id": f"int_seed_{i+1:03d}",
            "customer_id": CUSTOMER_ID,
            "session_id": "seed_history",
            "channel": "whatsapp",
            "direction": dir_,
            "interaction_type": typ,
            "event_timestamp": ts(d, 9, 0),
            "content": content,
            "referenced_entity_type": "monday_brief" if typ == "trigger_alert" else None,
            "referenced_entity_id": None,
            "user_action": None,
            "source": "agent_chat", "schema_version": 1,
            "created_at": ts(d, 9, 0),
        })
    return rows


# =============================================================================
# TABLE 14-15: bank_product_catalog + bank_product_pricing_daily
# =============================================================================

def load_catalog_from_json() -> list[dict]:
    with open(CATALOG_FILE) as f:
        return json.load(f)["products"]


def gen_product_catalog(products: list[dict]) -> list[dict]:
    rows = []
    for p in products:
        rows.append({
            "product_id": p["product_id"],
            "product_name": p["product_name"],
            "category": p["category"],
            "subcategory": p["subcategory"],
            "short_description": p["short_description"],
            "long_description": p["long_description"],
            "use_case_tags": p["use_case_tags"],
            "indicative_pricing": p["indicative_pricing"],
            "min_complexity_level": p["min_complexity_level"],
            "max_complexity_level": p["max_complexity_level"],
            "eligibility_criteria": p["eligibility_criteria"],
            "prerequisite_products": p["prerequisite_products"],
            "typical_use_examples": p["typical_use_examples"],
            "tenor_min_days": p["tenor_min_days"],
            "tenor_max_days": p["tenor_max_days"],
            "currency_options": p["currency_options"],
            "is_pre_approvable": p["is_pre_approvable"],
            "compliance_disclaimer": p["compliance_disclaimer"],
            "catalog_version": p["catalog_version"],
            "last_updated_at": p["last_updated_at"],
            "source": "core_banking", "schema_version": 1,
            "created_at": p["last_updated_at"], "updated_at": p["last_updated_at"],
        })
    return rows


# Hard-coded daily pricing (storyboard fidelity)
PRICING_2026_06_08 = [
    # (product_id, type, value, currency, tenor, tier)
    ("flexicash", "interest_rate", 8.5, None, None, "sme"),
    ("working_capital_facility", "interest_rate", 7.2, None, None, "sme"),
    ("trade_bridging_loan", "interest_rate", 6.8, None, None, "sme"),
    ("sme_term_loan", "interest_rate", 6.5, None, None, "sme"),
    ("business_credit_card", "interest_rate", 18.0, None, None, "sme"),
    ("fx_forward_v1", "fx_spread_bps", 25, None, "30d", "sme"),
    ("fx_forward_v1", "fx_spread_bps", 18, None, "7d", "sme"),
    ("fx_forward_v1", "fx_spread_bps", 30, None, "90d", "sme"),
    ("fx_forward_v1", "fx_spread_bps", 35, None, "180d", "sme"),
    ("fx_limit_order", "fx_spread_bps", 25, None, None, "sme"),
    ("spot_fx", "fx_spread_bps", 40, None, "spot", "sme"),
    ("letter_of_credit", "commission_pct", 0.125, None, None, "sme"),
    ("invoice_financing", "commission_pct", 1.0, None, "30d", "sme"),
    ("trust_receipt_loan", "interest_rate", 7.0, None, None, "sme"),
    ("fd_myr", "interest_rate", 3.8, "MYR", "90d", "sme"),
    ("fd_myr", "interest_rate", 4.0, "MYR", "180d", "sme"),
    ("fd_myr", "interest_rate", 4.2, "MYR", "365d", "sme"),
    ("foreign_currency_fd", "interest_rate", 0.5, "EUR", "90d", "sme"),
    ("foreign_currency_fd", "interest_rate", 4.5, "USD", "90d", "sme"),
    ("foreign_currency_fd", "interest_rate", 3.8, "AUD", "90d", "sme"),
]


def gen_pricing_daily() -> list[dict]:
    rows = []
    for i, (pid, ptype, value, currency, tenor, tier) in enumerate(PRICING_2026_06_08):
        rows.append({
            "pricing_id": f"price_{i+1:04d}",
            "product_id": pid,
            "pricing_date": DEMO_CURRENT_DATE,
            "pricing_type": ptype,
            "value_decimal": Decimal(str(value)),
            "value_currency": currency,
            "tenor_label": tenor,
            "min_threshold": None,
            "max_threshold": None,
            "customer_tier": tier,
            "effective_until": DEMO_CURRENT_DATE + timedelta(days=1),
            "source": "treasury_rate_sheet", "schema_version": 1,
            "created_at": ts(DEMO_CURRENT_DATE, 6, 0),
        })
    return rows


# =============================================================================
# INFERRED TABLES (I-1 ~ I-7) — pre-batched results
# =============================================================================

def gen_infer_counterparties() -> list[dict]:
    rows = []
    for i, cp in enumerate(COUNTERPARTIES):
        rows.append({
            "counterparty_id": cp["id"],
            "customer_id": CUSTOMER_ID,
            "resolved_name": cp["name"],
            "aliases": cp["raw_aliases"],
            "inferred_type": cp["type"],
            "inferred_country": cp["country"],
            "inferred_currency_used": cp["currency"],
            "inferred_industry": cp["industry"],
            "payment_frequency": cp["freq"],
            "avg_amount": Decimal(str(cp["avg"])),
            "relationship_since": date(2025, 6, 1),
            "relationship_status": "active",
            "learned_notes": None,
            "confidence": Decimal("0.90"),
            "inferred_by": "entity_resolution_v1",
            "inferred_at": ts(DEMO_CURRENT_DATE, 2, 0),
            "evidence_source": None,
            "source": "agent_derived", "schema_version": 1,
            "created_at": ts(DEMO_CURRENT_DATE, 2, 0),
            "updated_at": ts(DEMO_CURRENT_DATE, 2, 0),
        })
    return rows


def gen_infer_transaction_enrichment(transactions: list[dict]) -> list[dict]:
    rows = []
    # Map raw aliases → counterparty_id
    alias_map = {}
    for cp in COUNTERPARTIES:
        for a in cp["raw_aliases"]:
            alias_map[a] = cp
    # Category map
    type_to_category = {
        "supplier": "supplier_payment",
        "customer": "customer_receipt",
        "employee": "salary",
        "tax_authority": "tax_or_statutory",
        "utility": "utility",
        "other": "other",
    }
    for t in transactions:
        raw = t["counterparty_raw_text"]
        cp = alias_map.get(raw)
        if cp:
            category = type_to_category[cp["type"]]
            # FX subcategory
            if t["transaction_type"] == "fx_conversion":
                category = "supplier_payment_fx"
            cid = cp["id"]
        else:
            # Loan interest etc.
            if t["transaction_type"] == "interest":
                category = "loan_interest"
            else:
                category = "other"
            cid = None
        rows.append({
            "transaction_id": t["transaction_id"],
            "customer_id": CUSTOMER_ID,
            "inferred_counterparty_id": cid,
            "inferred_category": category,
            "inferred_subcategory": None,
            "confidence": Decimal("0.85") if cid else Decimal("0.50"),
            "inferred_by": "txn_classifier_v1",
            "inferred_at": ts(DEMO_CURRENT_DATE, 2, 5),
            "evidence_source": None,
            "source": "agent_derived", "schema_version": 1,
            "created_at": ts(DEMO_CURRENT_DATE, 2, 5),
            "updated_at": ts(DEMO_CURRENT_DATE, 2, 5),
        })
    return rows


def gen_infer_forecasted_payments(transactions: list[dict]) -> list[dict]:
    rows = []
    # EUR Lafont — next forecast = 2026-06-17 (D+9 from demo start)
    eur_evidence = [t["transaction_id"] for t in transactions if t["fx_pair"] == "EUR/MYR"][-12:]
    rows.append({
        "forecast_id": "fcst_eur_lafont_07",
        "customer_id": CUSTOMER_ID, "account_id": "acc_myr_current",
        "forecast_method": "recurring_pattern",
        "based_on_counterparty_id": "cp_lafont",
        "expected_date": date(2026, 6, 17),
        "expected_amount_min": Decimal("36500.00"),
        "expected_amount_max": Decimal("42000.00"),
        "expected_amount_mean": Decimal("38400.00"),
        "currency": "MYR", "fx_pair": "EUR/MYR",
        "evidence_transaction_ids": eur_evidence,
        "status": "active",
        "actualized_transaction_id": None,
        "confidence": Decimal("0.89"),
        "inferred_by": "recurring_payment_detector_v1",
        "inferred_at": ts(DEMO_CURRENT_DATE, 2, 10),
        "evidence_source": {"window_months": 12, "match_count": len(eur_evidence)},
        "source": "agent_derived", "schema_version": 1,
        "created_at": ts(DEMO_CURRENT_DATE, 2, 10),
        "updated_at": ts(DEMO_CURRENT_DATE, 2, 10),
    })
    # AUD Wynns — next forecast ~ 2026-06-10 (~D+2)
    aud_evidence = [t["transaction_id"] for t in transactions if t["fx_pair"] == "AUD/MYR"][-12:]
    rows.append({
        "forecast_id": "fcst_aud_wynns_07",
        "customer_id": CUSTOMER_ID, "account_id": "acc_myr_current",
        "forecast_method": "recurring_pattern",
        "based_on_counterparty_id": "cp_wynns",
        "expected_date": date(2026, 6, 10),
        "expected_amount_min": Decimal("17500.00"),
        "expected_amount_max": Decimal("20300.00"),
        "expected_amount_mean": Decimal("18800.00"),
        "currency": "MYR", "fx_pair": "AUD/MYR",
        "evidence_transaction_ids": aud_evidence,
        "status": "active",
        "actualized_transaction_id": None,
        "confidence": Decimal("0.87"),
        "inferred_by": "recurring_payment_detector_v1",
        "inferred_at": ts(DEMO_CURRENT_DATE, 2, 10),
        "evidence_source": {"window_months": 12, "match_count": len(aud_evidence)},
        "source": "agent_derived", "schema_version": 1,
        "created_at": ts(DEMO_CURRENT_DATE, 2, 10),
        "updated_at": ts(DEMO_CURRENT_DATE, 2, 10),
    })
    return rows


def gen_infer_expected_inflows(transactions: list[dict]) -> list[dict]:
    rows = []
    # Café Lumière — overdue (was expected ~5 Jun 2026, didn't arrive)
    lumiere_evidence = [t["transaction_id"] for t in transactions if "LUMIERE" in t["counterparty_raw_text"].upper()][-10:]
    rows.append({
        "inflow_id": "in_lumiere_overdue",
        "customer_id": CUSTOMER_ID, "account_id": "acc_myr_current",
        "based_on_counterparty_id": "cp_lumiere",
        "expected_date": date(2026, 6, 4),
        "expected_amount_min": Decimal("7600.00"),
        "expected_amount_max": Decimal("9400.00"),
        "expected_amount_mean": Decimal("8500.00"),
        "currency": "MYR",
        "evidence_transaction_ids": lumiere_evidence,
        "status": "overdue",
        "days_overdue": (DEMO_CURRENT_DATE - date(2026, 6, 4)).days,
        "actualized_transaction_id": None,
        "confidence": Decimal("0.91"),
        "inferred_by": "expected_inflow_detector_v1",
        "inferred_at": ts(DEMO_CURRENT_DATE, 2, 15),
        "evidence_source": {"window_months": 12, "match_count": len(lumiere_evidence)},
        "source": "agent_derived", "schema_version": 1,
        "created_at": ts(DEMO_CURRENT_DATE, 2, 15),
        "updated_at": ts(DEMO_CURRENT_DATE, 2, 15),
    })
    # Other expected (future) inflows
    for cid, day, mean in [("cp_khalid", 8, 12000), ("cp_marble", 12, 15500), ("cp_swt_grand", 18, 22000)]:
        evidence = [t["transaction_id"] for t in transactions if cp_by_id(cid)["raw_aliases"][0].upper() in t["counterparty_raw_text"].upper()][-10:]
        rows.append({
            "inflow_id": f"in_{cid[3:]}_expected",
            "customer_id": CUSTOMER_ID, "account_id": "acc_myr_current",
            "based_on_counterparty_id": cid,
            "expected_date": date(2026, 6, day),
            "expected_amount_min": Decimal(str(round(mean * 0.92, 2))),
            "expected_amount_max": Decimal(str(round(mean * 1.10, 2))),
            "expected_amount_mean": Decimal(str(mean)),
            "currency": "MYR",
            "evidence_transaction_ids": evidence,
            "status": "expected",
            "days_overdue": None,
            "actualized_transaction_id": None,
            "confidence": Decimal("0.88"),
            "inferred_by": "expected_inflow_detector_v1",
            "inferred_at": ts(DEMO_CURRENT_DATE, 2, 15),
            "evidence_source": None,
            "source": "agent_derived", "schema_version": 1,
            "created_at": ts(DEMO_CURRENT_DATE, 2, 15),
            "updated_at": ts(DEMO_CURRENT_DATE, 2, 15),
        })
    return rows


def gen_infer_cashflow_projection() -> list[dict]:
    return [
        # Step 1: 7-day horizon snapshot (Monday brief)
        {
            "projection_id": "proj_20260608_7d",
            "customer_id": CUSTOMER_ID, "account_id": "acc_myr_current",
            "projection_date": DEMO_CURRENT_DATE,
            "horizon_date": DEMO_CURRENT_DATE + timedelta(days=7),
            "projected_balance_mean": Decimal("56000.00"),
            "projected_balance_p25": Decimal("48000.00"),
            "projected_balance_p75": Decimal("64000.00"),
            "projected_inflow_total": Decimal("42000.00"),
            "projected_outflow_total": Decimal("38000.00"),
            "projected_dip_below_threshold": False,
            "dip_threshold": Decimal("5000.00"),
            "evidence": {"horizon_days": 7, "composition": "scheduled + forecasted + expected_inflows"},
            "confidence": Decimal("0.84"),
            "inferred_by": "cashflow_compositor_v1",
            "inferred_at": ts(DEMO_CURRENT_DATE, 6, 0),
            "evidence_source": None,
            "source": "agent_derived", "schema_version": 1,
            "created_at": ts(DEMO_CURRENT_DATE, 6, 0),
        },
        # Step 5: 21-day horizon (FlexiCash trigger — dip predicted)
        {
            "projection_id": "proj_20260626_21d",
            "customer_id": CUSTOMER_ID, "account_id": "acc_myr_current",
            "projection_date": date(2026, 6, 26),
            "horizon_date": date(2026, 7, 17),
            "projected_balance_mean": Decimal("3200.00"),
            "projected_balance_p25": Decimal("1800.00"),
            "projected_balance_p75": Decimal("5000.00"),
            "projected_inflow_total": Decimal("48000.00"),
            "projected_outflow_total": Decimal("113600.00"),
            "projected_dip_below_threshold": True,
            "dip_threshold": Decimal("5000.00"),
            "evidence": {"horizon_days": 21, "composition": "balance 52K + sched 10K + forecast 38K - sched_out 95.6K - forecast_out 18K"},
            "confidence": Decimal("0.81"),
            "inferred_by": "cashflow_compositor_v1",
            "inferred_at": ts(date(2026, 6, 26), 7, 0),
            "evidence_source": None,
            "source": "agent_derived", "schema_version": 1,
            "created_at": ts(date(2026, 6, 26), 7, 0),
        },
    ]


def gen_infer_company_profile() -> list[dict]:
    return [{
        "profile_id": "profile_ahmad_v1",
        "customer_id": CUSTOMER_ID, "version": 1,
        "inferred_complexity_level": 4,
        "inferred_complexity_reasoning": "Working capital + Trade Finance (LC) + Multi-currency FX + multi-bank pattern visible. Sweet spot Level 3-4 per PPT Slide 3.",
        "inferred_subindustry": "specialist_wine_importer",
        "inferred_inventory_cycle_days": 52,
        "inferred_seasonality_summary": "CNY peak Jan-Feb (+30% inflow), year-end Nov-Dec (+25%), monthly EUR/AUD payments mid-month.",
        "inferred_primary_bank": "maybank",
        "inferred_wallet_share_at_cimb": Decimal("0.32"),
        "inferred_business_type": "food_beverage_importer",
        "inferred_business_type_confidence": Decimal("0.95"),
        "inferred_revenue_bucket": "3m_to_8m",
        "inferred_revenue_bucket_confidence": Decimal("0.86"),
        "inferred_employee_count_bucket": "10_to_30",
        "inferred_employee_count_confidence": Decimal("0.88"),
        "learned_facts": {},
        "confidence": Decimal("0.85"),
        "inferred_by": "company_profile_compositor_v1",
        "inferred_at": ts(DEMO_CURRENT_DATE, 2, 30),
        "evidence_source": None,
        "source": "agent_derived", "schema_version": 1,
        "created_at": ts(DEMO_CURRENT_DATE, 2, 30),
        "updated_at": ts(DEMO_CURRENT_DATE, 2, 30),
    }]


def gen_infer_seasonality() -> list[dict]:
    return [
        {"pattern_id": "season_cny", "customer_id": CUSTOMER_ID, "pattern_type": "annual", "pattern_label": "CNY_peak",
         "peak_periods": {"months": ["Jan", "Feb"]}, "metric": "inflow",
         "amplitude": Decimal("1.30"), "evidence_window": "12 months",
         "confidence": Decimal("0.82"),
         "inferred_by": "seasonality_v1", "inferred_at": ts(DEMO_CURRENT_DATE, 2, 35),
         "evidence_source": None,
         "source": "agent_derived", "schema_version": 1,
         "created_at": ts(DEMO_CURRENT_DATE, 2, 35)},
        {"pattern_id": "season_yearend", "customer_id": CUSTOMER_ID, "pattern_type": "annual", "pattern_label": "year_end_peak",
         "peak_periods": {"months": ["Nov", "Dec"]}, "metric": "inflow",
         "amplitude": Decimal("1.25"), "evidence_window": "12 months",
         "confidence": Decimal("0.78"),
         "inferred_by": "seasonality_v1", "inferred_at": ts(DEMO_CURRENT_DATE, 2, 35),
         "evidence_source": None,
         "source": "agent_derived", "schema_version": 1,
         "created_at": ts(DEMO_CURRENT_DATE, 2, 35)},
        {"pattern_id": "season_monthly_eur", "customer_id": CUSTOMER_ID, "pattern_type": "monthly", "pattern_label": "monthly_eur_payment",
         "peak_periods": {"days_of_month": [14, 15, 16, 17, 18, 19, 20]}, "metric": "outflow",
         "amplitude": Decimal("1.00"), "evidence_window": "12 months",
         "confidence": Decimal("0.92"),
         "inferred_by": "seasonality_v1", "inferred_at": ts(DEMO_CURRENT_DATE, 2, 35),
         "evidence_source": None,
         "source": "agent_derived", "schema_version": 1,
         "created_at": ts(DEMO_CURRENT_DATE, 2, 35)},
    ]


# =============================================================================
# MAIN
# =============================================================================

def main():
    print(f"Loading product catalog from {CATALOG_FILE}", flush=True)
    products = load_catalog_from_json()
    print(f"Catalog: {len(products)} products", flush=True)

    emit(f"-- CIMB CFO Agent — Synthetic Seed Data")
    emit(f"-- Generated: {now_iso()}")
    emit(f"-- Customer: {CUSTOMER_LEGAL_NAME} ({CUSTOMER_ID})")
    emit(f"-- Backfill: {DEMO_BACKFILL_START} → {DEMO_BACKFILL_END}")
    emit(f"-- Demo current date: {DEMO_CURRENT_DATE}")
    emit(f"-- Reference: goals/architecture-v2.md + goals/demo-storyboard-v2.md\n")

    emit("BEGIN;\n")

    print("Generating bank_customers", flush=True)
    insert("bank_customers",
           ["customer_id","legal_name","trade_name","business_type_declared","msic_code","incorporation_date",
            "employee_count_bucket_declared","annual_revenue_bucket_declared","registered_address",
            "primary_contact_name","primary_contact_role_declared","primary_contact_phone","primary_contact_email",
            "preferred_language","timezone","kyc_status","kyc_declared_at","onboarded_at","source","schema_version",
            "created_at","updated_at"],
           gen_customers())

    print("Generating bank_accounts", flush=True)
    insert("bank_accounts",
           ["account_id","customer_id","account_number_masked","currency","account_type","product_name","opened_date","closed_date","status","is_primary","maturity_date","interest_rate","source","schema_version","created_at","updated_at"],
           gen_accounts())

    print("Generating bank_product_catalog + pricing", flush=True)
    insert("bank_product_catalog",
           ["product_id","product_name","category","subcategory","short_description","long_description","use_case_tags","indicative_pricing","min_complexity_level","max_complexity_level","eligibility_criteria","prerequisite_products","typical_use_examples","tenor_min_days","tenor_max_days","currency_options","is_pre_approvable","compliance_disclaimer","catalog_version","last_updated_at","source","schema_version","created_at","updated_at"],
           gen_product_catalog(products))

    insert("bank_product_pricing_daily",
           ["pricing_id","product_id","pricing_date","pricing_type","value_decimal","value_currency","tenor_label","min_threshold","max_threshold","customer_tier","effective_until","source","schema_version","created_at"],
           gen_pricing_daily())

    print("Generating bank_transactions (this is the big one)", flush=True)
    transactions, _ = gen_transactions()
    print(f"  → {len(transactions)} transactions", flush=True)
    insert("bank_transactions",
           ["transaction_id","customer_id","account_id","transaction_date","posted_at","value_date","amount","currency","direction","transaction_type","counterparty_raw_text","description","channel","reference","fx_pair","fx_rate","source","schema_version","created_at"],
           transactions)

    print("Generating bank_balances_daily", flush=True)
    bal = gen_balances_daily(transactions)
    print(f"  → {len(bal)} balance snapshots", flush=True)
    insert("bank_balances_daily",
           ["balance_id","customer_id","account_id","balance_date","opening_balance","closing_balance","currency","total_inflow","total_outflow","inflow_count","outflow_count","snapshot_type","source","schema_version","created_at"],
           bal)

    print("Generating bank_scheduled_payments", flush=True)
    insert("bank_scheduled_payments",
           ["scheduled_payment_id","customer_id","account_id","schedule_type","scheduled_date","amount","currency","counterparty_raw_text","fx_pair","fx_amount_local","payment_method","reference","recurrence","status","executed_at","linked_transaction_id","source","schema_version","created_at","updated_at"],
           gen_scheduled_payments())

    print("Generating bank_products_held + history + RM", flush=True)
    insert("bank_products_held",
           ["product_holding_id","customer_id","product_id","product_name","product_type","account_id","enrolled_at","status","principal_amount","outstanding_amount","currency","source","schema_version","created_at","updated_at"],
           gen_products_held())

    insert("bank_products_history",
           ["product_history_id","customer_id","product_holding_id","product_id","event_type","event_date","event_details","source","schema_version","created_at"],
           gen_products_history())

    insert("bank_rm_assignments",
           ["assignment_id","customer_id","rm_id","rm_name","rm_branch","rm_contact_email","rm_contact_phone","assigned_at","source","schema_version","created_at","updated_at"],
           gen_rm_assignments())

    print("Generating bank_credit_limits + drawdowns + preapproved offers", flush=True)
    insert("bank_credit_limits",
           ["credit_limit_id","customer_id","product_holding_id","limit_type","limit_amount","outstanding_amount","available_amount","currency","interest_rate","effective_from","effective_to","status","source","schema_version","created_at","updated_at"],
           gen_credit_limits())

    insert("bank_credit_drawdowns",
           ["drawdown_id","customer_id","credit_limit_id","event_type","amount","currency","event_date","linked_transaction_id","source","schema_version","created_at"],
           gen_credit_drawdowns(transactions))

    insert("bank_preapproved_offers",
           ["offer_id","customer_id","product_type","approved_amount","currency","offer_terms","valid_from","valid_to","status","accepted_at","accepted_via","generated_by","source","schema_version","created_at","updated_at"],
           gen_preapproved_offers())

    print("Generating bank_fx_rates", flush=True)
    fx = gen_fx_rates()
    print(f"  → {len(fx)} fx rate rows", flush=True)
    insert("bank_fx_rates",
           ["fx_rate_id","pair","ts","bid","ask","mid","spread_bps","granularity","source_provider","source","schema_version","created_at"],
           fx)

    print("Generating bank_interactions (seed history)", flush=True)
    insert("bank_interactions",
           ["interaction_id","customer_id","session_id","channel","direction","interaction_type","event_timestamp","content","referenced_entity_type","referenced_entity_id","user_action","source","schema_version","created_at"],
           gen_interactions_seed())

    # ---- Inferred tables ----

    print("Generating infer_counterparties", flush=True)
    insert("infer_counterparties",
           ["counterparty_id","customer_id","resolved_name","aliases","inferred_type","inferred_country","inferred_currency_used","inferred_industry","payment_frequency","avg_amount","relationship_since","relationship_status","learned_notes","confidence","inferred_by","inferred_at","evidence_source","source","schema_version","created_at","updated_at"],
           gen_infer_counterparties())

    print("Generating infer_transaction_enrichment", flush=True)
    enr = gen_infer_transaction_enrichment(transactions)
    insert("infer_transaction_enrichment",
           ["transaction_id","customer_id","inferred_counterparty_id","inferred_category","inferred_subcategory","confidence","inferred_by","inferred_at","evidence_source","source","schema_version","created_at","updated_at"],
           enr)

    print("Generating infer_forecasted_payments", flush=True)
    insert("infer_forecasted_payments",
           ["forecast_id","customer_id","account_id","forecast_method","based_on_counterparty_id","expected_date","expected_amount_min","expected_amount_max","expected_amount_mean","currency","fx_pair","evidence_transaction_ids","status","actualized_transaction_id","confidence","inferred_by","inferred_at","evidence_source","source","schema_version","created_at","updated_at"],
           gen_infer_forecasted_payments(transactions))

    print("Generating infer_expected_inflows", flush=True)
    insert("infer_expected_inflows",
           ["inflow_id","customer_id","account_id","based_on_counterparty_id","expected_date","expected_amount_min","expected_amount_max","expected_amount_mean","currency","evidence_transaction_ids","status","days_overdue","actualized_transaction_id","confidence","inferred_by","inferred_at","evidence_source","source","schema_version","created_at","updated_at"],
           gen_infer_expected_inflows(transactions))

    print("Generating infer_cashflow_projection", flush=True)
    insert("infer_cashflow_projection",
           ["projection_id","customer_id","account_id","projection_date","horizon_date","projected_balance_mean","projected_balance_p25","projected_balance_p75","projected_inflow_total","projected_outflow_total","projected_dip_below_threshold","dip_threshold","evidence","confidence","inferred_by","inferred_at","evidence_source","source","schema_version","created_at"],
           gen_infer_cashflow_projection())

    print("Generating infer_company_profile + seasonality", flush=True)
    insert("infer_company_profile",
           ["profile_id","customer_id","version","inferred_complexity_level","inferred_complexity_reasoning","inferred_subindustry","inferred_inventory_cycle_days","inferred_seasonality_summary","inferred_primary_bank","inferred_wallet_share_at_cimb","inferred_business_type","inferred_business_type_confidence","inferred_revenue_bucket","inferred_revenue_bucket_confidence","inferred_employee_count_bucket","inferred_employee_count_confidence","learned_facts","confidence","inferred_by","inferred_at","evidence_source","source","schema_version","created_at","updated_at"],
           gen_infer_company_profile())

    insert("infer_seasonality",
           ["pattern_id","customer_id","pattern_type","pattern_label","peak_periods","metric","amplitude","evidence_window","confidence","inferred_by","inferred_at","evidence_source","source","schema_version","created_at"],
           gen_infer_seasonality())

    # I-8, I-9, I-10 left empty — they populate during demo
    emit("-- infer_user_preferences: 0 rows (populated during demo Step 8)")
    emit("-- infer_interaction_enrichment: 0 rows (populated in-line during demo)")
    emit("-- infer_learning_events: 0 rows (populated during demo Step 8)")

    emit("\nCOMMIT;\n")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text("\n".join(_sql_chunks))
    print(f"\nWritten to {OUTPUT_FILE}", flush=True)
    print(f"File size: {OUTPUT_FILE.stat().st_size:,} bytes", flush=True)


if __name__ == "__main__":
    main()
