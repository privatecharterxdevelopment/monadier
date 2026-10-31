#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apply Hindi + Urdu translations onto copies of en.json."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "i18n" / "locales"
SCRIPTS = Path(__file__).resolve().parent


def unique_strings(obj) -> list[str]:
    seen: list[str] = []

    def collect(node) -> None:
        if isinstance(node, dict):
            for v in node.values():
                collect(v)
        elif isinstance(node, list):
            for x in node:
                collect(x)
        elif isinstance(node, str) and node not in seen:
            seen.append(node)

    collect(obj)
    return seen

SKIP_KEYS = {"tab", "id"}
PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}")
HTML_TAG = re.compile(r"</?[^>]+>")

KEEP = {
    "",
    "English",
    "Deutsch",
    "中文",
    "日本語",
    "ไทย",
    "Español",
    "Italiano",
    "Русский",
    "हिन्दी",
    "اردو",
    "HyperGain",
    "Hyperliquid",
    "HypurrScan",
    "MetaMask",
    "$5",
    "$20",
    "LIVE",
    "TWAP",
    "TP/SL",
    "LVRG",
    "SL",
    "PnL",
    "uPnL",
    "P/L",
    "ALL",
    "BUYS",
    "SELLS",
    "your@email.com",
    "John Smith",
    "trader_jane",
    "Switzerland",
    "BTC LONG 81%",
    "Hyperliquid · HIP-4",
    "USDC (unified)",
    "USDC (Perp)",
    "USDC (Spot)",
    "User ID:",
}


def placeholders(s: str) -> list[str]:
    return PLACEHOLDER.findall(s)


def walk(obj, mapping: dict[str, str], missing: list[str], path: str = ""):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            child = f"{path}.{k}" if path else k
            if k in SKIP_KEYS:
                out[k] = v
            else:
                out[k] = walk(v, mapping, missing, child)
        return out
    if isinstance(obj, list):
        return [walk(x, mapping, missing, f"{path}[]") for x in obj]
    if isinstance(obj, str):
        if obj in KEEP:
            return obj
        if obj in mapping:
            tr = mapping[obj]
            if sorted(placeholders(obj)) != sorted(placeholders(tr)):
                raise SystemExit(f"Placeholder mismatch at {path}:\n  EN: {obj}\n  TR: {tr}")
            return tr
        if obj.strip() and obj not in missing:
            missing.append(obj)
        return obj
    return obj


def main() -> None:
    en = json.loads((ROOT / "en.json").read_text(encoding="utf-8"))
    keys = unique_strings(en)
    failed = False
    for code in ("hi", "ur"):
        lst = json.loads((SCRIPTS / f"i18n_{code}_list.json").read_text(encoding="utf-8"))
        if len(lst) != len(keys):
            raise SystemExit(f"{code} list length {len(lst)} != unique EN {len(keys)}")
        mapping = dict(zip(keys, lst))
        missing: list[str] = []
        out = walk(en, mapping, missing)
        (ROOT / f"{code}.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"{code}: wrote {ROOT / f'{code}.json'} missing={len(missing)}")
        for s in missing[:40]:
            print(f"  MISSING {code}: {s[:120]}")
            failed = True
        if len(missing) > 40:
            print(f"  … {len(missing) - 40} more")
            failed = True
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
