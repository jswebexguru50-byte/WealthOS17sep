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
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
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

    ws["A1"] = "Combined Technical + Fundamental Dossier"
    ws["A1"].font = Font(color="FFFFFF", bold=True, size=16, name="Arial")
    ws["A1"].fill = dark
    ws.merge_cells("A1:F1")

    rows = [
        ("Created At", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        ("Technical Source", str(technical_path)),
        ("Fundamental Source", str(fundamental_path)),
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
        ws[f"B{r}"] = "Index" if sheet == title else ("Fundamental" if sheet.startswith("Fundamental") or sheet in {"All 179 Dossier", "Fully Compliant", "Partial or Failed", "Source Audit Trail", "Data Dictionary"} else "Technical")
        ws[f"C{r}"] = "Merged workbook navigation and provenance" if sheet == title else "Preserved from source workbook"

    widths = {"A": 34, "B": 18, "C": 70, "D": 14, "E": 14, "F": 14}
    for col, width in widths.items():
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A11"


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
