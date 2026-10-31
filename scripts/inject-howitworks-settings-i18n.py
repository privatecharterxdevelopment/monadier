#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inject marketing.howItWorks.settings* into all locale JSON files."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "i18n" / "locales"

COPY: dict[str, dict] = {
    "en": {
        "settingsTitle": "Bot settings in the app",
        "settingsSub": "In Bot trade you set leverage, risk, slots, stop loss, and the win-rate gate — the same controls as in the HyperGain app. Save applies to new opens.",
        "settings": [
            {
                "title": "Leverage",
                "text": "How hard each position is geared on Hyperliquid (slider up to 40×). HL caps vary by asset — e.g. BTC max 40× on the slider; the bot clamps to each market’s cap when it opens. High leverage means a small adverse move can liquidate (around ~2.3% at 40×).",
            },
            {
                "title": "Risk per trade",
                "text": "Share of your Hyperliquid balance used as margin for a trade — not leverage. Presets from 1% to 100%. The app shows estimated margin per slot and notional (margin × leverage). Example: 90% risk with 2 slots splits that margin across both open positions.",
            },
            {
                "title": "Open trade slots",
                "text": "How many bot positions can be open at once (2 or 3). Risk % splits across slots (½ with 2, ⅓ with 3). Uses your full HL balance unless you set an AI betting budget. You can change slots and save even while the bot is running.",
            },
            {
                "title": "Stop loss",
                "text": "Max loss on margin while the position is in the red. Off (bot decides) = profit trail only when green — no automatic close while red. Or pick 5–50% / custom % and the bot closes at that loss on margin.",
            },
            {
                "title": "Win rate gate",
                "text": "Optional pause on new trades if recent win rate falls below your threshold. Off = the bot can open regardless of recent win rate.",
            },
        ],
        "settingsNote": "Save settings stores risk, leverage, stop loss, slots, and the win-rate gate. Start/stop trading from the Bot tab. While the bot is running you can still change slots and save — stop the bot to edit leverage, risk, or stop loss.",
    },
    "de": {
        "settingsTitle": "Bot-Einstellungen in der App",
        "settingsSub": "Unter Bot trade stellst du Hebel, Risk, Slots, Stop-Loss und das Win-Rate-Gate ein — dieselben Controls wie in der HyperGain-App. Speichern gilt für neue Opens.",
        "settings": [
            {
                "title": "Leverage (Hebel)",
                "text": "Wie stark jede Position auf Hyperliquid gehebelt wird (Slider bis 40×). HL-Caps sind asset-abhängig — z. B. BTC max. 40× am Slider; der Bot clamped beim Open auf das Markt-Cap. Hoher Hebel: schon eine kleine Gegenbewegung kann liquidieren (ca. ~2,3 % bei 40×).",
            },
            {
                "title": "Risk per trade",
                "text": "Anteil deines Hyperliquid-Guthabens als Margin pro Trade — nicht der Hebel. Presets von 1 % bis 100 %. Die App zeigt geschätzte Margin pro Slot und Notional (Margin × Hebel). Beispiel: 90 % Risk mit 2 Slots teilt die Margin auf beide offenen Positionen.",
            },
            {
                "title": "Open trade slots",
                "text": "Wie viele Bot-Positionen gleichzeitig offen sein dürfen (2 oder 3). Risk % wird auf die Slots aufgeteilt (½ bei 2, ⅓ bei 3). Nutzt dein volles HL-Guthaben, außer du setzt ein AI-Betting-Budget. Slots kannst du auch bei laufendem Bot ändern und speichern.",
            },
            {
                "title": "Stop loss",
                "text": "Max. Verlust auf der Margin, solange die Position im Minus ist. Off (Bot entscheidet) = nur Profit-Trail im Plus — kein Auto-Close im Rot. Oder 5–50 % / Custom %: der Bot schließt bei diesem Margin-Verlust.",
            },
            {
                "title": "Win rate gate",
                "text": "Optional: neue Trades pausieren, wenn die aktuelle Win-Rate unter deinem Schwellenwert liegt. Off = der Bot öffnet unabhängig von der jüngsten Win-Rate.",
            },
        ],
        "settingsNote": "Save settings speichert Risk, Hebel, Stop-Loss, Slots und das Win-Rate-Gate. Start/Stop im Bot-Tab. Bei laufendem Bot kannst du Slots noch ändern und speichern — für Hebel, Risk oder Stop-Loss den Bot stoppen.",
    },
    "zh": {
        "settingsTitle": "应用内的机器人设置",
        "settingsSub": "在 Bot trade 中设置杠杆、风险、仓位槽、止损与胜率门槛——与 HyperGain 应用中相同。保存后作用于新开仓。",
        "settings": [
            {
                "title": "杠杆（Leverage）",
                "text": "每笔仓位在 Hyperliquid 上的杠杆倍数（滑块最高 40×）。HL 按资产设上限——例如 BTC 滑块最高 40×；开仓时机器人会钳制到该市场上限。高杠杆下很小的逆向波动即可强平（约 40× 时 ~2.3%）。",
            },
            {
                "title": "每笔风险（Risk per trade）",
                "text": "使用 Hyperliquid 余额作为保证金的比例——不是杠杆。预设 1%–100%。应用会显示每槽预估保证金与名义价值（保证金 × 杠杆）。例如：90% 风险 + 2 个槽会把保证金分到两个持仓。",
            },
            {
                "title": "同时开仓槽（Open trade slots）",
                "text": "机器人可同时持有的仓位数（2 或 3）。风险%按槽均分（2 槽各 ½，3 槽各 ⅓）。默认用全部 HL 余额，除非你设置了 AI 投注预算。机器人运行中仍可改槽并保存。",
            },
            {
                "title": "止损（Stop loss）",
                "text": "仓位亏损时保证金上的最大损失。关闭（机器人决定）= 仅在盈利时利润追踪——亏损时不自动平仓。或选 5–50%/自定义%，机器人在该保证金亏损处平仓。",
            },
            {
                "title": "胜率门槛（Win rate gate）",
                "text": "可选：若近期胜率低于你的阈值则暂停新开仓。关闭 = 无论近期胜率如何都可开仓。",
            },
        ],
        "settingsNote": "保存设置会存储风险、杠杆、止损、槽位与胜率门槛。在 Bot 标签页启动/停止交易。机器人运行中仍可改槽并保存——要改杠杆、风险或止损请先停止机器人。",
    },
    "ja": {
        "settingsTitle": "アプリのボット設定",
        "settingsSub": "Bot trade でレバレッジ、リスク、スロット、ストップロス、勝率ゲートを設定します — HyperGain アプリと同じコントロールです。保存は新規オープンに適用されます。",
        "settings": [
            {
                "title": "レバレッジ（Leverage）",
                "text": "各ポジションの Hyperliquid 上のレバレッジ（スライダー最大 40×）。HL の上限は銘柄ごと — 例: BTC はスライダー最大 40×。ボットはオープン時に各市場の上限へクランプします。高レバレッジでは小さな逆行で清算され得ます（40× で約 ~2.3%）。",
            },
            {
                "title": "トレードあたりのリスク（Risk per trade）",
                "text": "トレードの証拠金として使う Hyperliquid 残高の割合 — レバレッジではありません。プリセット 1%〜100%。アプリはスロットあたりの推定証拠金と想定元本（証拠金×レバレッジ）を表示します。例: リスク 90%・スロット 2 なら証拠金を両ポジションに分割。",
            },
            {
                "title": "オープンスロット（Open trade slots）",
                "text": "同時に持てるボットポジション数（2 または 3）。リスク%はスロットで分割（2 なら ½、3 なら ⅓）。AI ベッティング予算を設定しない限り、HL 残高全体を使います。ボット稼働中でもスロット変更と保存は可能です。",
            },
            {
                "title": "ストップロス（Stop loss）",
                "text": "ポジションが赤字のときの証拠金上の最大損失。Off（ボット判断）= 利益時のみプロフィットトレイル — 赤字では自動決済しません。5〜50%／カスタム%を選ぶと、その証拠金損失でクローズします。",
            },
            {
                "title": "勝率ゲート（Win rate gate）",
                "text": "任意: 直近の勝率がしきい値を下回ったら新規トレードを一時停止。Off = 直近勝率に関係なくオープン可能。",
            },
        ],
        "settingsNote": "設定の保存でリスク、レバレッジ、ストップロス、スロット、勝率ゲートを保存します。売買の開始／停止は Bot タブから。ボット稼働中でもスロットは変更・保存できます — レバレッジ、リスク、ストップロスを変えるにはボットを停止してください。",
    },
    "th": {
        "settingsTitle": "การตั้งค่าบอทในแอป",
        "settingsSub": "ใน Bot trade คุณตั้งเลเวอเรจ ความเสี่ยง สล็อต สต็อปลอส และเกตอัตราชนะ — เหมือนในแอป HyperGain การบันทึกใช้กับการเปิดใหม่",
        "settings": [
            {
                "title": "เลเวอเรจ (Leverage)",
                "text": "ระดับเกียร์ของแต่ละโพสิชันบน Hyperliquid (สไลเดอร์สูงสุด 40×) HL จำกัดตามสินทรัพย์ — เช่น BTC สูงสุด 40× บนสไลเดอร์ บอทจะ clamp ตามเพดานตลาดตอนเปิด เลเวอเรจสูงทำให้ราคาขยับเล็กน้อยก็อาจถูกบังคับปิดได้ (ราว ~2.3% ที่ 40×)",
            },
            {
                "title": "ความเสี่ยงต่อดีล (Risk per trade)",
                "text": "สัดส่วนยอด HL ที่ใช้เป็นมาร์จิ้นต่อดีล — ไม่ใช่เลเวอเรจ พรีเซ็ต 1%–100% แอปแสดงมาร์จิ้นโดยประมาณต่อสล็อตและมูลค่าสมมติ (มาร์จิ้น × เลเวอเรจ) ตัวอย่าง: ความเสี่ยง 90% กับ 2 สล็อตจะแบ่งมาร์จิ้นไปทั้งสองโพสิชัน",
            },
            {
                "title": "สล็อตเปิดดีล (Open trade slots)",
                "text": "จำนวนโพสิชันบอทที่เปิดพร้อมกันได้ (2 หรือ 3) ความเสี่ยง% ถูกแบ่งตามสล็อต (½ เมื่อ 2, ⅓ เมื่อ 3) ใช้ยอด HL ทั้งหมด เว้นแต่ตั้งงบ AI betting ไว้ เปลี่ยนสล็อตและบันทึกได้แม้บอทกำลังรัน",
            },
            {
                "title": "สต็อปลอส (Stop loss)",
                "text": "ขาดทุนสูงสุดบนมาร์จิ้นขณะโพสิชันติดลบ Off (บอทตัดสิน) = ตามกำไรเมื่อเขียวเท่านั้น — ไม่ปิดอัตโนมัติตอนแดง หรือเลือก 5–50%/กำหนดเอง แล้วบอทจะปิดที่ขาดทุนมาร์จิ้นนั้น",
            },
            {
                "title": "เกตอัตราชนะ (Win rate gate)",
                "text": "ทางเลือก: หยุดเปิดดีลใหม่หากอัตราชนะล่าสุดต่ำกว่าเกณฑ์ Off = บอทเปิดได้ไม่ว่าอัตราชนะล่าสุดจะเป็นอย่างไร",
            },
        ],
        "settingsNote": "บันทึกการตั้งค่าจะเก็บความเสี่ยง เลเวอเรจ สต็อปลอส สล็อต และเกตอัตราชนะ เริ่ม/หยุดเทรดที่แท็บ Bot ขณะบอทรันยังเปลี่ยนสล็อตและบันทึกได้ — หยุดบอทก่อนแก้เลเวอเรจ ความเสี่ยง หรือสต็อปลอส",
    },
    "es": {
        "settingsTitle": "Ajustes del bot en la app",
        "settingsSub": "En Bot trade defines apalancamiento, riesgo, slots, stop loss y la puerta de win rate — los mismos controles que en la app HyperGain. Guardar aplica a nuevas aperturas.",
        "settings": [
            {
                "title": "Apalancamiento (Leverage)",
                "text": "Cuánta palanca lleva cada posición en Hyperliquid (slider hasta 40×). Los caps de HL varían por activo — p. ej. BTC máx. 40× en el slider; el bot limita al cap del mercado al abrir. Alto apalancamiento: un movimiento adverso pequeño puede liquidar (alrededor de ~2,3% a 40×).",
            },
            {
                "title": "Riesgo por trade",
                "text": "Porcentaje de tu saldo Hyperliquid usado como margen — no es apalancamiento. Presets del 1% al 100%. La app muestra margen estimado por slot y nocional (margen × apalancamiento). Ejemplo: 90% de riesgo con 2 slots reparte ese margen entre ambas posiciones abiertas.",
            },
            {
                "title": "Slots de trades abiertos",
                "text": "Cuántas posiciones del bot pueden estar abiertas a la vez (2 o 3). El % de riesgo se reparte entre slots (½ con 2, ⅓ con 3). Usa todo tu saldo HL salvo que fijes un presupuesto de AI betting. Puedes cambiar slots y guardar aunque el bot esté en marcha.",
            },
            {
                "title": "Stop loss",
                "text": "Pérdida máxima sobre el margen mientras la posición está en rojo. Off (decide el bot) = solo trail de beneficios en verde — sin cierre automático en rojo. O elige 5–50% / % personalizado y el bot cierra a esa pérdida de margen.",
            },
            {
                "title": "Puerta de win rate",
                "text": "Opcional: pausar nuevas operaciones si el win rate reciente cae por debajo de tu umbral. Off = el bot puede abrir sin mirar el win rate reciente.",
            },
        ],
        "settingsNote": "Guardar ajustes almacena riesgo, apalancamiento, stop loss, slots y la puerta de win rate. Inicia/para el trading en la pestaña Bot. Con el bot en marcha aún puedes cambiar slots y guardar — para editar apalancamiento, riesgo o stop loss, detén el bot.",
    },
    "it": {
        "settingsTitle": "Impostazioni bot nell’app",
        "settingsSub": "In Bot trade imposti leva, rischio, slot, stop loss e win-rate gate — gli stessi controlli dell’app HyperGain. Salva si applica alle nuove aperture.",
        "settings": [
            {
                "title": "Leva (Leverage)",
                "text": "Quanto è leverata ogni posizione su Hyperliquid (slider fino a 40×). I cap HL variano per asset — es. BTC max 40× sullo slider; il bot clampa al cap del mercato all’apertura. Alta leva: un piccolo movimento avverso può liquidare (circa ~2,3% a 40×).",
            },
            {
                "title": "Rischio per trade",
                "text": "Quota del saldo Hyperliquid usata come margine — non è la leva. Preset dall’1% al 100%. L’app mostra margine stimato per slot e nozionale (margine × leva). Esempio: 90% rischio con 2 slot divide quel margine su entrambe le posizioni aperte.",
            },
            {
                "title": "Slot trade aperti",
                "text": "Quante posizioni bot possono essere aperte insieme (2 o 3). Il % di rischio si divide tra gli slot (½ con 2, ⅓ con 3). Usa tutto il saldo HL salvo un budget AI betting. Puoi cambiare gli slot e salvare anche a bot avviato.",
            },
            {
                "title": "Stop loss",
                "text": "Perdita massima sul margine mentre la posizione è in rosso. Off (decide il bot) = solo profit trail in verde — nessun auto-close in rosso. Oppure scegli 5–50% / % custom e il bot chiude a quella perdita sul margine.",
            },
            {
                "title": "Win rate gate",
                "text": "Opzionale: metti in pausa nuovi trade se il win rate recente scende sotto la soglia. Off = il bot può aprire indipendentemente dal win rate recente.",
            },
        ],
        "settingsNote": "Salva impostazioni memorizza rischio, leva, stop loss, slot e win-rate gate. Avvia/ferma il trading dalla tab Bot. A bot avviato puoi ancora cambiare gli slot e salvare — per modificare leva, rischio o stop loss ferma il bot.",
    },
    "ru": {
        "settingsTitle": "Настройки бота в приложении",
        "settingsSub": "В Bot trade задаются плечо, риск, слоты, стоп-лосс и win-rate gate — те же контролы, что в приложении HyperGain. Сохранение действует на новые открытия.",
        "settings": [
            {
                "title": "Плечо (Leverage)",
                "text": "Насколько каждая позиция заплечована на Hyperliquid (слайдер до 40×). Лимиты HL зависят от актива — например BTC макс. 40× на слайдере; бот при открытии ограничивает до капа рынка. Высокое плечо: небольшое движение против может ликвидировать (около ~2,3% при 40×).",
            },
            {
                "title": "Риск на сделку",
                "text": "Доля баланса Hyperliquid, используемая как маржа — это не плечо. Пресеты от 1% до 100%. В приложении показаны оценка маржи на слот и нотионал (маржа × плечо). Пример: риск 90% при 2 слотах делит маржу на обе открытые позиции.",
            },
            {
                "title": "Слоты открытых сделок",
                "text": "Сколько позиций бота может быть открыто одновременно (2 или 3). Риск % делится по слотам (½ при 2, ⅓ при 3). Используется весь HL-баланс, если не задан AI betting budget. Слоты можно менять и сохранять даже при работающем боте.",
            },
            {
                "title": "Стоп-лосс",
                "text": "Макс. убыток по марже, пока позиция в минусе. Off (решает бот) = только profit trail в плюсе — без авто-закрытия в красной зоне. Или 5–50% / свой % — бот закрывает при этом убытке по марже.",
            },
            {
                "title": "Win rate gate",
                "text": "Опционально: пауза новых сделок, если недавний win rate ниже порога. Off = бот может открывать независимо от недавнего win rate.",
            },
        ],
        "settingsNote": "Сохранение записывает риск, плечо, стоп-лосс, слоты и win-rate gate. Старт/стоп торговли — во вкладке Bot. При работающем боте слоты ещё можно менять и сохранять — чтобы править плечо, риск или стоп-лосс, остановите бота.",
    },
}


def main() -> None:
    for code, payload in COPY.items():
        path = ROOT / f"{code}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        how = data.setdefault("marketing", {}).setdefault("howItWorks", {})
        how.update(payload)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"updated {path.name}")


if __name__ == "__main__":
    main()
