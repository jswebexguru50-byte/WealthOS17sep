#!/usr/bin/env python3
"""Merge technical scan and fundamental dossier workbooks into one user workbook.

This script is intentionally deterministic and value-preserving:
- it does not invent or recalculate any metric;
- it keeps the technical workbook as the base workbook;
- it appends the fundamental workbook sheets with provenance-friendly names;
- it writes a merge index sheet describing the source workbooks.
"""

from __future__ import annotations

import argparse
from copy import copy
from datetime import datetime, date
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter


DEFAULT_TECHNICAL = Path(
    "outputs/01a0c502-921f-7491-9a42-361d54d7bea0/"
    "Six_Strategies_90_Sessions_2026-09-25.xlsx"
)
DEFAULT_FUNDAMENTAL = Path(
    "outputs/fundamental_dossiers/Fundamental_Dossier_179_20260925.xlsx"
)
DEFAULT_OUTPUT = Path(
    "outputs/combined_dossiers/Combined_Technical_Fundamental_Dossier_179_20260925.xlsx"
)


def safe_sheet_name(name: str, existing: set[str], prefix: str = "") -> str:
    base = f"{prefix}{name}"[:31]
    candidate = base
    i = 2
    while candidate in existing:
        suffix = f" {i}"
        candidate = f"{base[:31 - len(suffix)]}{suffix}"
        i += 1
    existing.add(candidate)
    return candidate


def copy_sheet(source_ws, target_ws) -> None:
    for row in source_ws.iter_rows():
        for source_cell in row:
            target_cell = target_ws[source_cell.coordinate]
            target_cell.value = source_cell.value
            if source_cell.has_style:
                target_cell.font = copy(source_cell.font)
                target_cell.fill = copy(source_cell.fill)
                target_cell.border = copy(source_cell.border)
                target_cell.alignment = copy(source_cell.alignment)
                target_cell.number_format = source_cell.number_format
                target_cell.protection = copy(source_cell.protection)
            if source_cell.hyperlink:
                target_cell._hyperlink = copy(source_cell.hyperlink)
            if source_cell.comment:
                target_cell.comment = copy(source_cell.comment)

    for key, dim in source_ws.column_dimensions.items():
        target_ws.column_dimensions[key].width = dim.width
        target_ws.column_dimensions[key].hidden = dim.hidden
    for key, dim in source_ws.row_dimensions.items():
        target_ws.row_dimensions[key].height = dim.height
        target_ws.row_dimensions[key].hidden = dim.hidden
    for merged_range in source_ws.merged_cells.ranges:
        target_ws.merge_cells(str(merged_range))
    target_ws.freeze_panes = source_ws.freeze_panes
    target_ws.sheet_view.showGridLines = source_ws.sheet_view.showGridLines
    target_ws.auto_filter.ref = source_ws.auto_filter.ref


def add_merge_index(wb, technical_path: Path, fundamental_path: Path) -> None:
    existing = set(wb.sheetnames)
    title = safe_sheet_name("Workbook Index", existing)
    ws = wb.create_sheet(title, 0)
    ws.sheet_view.showGridLines = False
    dark = PatternFill("solid", fgColor="111827")
    teal = PatternFill("solid", fgColor="14B8A6")
    light = PatternFill("solid", fgColor="E0F2FE")
    white = Font(color="FFFFFF", bold=True, size=13, name="Arial")

    ws["A1"] = "Seven-Strategy Technical + Fundamental Dossier"
    ws["A1"].font = Font(color="FFFFFF", bold=True, size=16, name="Arial")
    ws["A1"].fill = dark
    ws.merge_cells("A1:F1")

    rows = [
        ("Created At", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        ("Technical Source", str(technical_path)),
        ("Fundamental Source", str(fundamental_path)),
        ("Strategy Universe", "S1a, S1b, S2a, S3a, S4a, S4b, S5a"),
        ("Merge Rule", "Technical scan workbook is the base; fundamental sheets are appended without synthetic values."),
        ("Duplicate Sheet Rule", "Fundamental sheets with colliding names are prefixed with 'Fundamental -'."),
    ]
    for idx, (k, v) in enumerate(rows, start=3):
        ws[f"A{idx}"] = k
        ws[f"B{idx}"] = v
        ws[f"A{idx}"].font = Font(bold=True, name="Arial")
        ws[f"A{idx}"].fill = light
        ws[f"B{idx}"].alignment = Alignment(wrap_text=True, vertical="top")

    start = 10
    ws[f"A{start}"] = "Sheet"
    ws[f"B{start}"] = "Section"
    ws[f"C{start}"] = "Purpose"
    for cell in ws[start]:
        cell.fill = teal
        cell.font = white

    for r, sheet in enumerate(wb.sheetnames, start=start + 1):
        ws[f"A{r}"] = sheet
        fundamental_sheets = {"Coverage Summary", "All 179 Dossier", "Fundamental Evidence", "Data Dictionary"}
        ws[f"B{r}"] = "Index" if sheet == title else ("Fundamental" if sheet.startswith("Fundamental") or sheet in fundamental_sheets else "Technical")
        ws[f"C{r}"] = "Merged workbook navigation and provenance" if sheet == title else "Preserved from source workbook"

    widths = {"A": 34, "B": 18, "C": 70, "D": 14, "E": 14, "F": 14}
    for col, width in widths.items():
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A11"


def add_executive_summary(wb) -> None:
    """Add a compact, value-only executive view of the merged dossier.

    This is intentionally not an investment recommendation or a synthetic score.
    It summarizes the actual strategy and fact-status values already present in
    ``All 179 Dossier`` and leaves the row-level evidence untouched.
    """
    if "All 179 Dossier" not in wb.sheetnames:
        return

    existing = set(wb.sheetnames)
    title = safe_sheet_name("Executive Summary", existing)
    ws = wb.create_sheet(title, 0)
    ws.sheet_view.showGridLines = False
    dark = PatternFill("solid", fgColor="111827")
    teal = PatternFill("solid", fgColor="0F766E")
    light = PatternFill("solid", fgColor="ECFDF5")
    amber = PatternFill("solid", fgColor="FEF3C7")
    white = Font(color="FFFFFF", bold=True, name="Arial")
    thin = Side(style="thin", color="D1D5DB")

    ws.merge_cells("A1:F1")
    ws["A1"] = "WealthOS | Executive Summary — Seven Alphanumeric Strategies"
    ws["A1"].font = Font(color="FFFFFF", bold=True, size=16, name="Arial")
    ws["A1"].fill = dark
    ws["A1"].alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 28

    dossier = wb["All 179 Dossier"]
    headers = {cell.value: cell.column for cell in dossier[1] if cell.value}
    rows = list(dossier.iter_rows(min_row=2, values_only=True))

    def get(row, header):
        col = headers.get(header)
        return row[col - 1] if col else None

    strategy_counts: dict[str, int] = {s: 0 for s in ("S1a", "S1b", "S2a", "S3a", "S4a", "S4b", "S5a")}
    for row in rows:
        for strategy in str(get(row, "Strategies") or "").split(","):
            strategy = strategy.strip()
            if strategy in strategy_counts:
                strategy_counts[strategy] += 1

    evidence_count = wb["Fundamental Evidence"].max_row - 1 if "Fundamental Evidence" in wb.sheetnames else 0
    available_count = sum(1 for row in rows if get(row, "Market Cap Status") == "AVAILABLE")
    summary_rows = [
        ("Selected symbols", len(rows), "All selected symbols remain in the workbook; this is information only."),
        ("Strategy universe", "S1a, S1b, S2a, S3a, S4a, S4b, S5a", "Exactly seven approved alphanumeric strategies."),
        ("Technical window", "90 sessions through 2026-09-25", "Source technical sheet filename is legacy; workbook tabs were validated."),
        ("Traceable fundamental evidence rows", evidence_count, "Provider provenance is available in the Fundamental Evidence sheet."),
        ("Symbols with available market-cap fact", available_count, "Availability is a fact-status count, not an investment endorsement."),
        ("Decision rule", "No synthetic values or derived investment recommendation", "Unavailable data stays explicitly unavailable."),
    ]
    ws["A3"] = "Portfolio Snapshot"
    ws["A3"].font = white
    ws["A3"].fill = teal
    for row_idx, (label, value, note) in enumerate(summary_rows, start=4):
        ws[f"A{row_idx}"] = label
        ws[f"B{row_idx}"] = value
        ws[f"C{row_idx}"] = note
        ws[f"A{row_idx}"].font = Font(bold=True, name="Arial")
        ws[f"A{row_idx}"].fill = light

    pivot_start = 12
    ws[f"A{pivot_start}"] = "Strategy Coverage Pivot"
    ws[f"A{pivot_start}"].font = white
    ws[f"A{pivot_start}"].fill = teal
    ws[f"A{pivot_start + 1}"] = "Strategy"
    ws[f"B{pivot_start + 1}"] = "Unique Selected Symbols"
    for cell in ws[pivot_start + 1][:2]:
        cell.font = white
        cell.fill = dark
    for row_idx, (strategy, count) in enumerate(strategy_counts.items(), start=pivot_start + 2):
        ws[f"A{row_idx}"] = strategy
        ws[f"B{row_idx}"] = count

    coverage_start = pivot_start
    ws[f"D{coverage_start}"] = "Fundamental Availability Pivot"
    ws[f"D{coverage_start}"].font = white
    ws[f"D{coverage_start}"].fill = teal
    ws[f"D{coverage_start + 1}"] = "Metric"
    ws[f"E{coverage_start + 1}"] = "Available"
    ws[f"F{coverage_start + 1}"] = "Not Available / Other"
    for cell in ws[coverage_start + 1][3:6]:
        cell.font = white
        cell.fill = dark

    metrics = [
        ("Market Cap", "Market Cap Status"), ("ROCE", "ROCE Status"), ("ROE", "ROE Status"),
        ("CFO", "CFO Status"), ("Operating Profit", "Operating Profit Status"),
        ("CFO / Operating Profit", "CFO / Operating Profit Status"),
        ("Promoter Holding", "Promoter Holding Status"), ("Promoter Pledge", "Promoter Pledge Status"),
        ("FII Holding", "FII Holding Status"), ("DII Holding", "DII Holding Status"),
        ("P/E", "P/E Status"), ("Book Value", "Book Value Status"), ("Debt / Equity", "Debt / Equity Status"),
    ]
    for row_idx, (metric, status_header) in enumerate(metrics, start=coverage_start + 2):
        available = sum(1 for row in rows if get(row, status_header) == "AVAILABLE")
        ws[f"D{row_idx}"] = metric
        ws[f"E{row_idx}"] = available
        ws[f"F{row_idx}"] = len(rows) - available

    notice_row = coverage_start + len(metrics) + 3
    ws.merge_cells(start_row=notice_row, start_column=1, end_row=notice_row + 1, end_column=6)
    notice = ws.cell(notice_row, 1)
    notice.value = (
        "Important scope: Trendlyne facts in this edition are traceable point-in-time snapshots. "
        "Sector momentum is calculated only where a verified MasterTickers sector maps to saved Kite NSE index OHLCV. "
        "Dated eight-quarter history, QGLP, FCF/DCF and double momentum remain explicitly unavailable until their "
        "required dated source data is acquired."
    )
    notice.alignment = Alignment(wrap_text=True, vertical="center")
    notice.fill = amber
    notice.font = Font(name="Arial", italic=True)

    for row in ws.iter_rows():
        for cell in row:
            cell.border = Border(top=thin, bottom=thin, left=thin, right=thin)
            if cell.font.name is None:
                cell.font = copy(cell.font)
                cell.font = Font(name="Arial", bold=cell.font.bold, italic=cell.font.italic, color=cell.font.color)
            cell.alignment = copy(cell.alignment)
            cell.alignment = Alignment(
                horizontal=cell.alignment.horizontal,
                vertical=cell.alignment.vertical or "center",
                wrap_text=True,
            )
    for col, width in {"A": 34, "B": 28, "C": 72, "D": 30, "E": 16, "F": 24}.items():
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A4"


def _normalise_signal_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()[:10]
        try:
            return datetime.fromisoformat(text).date()
        except ValueError:
            return None
    return None


def add_signal_pivot(wb) -> None:
    """Create the user-facing date/symbol signal pivot from the seven scan tabs.

    A row is consolidated only when symbol and calendar date match; the supported
    strategy names are combined in that row.  This prevents duplicate same-day
    chart entries while retaining every distinct day in the 90-session source.
    """
    approved = ("S1a", "S1b", "S2a", "S3a", "S4a", "S4b", "S5a")
    records: dict[tuple[str, date], set[str]] = {}
    for strategy in approved:
        if strategy not in wb.sheetnames:
            continue
        source = wb[strategy]
        header_row = None
        headers = {}
        for row_number in range(1, 12):
            candidate = {str(cell.value).strip(): cell.column for cell in source[row_number] if cell.value is not None}
            if "Symbol" in candidate and ("Signal date" in candidate or "Signal Date" in candidate):
                header_row = row_number
                headers = candidate
                break
        if not header_row:
            continue
        symbol_col = headers["Symbol"]
        date_col = headers.get("Signal date") or headers.get("Signal Date")
        for row in source.iter_rows(min_row=header_row + 1, values_only=False):
            raw_symbol = row[symbol_col - 1].value if len(row) >= symbol_col else None
            signal_date = _normalise_signal_date(row[date_col - 1].value if len(row) >= date_col else None)
            symbol = str(raw_symbol or "").strip().upper()
            if not symbol or not signal_date:
                continue
            records.setdefault((symbol, signal_date), set()).add(strategy)

    existing = set(wb.sheetnames)
    title = safe_sheet_name("Signal Pivot", existing)
    ws = wb.create_sheet(title, 1)
    ws.sheet_view.showGridLines = False
    dark = PatternFill("solid", fgColor="111827")
    teal = PatternFill("solid", fgColor="0F766E")
    green = PatternFill("solid", fgColor="DCFCE7")
    white = Font(color="FFFFFF", bold=True, name="Arial")
    thin = Side(style="thin", color="D1D5DB")

    ws.merge_cells("A1:H1")
    ws["A1"] = "Signal Pivot | 90-Session Scan History"
    ws["A1"].font = Font(color="FFFFFF", bold=True, size=16, name="Arial")
    ws["A1"].fill = dark
    ws["A1"].alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 28
    ws.merge_cells("A2:H2")
    ws["A2"] = (
        "Grouped by latest signal date and symbol. Same-day records are consolidated into one row with all matching "
        "approved strategies. ‘For Chart’ is copy-ready for TradingView; Chart Link opens the same symbol."
    )
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[2].height = 32

    headers = ["Month", "Day", "Latest Signal Date", "Symbol", "Strategies", "For Chart", "Chart Link", "Signal Status"]
    for idx, header in enumerate(headers, start=1):
        cell = ws.cell(4, idx, header)
        cell.fill = teal
        cell.font = white
        cell.alignment = Alignment(wrap_text=True, vertical="center")

    for row_number, ((symbol, signal_date), strategies) in enumerate(sorted(records.items(), key=lambda item: (item[0][1], item[0][0]), reverse=True), start=5):
        strategy_text = ", ".join(s for s in approved if s in strategies)
        values = [signal_date.strftime("%b"), signal_date.strftime("%d-%b"), signal_date, symbol, strategy_text, f"NSE:{symbol}", "Open Chart", "HISTORICAL_MATCH"]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row_number, col, value)
            cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws.cell(row_number, 3).number_format = "yyyy-mm-dd"
        for_chart = ws.cell(row_number, 6)
        for_chart.fill = green
        for_chart.font = Font(name="Arial", bold=True, color="166534")
        link = ws.cell(row_number, 7)
        link.hyperlink = f"https://www.tradingview.com/chart/?symbol=NSE%3A{symbol}"
        link.style = "Hyperlink"

    for row in ws.iter_rows():
        for cell in row:
            cell.border = Border(top=thin, bottom=thin, left=thin, right=thin)
    for col, width in {"A": 12, "B": 14, "C": 19, "D": 16, "E": 24, "F": 18, "G": 16, "H": 20}.items():
        ws.column_dimensions[col].width = width
    ws.auto_filter.ref = f"A4:H{ws.max_row}"
    ws.freeze_panes = "A5"


def merge_workbooks(technical_path: Path, fundamental_path: Path, output_path: Path) -> None:
    if not technical_path.exists():
        raise FileNotFoundError(f"Technical workbook not found: {technical_path}")
    if not fundamental_path.exists():
        raise FileNotFoundError(f"Fundamental workbook not found: {fundamental_path}")

    technical_wb = load_workbook(technical_path)
    fundamental_wb = load_workbook(fundamental_path)
    existing = set(technical_wb.sheetnames)

    for source_ws in fundamental_wb.worksheets:
        prefix = "Fundamental - " if source_ws.title in existing else ""
        target_title = safe_sheet_name(source_ws.title, existing, prefix=prefix)
        target_ws = technical_wb.create_sheet(target_title)
        copy_sheet(source_ws, target_ws)

    add_merge_index(technical_wb, technical_path, fundamental_path)
    add_executive_summary(technical_wb)
    add_signal_pivot(technical_wb)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    technical_wb.save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--technical", type=Path, default=DEFAULT_TECHNICAL)
    parser.add_argument("--fundamental", type=Path, default=DEFAULT_FUNDAMENTAL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    merge_workbooks(args.technical, args.fundamental, args.output)
    print(args.output)


if __name__ == "__main__":
    main()
