import sys
import json
import re
from datetime import datetime, date
from decimal import Decimal

try:
    import casparser
    from casparser.types import CASData
except ImportError as e:
    print(json.dumps({"error": f"Failed to import casparser: {str(e)}"}))
    sys.exit(1)

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def generate_fallback_isin(scheme_name):
    hash_val = 0
    upper_scheme = scheme_name.upper()
    for char in upper_scheme:
        hash_val = (hash_val << 5) - hash_val + ord(char)
        hash_val = (hash_val + 2**31) % 2**32 - 2**31
    
    val = abs(hash_val)
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    base36 = ""
    while val > 0:
        val, remainder = divmod(val, 36)
        base36 = chars[remainder] + base36
    if not base36:
        base36 = "0"
    
    base36_upper = base36.upper().ljust(9, "X")[:9]
    return 'INF' + base36_upper

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing PDF file path argument."}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    password = sys.argv[2] if len(sys.argv) > 2 else ""

    try:
        # Use casparser to read the CAS PDF as serialized JSON
        # This completely avoids attribute errors with Pydantic models
        raw_json = casparser.read_cas_pdf(pdf_path, password, output="json")
        data = json.loads(raw_json)
        
        # 1. Detect PAN
        detected_pan = None
        if "folios" in data:
            for folio in data.get("folios", []):
                pan = folio.get("PAN") or folio.get("PANKYC")
                if pan:
                    match = re.search(r'[A-Z]{5}[0-9]{4}[A-Z]', str(pan), re.IGNORECASE)
                    if match:
                        detected_pan = match.group(0).upper()
                        break
        elif "accounts" in data:
            for acc in data.get("accounts", []):
                for owner in acc.get("owners", []):
                    pan = owner.get("PAN")
                    if pan:
                        match = re.search(r'[A-Z]{5}[0-9]{4}[A-Z]', str(pan), re.IGNORECASE)
                        if match:
                            detected_pan = match.group(0).upper()
                            break
                if detected_pan:
                    break

        # 2. Extract transactions & opening balances
        mapped_transactions = []
        
        if "folios" in data:
            for folio in data.get("folios", []):
                folio_num = folio.get("folio", "")
                for scheme in folio.get("schemes", []):
                    scheme_name = scheme.get("scheme", "")
                    isin = scheme.get("isin", "")
                    amfi = scheme.get("amfi", "")
                    
                    # If ISIN is missing, let's try to find a fallback or generate one
                    if not isin:
                        isin = generate_fallback_isin(scheme_name)

                    open_bal = float(scheme.get("open", 0.0))
                    close_bal = float(scheme.get("close", 0.0))
                    valuation = scheme.get("valuation", {})
                    current_nav = float(valuation.get("nav", 0.0)) if valuation else 0.0

                    tx_list = scheme.get("transactions", [])
                    
                    # Calculate net transactions during this statement period
                    net_tx_units = 0.0
                    for tx in tx_list:
                        raw_units = tx.get("units")
                        units = float(raw_units) if raw_units is not None else 0.0
                        
                        tx_type_raw = str(tx.get("type", "")).upper()
                        trade_type = "BUY"
                        if any(x in tx_type_raw for x in ["REDEMPTION", "SWITCH_OUT", "SWITCH-OUT", "GIFT_OUT", "SELL"]):
                            trade_type = "SELL"
                        
                        if units < 0:
                            trade_type = "SELL"
                            units = abs(units)
                        
                        if trade_type == "BUY":
                            net_tx_units += units
                        else:
                            net_tx_units -= units

                    # The pre-existing units (Opening Balance) is the difference
                    opening_bal_units = close_bal - net_tx_units
                    
                    # Inject pseudo-transaction for the pre-existing holding balance
                    if opening_bal_units > 0.0001:
                        stmt_period = data.get("statement_period", {})
                        start_date_str = stmt_period.get("from")
                        if not start_date_str:
                            start_date_str = "2020-01-01"
                        
                        mapped_transactions.append({
                            "date": start_date_str,
                            "schemeName": scheme_name,
                            "isin": isin,
                            "type": "BUY",
                            "quantity": opening_bal_units,
                            "price": current_nav if current_nav > 0 else 10.0,
                            "amount": opening_bal_units * (current_nav if current_nav > 0 else 10.0),
                            "folio": folio_num,
                            "is_opening_balance": True
                        })

                    # Add actual transactions in statement period
                    for tx in tx_list:
                        raw_units = tx.get("units")
                        raw_amount = tx.get("amount")
                        raw_nav = tx.get("nav")
                        
                        units = float(raw_units) if raw_units is not None else 0.0
                        amount = float(raw_amount) if raw_amount is not None else 0.0
                        price = float(raw_nav) if raw_nav is not None else 0.0

                        if abs(units) < 1e-5 and abs(amount) < 1e-5:
                            continue

                        # Determine trade type
                        tx_type_raw = str(tx.get("type", "")).upper()
                        trade_type = "BUY"
                        if any(x in tx_type_raw for x in ["REDEMPTION", "SWITCH_OUT", "SWITCH-OUT", "GIFT_OUT", "SELL"]):
                            trade_type = "SELL"
                        
                        # Fallback check based on sign of units
                        if units < 0:
                            trade_type = "SELL"
                            units = abs(units)

                        # Ensure we have date
                        tx_date = tx.get("date")
                        date_str = str(tx_date) if tx_date else ""

                        # Calculate proper prices and amounts if missing
                        resolved_price = abs(price) if price else (abs(amount)/abs(units) if units > 0 else 0.0)
                        resolved_amount = abs(amount) if amount else (abs(units)*resolved_price)

                        mapped_transactions.append({
                            "date": date_str,
                            "schemeName": scheme_name,
                            "isin": isin,
                            "type": trade_type,
                            "quantity": abs(units),
                            "price": resolved_price,
                            "amount": resolved_amount,
                            "folio": folio_num
                        })
        
        elif "accounts" in data:
            # Depository (CDSL/NSDL) format
            for acc in data.get("accounts", []):
                for mf in acc.get("mutual_funds", []):
                    scheme_name = mf.get("name", "")
                    isin = mf.get("isin", "")
                    balance = float(mf.get("balance", 0.0))
                    nav = float(mf.get("nav", 0.0))
                    avg_cost = mf.get("avg_cost")
                    
                    price = float(avg_cost) if avg_cost is not None else nav
                    if price <= 0:
                        price = nav if nav > 0 else 10.0
                    
                    folio_num = mf.get("folio", "") or acc.get("client_id", "")
                    if not isin:
                        isin = generate_fallback_isin(scheme_name)
                    
                    if balance > 0.0001:
                        stmt_period = data.get("statement_period", {})
                        start_date_str = stmt_period.get("from")
                        if not start_date_str:
                            start_date_str = "2020-01-01"
                        
                        mapped_transactions.append({
                            "date": start_date_str,
                            "schemeName": scheme_name,
                            "isin": isin,
                            "type": "BUY",
                            "quantity": balance,
                            "price": price,
                            "amount": balance * price,
                            "folio": folio_num,
                            "is_opening_balance": True
                        })

        # Sort transactions chronologically by default
        mapped_transactions.sort(key=lambda x: x["date"])

        output_data = {
            "success": True,
            "detectedPan": detected_pan,
            "transactions": mapped_transactions
        }
        print(json.dumps(output_data, default=json_serial))

    except Exception as e:
        import traceback
        print(json.dumps({
            "success": False,
            "error": f"{str(e)}\n{traceback.format_exc()}"
        }))
        sys.exit(0) # Exit with 0 so the node child_process captures the JSON error payload safely

if __name__ == "__main__":
    main()
