#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inject landing.legal translations into all locale JSON files."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "i18n" / "locales"

LEGAL: dict[str, dict] = {
    "en": {
        "ariaLabel": "Legal disclosures",
        "operator": [
            "Trading on {{brand}} connects your wallet to your own Hyperliquid account. Orders are placed on Hyperliquid perpetual and outcome markets using your USDC margin — this is live trading with real financial instruments, not a simulated or demo evaluation program.",
            "{{brand}} was founded, created, and developed by Lorenzo Vanza. The website {{domain}} provides access to automated trading tools, dashboards, and optional sports outcome markets on Hyperliquid. Full operational and legal responsibility is currently carried privately by Lorenzo Vanza, who acknowledges that he is presently overwhelmed by the product. Official X/Twitter (only): @{{xHandle}}. {{brand}} is NOT on Telegram — any Telegram account, group, bot, or DM claiming to represent {{brand}} is a scam. Any other social account is not official. For legal or compliance inquiries, contact {{email}}.",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "Legal disclosure",
                "paragraphs": [
                    "{{brand}} provides software that may automate entries and exits on Hyperliquid based on configured settings and market signals. The service is designed to assist with execution and monitoring — it does not constitute a guarantee of profitability or risk-free trading."
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "No promised or guaranteed returns",
                "paragraphs": [
                    "Nothing on {{domain}}, in the app, in marketing materials, or in support communications constitutes a promise, projection, or guarantee of profit, yield, or any specific trading outcome. Crypto and leveraged derivatives are speculative. You may lose some or all of your margin. Examples, win rates, backtests, and past bot performance are illustrative only and are not indicative of future results.",
                    "Returns vary by market conditions, leverage, fees, slippage, latency, and user settings. Automated systems can misread markets, fail during volatility, or stop operating due to technical issues. You alone bear the financial risk of every trade.",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "Country-specific responsibility",
                "paragraphs": [
                    "You are solely responsible for determining whether your use of HyperGain, Hyperliquid, crypto derivatives, automated trading bots, sports outcome markets, or related services is permitted in your country or region of residence, citizenship, or access.",
                    "Residents of India and other jurisdictions with specific crypto, derivatives, or gambling tax and reporting rules must comply with their local laws — including income tax, GST, TDS, or equivalent obligations. HyperGain does not provide tax advice and does not file returns on your behalf.",
                    "If automated trading, leveraged crypto, or prediction markets are restricted or prohibited where you live, you must not use the service. Accessing HyperGain via VPN, proxy, or location masking to circumvent restrictions is prohibited (see Terms of Service). We accept no liability for unlawful use.",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN & location masking",
                "paragraphs": [
                    "Use of VPNs, proxies, Tor, or similar tools to access {{brand}} while concealing your true location is against our policies when done to bypass geographic restrictions, compliance controls, or account enforcement.",
                    "{{brand}} does not accept liability for losses, account actions, regulatory exposure, or tax consequences arising from VPN or proxy use. We may detect circumvention attempts and suspend or permanently terminate accounts without refund of accrued platform fees or unused software access.",
                ],
            },
            {
                "id": "no-custody",
                "heading": "No client fund custody",
                "paragraphs": [
                    "{{brand}} is not a broker, dealer, exchange, custodian, bank, or investment adviser. We do not accept, hold, or manage client deposits. Your USDC remains on your Hyperliquid account in your name. Deposits and withdrawals require your wallet signature; the approved trading agent may place orders but cannot withdraw funds without you."
                ],
            },
            {
                "id": "live-trading",
                "heading": "Live trading — real risk",
                "paragraphs": [
                    "Unlike paper or evaluation accounts, {{brand}} automates real positions on Hyperliquid. You can lose part or all of your margin. Leverage amplifies gains and losses. Only use capital you can afford to lose and ensure crypto derivatives are permitted where you live."
                ],
            },
            {
                "id": "not-advice",
                "heading": "Not investment advice",
                "paragraphs": [
                    "All content, signals, dashboards, and tools are provided for informational and software-access purposes only. Nothing on this site is investment, tax, or legal advice, or a solicitation to buy or sell any financial product, cryptocurrency, or derivative. Consult independent advisers before trading."
                ],
            },
            {
                "id": "performance",
                "heading": "Performance disclosure",
                "paragraphs": [
                    "Past performance, win rates, backtests, or examples shown in marketing or the app are not indicative of future results. Automated strategies can fail during volatile, illiquid, or news-driven conditions. Hypothetical or simulated results have inherent limitations and may not reflect actual trading costs, slippage, or latency."
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "Jurisdictional restrictions",
                "paragraphs": [
                    "You must be at least 18 years old and legally permitted to use crypto derivatives in your jurisdiction. {{brand}} does not target users where such services are prohibited. It is your responsibility to comply with local laws, sanctions, and tax obligations. Access may be restricted or terminated where required by law."
                ],
            },
            {
                "id": "risk",
                "heading": "Risk warning",
                "paragraphs": [
                    "Trading perpetual futures, leveraged crypto, and on-chain outcome markets involves substantial risk of loss. Markets can gap, liquidate positions, or become temporarily unavailable. Smart-contract, bridge, wallet, and third-party protocol risks apply. Hyperliquid is a separate platform governed by its own terms."
                ],
            },
            {
                "id": "fees",
                "heading": "Fees & refunds",
                "paragraphs": [
                    "Hyperliquid protocol and network fees apply to each trade. HyperGain may charge success-based platform fees on profitable closes, builder fees, or other charges as disclosed in the app. Unpaid accrued platform fees may block new bot opens and in-app Hyperliquid withdrawals until settled. See Terms of Service for the current fee schedule and enforcement rules."
                ],
            },
        ],
        "tagline": "Not a bank deposit · Not FDIC or government insured · No guaranteed returns · You may lose all invested capital",
    },
    "de": {
        "ariaLabel": "Rechtliche Hinweise",
        "operator": [
            "Der Handel über {{brand}} verbindet deine Wallet mit deinem eigenen Hyperliquid-Konto. Orders werden auf Hyperliquid-Perpetuals und Outcome-Märkten mit deiner USDC-Margin ausgeführt — das ist Live-Handel mit echten Finanzinstrumenten, kein simuliertes oder Demo-Evaluierungsprogramm.",
            "{{brand}} wurde von Lorenzo Vanza gegründet, erstellt und entwickelt. Die Website {{domain}} bietet Zugang zu automatisierten Trading-Tools, Dashboards und optionalen Sport-Outcome-Märkten auf Hyperliquid. Die volle operative und rechtliche Verantwortung trägt derzeit privat Lorenzo Vanza, der einräumt, dass er vom Produkt derzeit überlastet ist. Offizielles X/Twitter (nur): @{{xHandle}}. {{brand}} ist NICHT auf Telegram — jedes Telegram-Konto, jede Gruppe, jeder Bot oder jede DM, die vorgibt, {{brand}} zu vertreten, ist ein Betrug. Jeder andere Social-Account ist nicht offiziell. Für rechtliche oder Compliance-Anfragen: {{email}}.",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "Rechtlicher Hinweis",
                "paragraphs": [
                    "{{brand}} stellt Software bereit, die Ein- und Ausstiege auf Hyperliquid anhand konfigurierter Einstellungen und Marktsignale automatisieren kann. Der Dienst soll Ausführung und Überwachung unterstützen — er stellt keine Garantie für Profitabilität oder risikofreies Trading dar."
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "Keine versprochenen oder garantierten Renditen",
                "paragraphs": [
                    "Nichts auf {{domain}}, in der App, in Marketingmaterialien oder im Support stellt ein Versprechen, eine Prognose oder Garantie für Gewinn, Yield oder ein bestimmtes Trading-Ergebnis dar. Krypto und gehebelte Derivate sind spekulativ. Du kannst einen Teil oder die gesamte Margin verlieren. Beispiele, Win-Rates, Backtests und vergangene Bot-Performance dienen nur der Veranschaulichung und sind kein Indikator für zukünftige Ergebnisse.",
                    "Renditen hängen von Marktbedingungen, Hebel, Gebühren, Slippage, Latenz und User-Einstellungen ab. Automatisierte Systeme können Märkte falsch lesen, bei Volatilität versagen oder aus technischen Gründen ausfallen. Das finanzielle Risiko jedes Trades trägst allein du.",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "Länderspezifische Verantwortung",
                "paragraphs": [
                    "Du bist allein dafür verantwortlich festzustellen, ob die Nutzung von HyperGain, Hyperliquid, Krypto-Derivaten, automatisierten Trading-Bots, Sport-Outcome-Märkten oder verwandten Diensten in deinem Wohnsitz-, Staatsangehörigkeits- oder Zugangsgebiet erlaubt ist.",
                    "Einwohner Indiens und anderer Rechtsordnungen mit speziellen Steuer- und Meldepflichten für Krypto, Derivate oder Glücksspiel müssen ihre lokalen Gesetze einhalten — einschließlich Einkommensteuer, GST, TDS oder gleichwertiger Pflichten. HyperGain erteilt keine Steuerberatung und reicht keine Erklärungen für dich ein.",
                    "Wenn automatisierter Handel, gehebeltes Krypto oder Prediction Markets dort, wo du lebst, eingeschränkt oder verboten sind, darfst du den Dienst nicht nutzen. Der Zugriff auf HyperGain über VPN, Proxy oder Standortverschleierung zur Umgehung von Beschränkungen ist untersagt (siehe AGB). Für rechtswidrige Nutzung übernehmen wir keine Haftung.",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN & Standortverschleierung",
                "paragraphs": [
                    "Die Nutzung von VPNs, Proxys, Tor oder ähnlichen Tools zum Zugriff auf {{brand}} unter Verschleierung deines tatsächlichen Standorts verstößt gegen unsere Richtlinien, wenn damit geografische Beschränkungen, Compliance-Kontrollen oder Konto-Durchsetzung umgangen werden sollen.",
                    "{{brand}} übernimmt keine Haftung für Verluste, Kontomaßnahmen, regulatorische Risiken oder Steuerfolgen aus VPN- oder Proxy-Nutzung. Wir können Umgehungsversuche erkennen und Konten ohne Erstattung aufgelaufener Plattformgebühren oder ungenutzten Softwarezugangs sperren oder dauerhaft beenden.",
                ],
            },
            {
                "id": "no-custody",
                "heading": "Keine Verwahrung von Kundengeldern",
                "paragraphs": [
                    "{{brand}} ist kein Broker, Dealer, Exchange, Custodian, Bank oder Anlageberater. Wir nehmen keine Kundeneinlagen an, halten oder verwalten sie nicht. Dein USDC bleibt auf deinem Hyperliquid-Konto auf deinen Namen. Ein- und Auszahlungen erfordern deine Wallet-Signatur; der freigegebene Trading-Agent kann Orders platzieren, aber ohne dich keine Gelder abheben."
                ],
            },
            {
                "id": "live-trading",
                "heading": "Live-Trading — echtes Risiko",
                "paragraphs": [
                    "Im Gegensatz zu Paper- oder Evaluierungskonten automatisiert {{brand}} echte Positionen auf Hyperliquid. Du kannst einen Teil oder die gesamte Margin verlieren. Hebel verstärkt Gewinne und Verluste. Nutze nur Kapital, dessen Verlust du verkraften kannst, und stelle sicher, dass Krypto-Derivate dort erlaubt sind, wo du lebst."
                ],
            },
            {
                "id": "not-advice",
                "heading": "Keine Anlageberatung",
                "paragraphs": [
                    "Alle Inhalte, Signale, Dashboards und Tools dienen ausschließlich Informations- und Softwarezugangszwecken. Nichts auf dieser Website ist Anlage-, Steuer- oder Rechtsberatung oder eine Aufforderung zum Kauf oder Verkauf eines Finanzprodukts, einer Kryptowährung oder eines Derivats. Hole vor dem Trading unabhängigen Rat ein."
                ],
            },
            {
                "id": "performance",
                "heading": "Performance-Hinweis",
                "paragraphs": [
                    "Vergangene Performance, Win-Rates, Backtests oder Beispiele in Marketing oder App sind kein Indikator für zukünftige Ergebnisse. Automatisierte Strategien können bei volatilen, illiquiden oder nachrichtengetriebenen Märkten scheitern. Hypothetische oder simulierte Ergebnisse haben inhärente Grenzen und spiegeln möglicherweise nicht echte Trading-Kosten, Slippage oder Latenz wider."
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "Jurisdiktionelle Beschränkungen",
                "paragraphs": [
                    "Du musst mindestens 18 Jahre alt und in deiner Jurisdiktion rechtlich zur Nutzung von Krypto-Derivaten berechtigt sein. {{brand}} richtet sich nicht an Nutzer, wo solche Dienste verboten sind. Es liegt in deiner Verantwortung, lokale Gesetze, Sanktionen und Steuerpflichten einzuhalten. Der Zugang kann eingeschränkt oder beendet werden, wenn das Gesetz es verlangt."
                ],
            },
            {
                "id": "risk",
                "heading": "Risikohinweis",
                "paragraphs": [
                    "Der Handel mit Perpetual Futures, gehebeltem Krypto und On-Chain-Outcome-Märkten birgt erhebliches Verlustrisiko. Märkte können gapen, Positionen liquidieren oder vorübergehend nicht verfügbar sein. Smart-Contract-, Bridge-, Wallet- und Drittprotokoll-Risiken gelten. Hyperliquid ist eine separate Plattform mit eigenen Bedingungen."
                ],
            },
            {
                "id": "fees",
                "heading": "Gebühren & Erstattungen",
                "paragraphs": [
                    "Hyperliquid-Protokoll- und Netzwerkgebühren fallen bei jedem Trade an. HyperGain kann erfolgsbasierte Plattformgebühren auf profitable Closes, Builder Fees oder andere in der App ausgewiesene Gebühren erheben. Unbezahlte aufgelaufene Plattformgebühren können neue Bot-Opens und In-App-Hyperliquid-Auszahlungen bis zur Begleichung blockieren. Aktuellen Gebührenplan und Durchsetzungsregeln siehe AGB."
                ],
            },
        ],
        "tagline": "Kein Bankguthaben · Nicht FDIC- oder staatlich versichert · Keine garantierten Renditen · Du kannst das gesamte eingesetzte Kapital verlieren",
    },
}

# Additional languages follow in the same structure — filled below for brevity in this runner.


def zh() -> dict:
    return {
        "ariaLabel": "法律披露",
        "operator": [
            "通过 {{brand}} 交易会将你的钱包连接到你自己的 Hyperliquid 账户。订单使用你的 USDC 保证金在 Hyperliquid 永续与结果市场上成交——这是真实金融工具的实盘交易，而非模拟或演示评估计划。",
            "{{brand}} 由 Lorenzo Vanza创立、创建并开发。网站 {{domain}} 提供自动化交易工具、仪表盘以及 Hyperliquid 上可选的体育结果市场。目前全部运营与法律责任由 Lorenzo Vanza 私人承担，他承认目前产品压力很大。官方 X/Twitter（仅此）：@{{xHandle}}。{{brand}} 不在 Telegram 上——任何声称代表 {{brand}} 的 Telegram 账号、群组、机器人或私信均为骗局。其他社交账号均非官方。法律或合规咨询请联系 {{email}}。",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "法律披露",
                "paragraphs": [
                    "{{brand}} 提供可根据设定与市场信号在 Hyperliquid 上自动进出场的软件。该服务旨在协助执行与监控——并不构成盈利保证或无风险交易。"
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "无承诺或保证收益",
                "paragraphs": [
                    "{{domain}}、应用、营销材料或客服沟通中的任何内容均不构成对利润、收益或特定交易结果的承诺、预测或保证。加密与杠杆衍生品具有投机性。你可能损失部分或全部保证金。示例、胜率、回测与过往机器人表现仅供说明，不代表未来结果。",
                    "收益受市场状况、杠杆、费用、滑点、延迟与用户设置影响。自动化系统可能误判市场、在波动中失效，或因技术问题停止运行。每笔交易的财务风险均由你自行承担。",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "国家/地区责任",
                "paragraphs": [
                    "你须自行判断在居住地、国籍或访问地使用 HyperGain、Hyperliquid、加密衍生品、自动交易机器人、体育结果市场或相关服务是否被允许。",
                    "印度及其他对加密、衍生品或博彩有特定税务与申报要求的司法辖区居民，须遵守当地法律——包括所得税、GST、TDS 或同等义务。HyperGain 不提供税务建议，也不会代你申报。",
                    "若你所在地限制或禁止自动交易、杠杆加密或预测市场，则不得使用本服务。通过 VPN、代理或位置伪装绕过限制访问 HyperGain 被禁止（见服务条款）。我们对非法使用不承担任何责任。",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN 与位置伪装",
                "paragraphs": [
                    "使用 VPN、代理、Tor 或类似工具访问 {{brand}} 并隐藏真实位置，若意在规避地理限制、合规控制或账户执行，则违反我们的政策。",
                    "{{brand}} 不对因 VPN 或代理使用导致的损失、账户处理、监管风险或税务后果承担责任。我们可能检测规避行为，并暂停或永久终止账户，且不退还已产生的平台费用或未使用的软件访问权限。",
                ],
            },
            {
                "id": "no-custody",
                "heading": "不托管客户资金",
                "paragraphs": [
                    "{{brand}} 不是经纪商、交易商、交易所、托管方、银行或投资顾问。我们不接受、持有或管理客户存款。你的 USDC 仍留在你名下的 Hyperliquid 账户中。存取款需你的钱包签名；已批准的交易代理可下单，但未经你授权不能提现。"
                ],
            },
            {
                "id": "live-trading",
                "heading": "实盘交易——真实风险",
                "paragraphs": [
                    "与模拟或评估账户不同，{{brand}} 在 Hyperliquid 上自动化真实仓位。你可能损失部分或全部保证金。杠杆放大收益与亏损。仅使用你能承受损失的资金，并确认所在地允许加密衍生品。"
                ],
            },
            {
                "id": "not-advice",
                "heading": "非投资建议",
                "paragraphs": [
                    "所有内容、信号、仪表盘与工具仅供信息与软件访问之用途。本站任何内容均不构成投资、税务或法律建议，亦不构成买卖任何金融产品、加密货币或衍生品的招揽。交易前请咨询独立顾问。"
                ],
            },
            {
                "id": "performance",
                "heading": "业绩披露",
                "paragraphs": [
                    "营销或应用中展示的过往表现、胜率、回测或示例不代表未来结果。自动化策略可能在剧烈波动、流动性不足或消息驱动行情中失效。假设或模拟结果有固有局限，可能无法反映真实交易成本、滑点或延迟。"
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "司法管辖限制",
                "paragraphs": [
                    "你必须年满 18 岁，且在所在司法辖区合法获准使用加密衍生品。{{brand}} 不以禁止此类服务的地区用户为目标。遵守当地法律、制裁与税务义务是你的责任。法律要求时，访问可能被限制或终止。"
                ],
            },
            {
                "id": "risk",
                "heading": "风险警示",
                "paragraphs": [
                    "交易永续合约、杠杆加密与链上结果市场涉及重大亏损风险。市场可能跳空、强平仓位或暂时不可用。智能合约、跨链桥、钱包与第三方协议风险均适用。Hyperliquid 为独立平台，受其自身条款约束。"
                ],
            },
            {
                "id": "fees",
                "heading": "费用与退款",
                "paragraphs": [
                    "每笔交易均适用 Hyperliquid 协议与网络费用。HyperGain 可能对盈利平仓收取基于成功的平台费、builder 费或应用中披露的其他费用。未结清的累计平台费可能阻止新的机器人开仓与应用内 Hyperliquid 提现，直至结清。现行费率与执行规则见服务条款。"
                ],
            },
        ],
        "tagline": "非银行存款 · 非 FDIC 或政府保险 · 无保证收益 · 你可能损失全部投入资金",
    }


def ja() -> dict:
    return {
        "ariaLabel": "法的開示",
        "operator": [
            "{{brand}} での取引は、ウォレットをご自身の Hyperliquid 口座に接続します。注文は USDC 証拠金を用いて Hyperliquid のパーペチュアルおよびアウトカム市場で執行されます。これは実金融商品によるライブ取引であり、シミュレーションやデモ評価プログラムではありません。",
            "{{brand}} は Lorenzo Vanzaにより設立・作成・開発されました。ウェブサイト {{domain}} は、自動化取引ツール、ダッシュボード、および Hyperliquid 上の任意のスポーツアウトカム市場へのアクセスを提供します。現在の運用および法的責任は Lorenzo Vanza が個人で負っており、製品により現在過負荷であることを認めています。公式 X/Twitter（のみ）：@{{xHandle}}。{{brand}} は Telegram にはいません — {{brand}} を名乗る Telegram アカウント、グループ、ボット、DM は詐欺です。その他のソーシャルアカウントは公式ではありません。法務・コンプライアンスのお問い合わせは {{email}} まで。",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "法的開示",
                "paragraphs": [
                    "{{brand}} は、設定と市場シグナルに基づき Hyperliquid でのエントリー／エグジットを自動化し得るソフトウェアを提供します。本サービスは執行と監視の支援を目的とし、収益性やリスクフリー取引の保証を構成しません。"
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "約束・保証されたリターンはありません",
                "paragraphs": [
                    "{{domain}}、アプリ、マーケティング資料、サポート連絡のいずれも、利益・利回り・特定の取引結果の約束、予測、保証を構成しません。暗号資産およびレバレッジデリバティブは投機的です。証拠金の一部または全部を失う可能性があります。例、勝率、バックテスト、過去のボット実績は説明目的のみであり、将来の結果を示すものではありません。",
                    "リターンは市況、レバレッジ、手数料、スリッページ、レイテンシ、ユーザー設定により異なります。自動システムは市場を誤読したり、ボラティリティで失敗したり、技術的問題で停止したりします。各取引の金融リスクはすべてお客様が負います。",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "国・地域ごとの責任",
                "paragraphs": [
                    "HyperGain、Hyperliquid、暗号デリバティブ、自動取引ボット、スポーツアウトカム市場または関連サービスの利用が、居住・国籍・アクセス先の国／地域で許可されているかは、お客様の単独責任で判断してください。",
                    "インドおよび暗号・デリバティブ・ギャンブルに関する特定の税務・報告ルールがある他の法域の居住者は、所得税、GST、TDS 等を含む現地法を遵守する必要があります。HyperGain は税務助言を行わず、申告も代行しません。",
                    "自動取引、レバレッジ暗号、予測市場が居住地で制限または禁止されている場合、本サービスを利用してはなりません。制限回避のための VPN・プロキシ・位置偽装によるアクセスは禁止です（利用規約参照）。違法利用について当社は責任を負いません。",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN と位置偽装",
                "paragraphs": [
                    "地理的制限、コンプライアンス管理、アカウント執行を回避する目的で、VPN・プロキシ・Tor 等により真の所在地を隠して {{brand}} にアクセスすることはポリシー違反です。",
                    "{{brand}} は、VPN／プロキシ利用に起因する損失、アカウント措置、規制リスク、税務結果について責任を負いません。迂回を検知した場合、未払いプラットフォーム手数料や未使用のソフトウェアアクセスの返金なしに、アカウントを停止または永久終了することがあります。",
                ],
            },
            {
                "id": "no-custody",
                "heading": "顧客資金の保管なし",
                "paragraphs": [
                    "{{brand}} はブローカー、ディーラー、取引所、カストディアン、銀行、投資顧問ではありません。顧客預金を受領・保有・管理しません。USDC はお客様名義の Hyperliquid 口座に残ります。入出金にはウォレット署名が必要です。承認済み取引エージェントは注文を出せますが、お客様なしでは出金できません。"
                ],
            },
            {
                "id": "live-trading",
                "heading": "ライブ取引 — 実リスク",
                "paragraphs": [
                    "ペーパー／評価口座とは異なり、{{brand}} は Hyperliquid 上の実ポジションを自動化します。証拠金の一部または全部を失う可能性があります。レバレッジは損益を拡大します。失ってもよい資金のみを使い、居住地で暗号デリバティブが許可されていることを確認してください。"
                ],
            },
            {
                "id": "not-advice",
                "heading": "投資助言ではありません",
                "paragraphs": [
                    "すべてのコンテンツ、シグナル、ダッシュボード、ツールは情報提供およびソフトウェア利用のためにのみ提供されます。本サイトのいかなる内容も投資・税務・法的助言、または金融商品・暗号資産・デリバティブの売買勧誘ではありません。取引前に独立した助言者に相談してください。"
                ],
            },
            {
                "id": "performance",
                "heading": "パフォーマンス開示",
                "paragraphs": [
                    "マーケティングやアプリに示される過去実績、勝率、バックテスト、例は将来の結果を示すものではありません。自動戦略は、ボラティリティが高い、流動性が低い、ニュース主導の状況で失敗し得ます。仮説・シミュレーション結果には固有の限界があり、実際の取引コスト、スリッページ、レイテンシを反映しない場合があります。"
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "法域制限",
                "paragraphs": [
                    "18歳以上であり、所在法域で暗号デリバティブの利用が法的に許可されている必要があります。{{brand}} は、そうしたサービスが禁止されている利用者を対象としません。現地法、制裁、税務義務の遵守はお客様の責任です。法令によりアクセスが制限または終了される場合があります。"
                ],
            },
            {
                "id": "risk",
                "heading": "リスク警告",
                "paragraphs": [
                    "パーペチュアル先物、レバレッジ暗号、オンチェーンアウトカム市場の取引には大きな損失リスクがあります。市場はギャップし、ポジションを清算し、一時的に利用不能になることがあります。スマートコントラクト、ブリッジ、ウォレット、第三者プロトコルのリスクが適用されます。Hyperliquid は独自の規約に従う別プラットフォームです。"
                ],
            },
            {
                "id": "fees",
                "heading": "手数料と返金",
                "paragraphs": [
                    "各取引に Hyperliquid のプロトコル／ネットワーク手数料が適用されます。HyperGain は利益確定時の成功報酬型プラットフォーム手数料、ビルダー手数料、またはアプリに開示されるその他の料金を請求する場合があります。未払いのプラットフォーム手数料は決済まで新規ボット開始およびアプリ内 Hyperliquid 出金をブロックすることがあります。現行手数料と執行ルールは利用規約を参照してください。"
                ],
            },
        ],
        "tagline": "銀行預金ではありません · FDIC／政府保険の対象外 · リターンの保証なし · 投資元本の全額を失う可能性があります",
    }


def th() -> dict:
    return {
        "ariaLabel": "การเปิดเผยทางกฎหมาย",
        "operator": [
            "การเทรดบน {{brand}} จะเชื่อมวอลเล็ตของคุณกับบัญชี Hyperliquid ของคุณเอง คำสั่งซื้อขายจะถูกส่งบนตลาดเพอร์เพตชวลและตลาดผลลัพธ์ของ Hyperliquid โดยใช้มาร์จิ้น USDC ของคุณ — นี่คือการเทรดจริงด้วยเครื่องมือการเงินจริง ไม่ใช่โปรแกรมจำลองหรือประเมินผลแบบเดโม",
            "{{brand}} ก่อตั้ง สร้าง และพัฒนาโดย Lorenzo Vanza เว็บไซต์ {{domain}} ให้เข้าถึงเครื่องมือเทรดอัตโนมัติ แดชบอร์ด และตลาดผลลัพธ์กีฬาบน Hyperliquid (ถ้ามี) ความรับผิดชอบด้านการดำเนินงานและกฎหมายทั้งหมดปัจจุบันอยู่กับ Lorenzo Vanza ส่วนตัว ซึ่งยอมรับว่าขณะนี้ผลิตภัณฑ์ทำให้เขาทำงานหนักเกินไป X/Twitter ทางการ (เท่านั้น): @{{xHandle}} {{brand}} ไม่อยู่บน Telegram — บัญชี กลุ่ม บอท หรือ DM ใดบน Telegram ที่อ้างว่าเป็น {{brand}} คือการหลอกลวง บัญชีโซเชียลอื่นไม่เป็นทางการ สอบถามด้านกฎหมายหรือการปฏิบัติตามกฎได้ที่ {{email}}",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "การเปิดเผยทางกฎหมาย",
                "paragraphs": [
                    "{{brand}} ให้ซอฟต์แวร์ที่อาจเข้าและออกตำแหน่งบน Hyperliquid โดยอัตโนมัติตามการตั้งค่าและสัญญาณตลาด บริการนี้มีไว้ช่วยการดำเนินการและการติดตาม — ไม่ใช่การรับประกันกำไรหรือการเทรดที่ปราศจากความเสี่ยง"
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "ไม่มีผลตอบแทนที่สัญญาหรือรับประกัน",
                "paragraphs": [
                    "ไม่มีสิ่งใดบน {{domain}} ในแอป ในสื่อการตลาด หรือในการสื่อสารซัพพอร์ต ที่เป็นการสัญญา การคาดการณ์ หรือการรับประกันกำไร ผลตอบแทน หรือผลลัพธ์การเทรดใด ๆ คริปโตและอนุพันธ์แบบใช้เลเวอเรจเป็นการเก็งกำไร คุณอาจสูญเสียมาร์จิ้นบางส่วนหรือทั้งหมด ตัวอย่าง อัตราชนะ แบ็กเทสต์ และผลงานบอทในอดีตเป็นเพียงการอธิบายและไม่บ่งชี้ผลในอนาคต",
                    "ผลตอบแทนขึ้นกับสภาพตลาด เลเวอเรจ ค่าธรรมเนียม สลิปเพจ ความหน่วง และการตั้งค่าผู้ใช้ ระบบอัตโนมัติอาจอ่านตลาดผิด ล้มเหลวในช่วงผันผวน หรือหยุดทำงานจากปัญหาทางเทคนิค คุณเป็นผู้รับความเสี่ยงทางการเงินของทุกดีลเพียงผู้เดียว",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "ความรับผิดชอบตามประเทศ",
                "paragraphs": [
                    "คุณมีหน้าที่แต่เพียงผู้เดียวในการตัดสินว่าการใช้ HyperGain, Hyperliquid, อนุพันธ์คริปโต บอทเทรดอัตโนมัติ ตลาดผลลัพธ์กีฬา หรือบริการที่เกี่ยวข้อง ได้รับอนุญาตในประเทศ/ภูมิภาคที่คุณอาศัย มีสัญชาติ หรือเข้าถึงหรือไม่",
                    "ผู้อยู่อาศัยในอินเดียและเขตอำนาจที่มีกฎภาษีและการรายงานเฉพาะสำหรับคริปโต อนุพันธ์ หรือการพนัน ต้องปฏิบัติตามกฎหมายท้องถิ่น — รวมถึงภาษีเงินได้ GST TDS หรือภาระเทียบเท่า HyperGain ไม่ให้คำแนะนำด้านภาษีและไม่ยื่นแบบแทนคุณ",
                    "หากการเทรดอัตโนมัติ คริปโตแบบเลเวอเรจ หรือตลาดทำนายถูกจำกัดหรือห้ามในที่ที่คุณอยู่ คุณต้องไม่ใช้บริการ การเข้าถึง HyperGain ผ่าน VPN พร็อกซี หรือการปกปิดตำแหน่งเพื่อเลี่ยงข้อจำกัดเป็นสิ่งต้องห้าม (ดูข้อกำหนดการใช้บริการ) เราไม่รับผิดต่อการใช้งานที่ผิดกฎหมาย",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN และการปกปิดตำแหน่ง",
                "paragraphs": [
                    "การใช้ VPN พร็อกซี Tor หรือเครื่องมือคล้ายกันเพื่อเข้าถึง {{brand}} โดยซ่อนตำแหน่งจริงของคุณ ขัดต่อนโยบายของเราเมื่อทำเพื่อเลี่ยงข้อจำกัดทางภูมิศาสตร์ การควบคุมการปฏิบัติตามกฎ หรือการบังคับใช้บัญชี",
                    "{{brand}} ไม่รับผิดต่อความสูญเสีย การดำเนินการบัญชี ความเสี่ยงด้านกำกับดูแล หรือผลทางภาษีที่เกิดจากการใช้ VPN หรือพร็อกซี เราอาจตรวจพบการเลี่ยงและระงับหรือยุติบัญชีถาวรโดยไม่คืนค่าธรรมเนียมแพลตฟอร์มที่ค้างหรือสิทธิ์เข้าถึงซอฟต์แวร์ที่ยังไม่ได้ใช้",
                ],
            },
            {
                "id": "no-custody",
                "heading": "ไม่เก็บรักษาเงินลูกค้า",
                "paragraphs": [
                    "{{brand}} ไม่ใช่นายหน้า ผู้ค้า ตลาดแลกเปลี่ยน ผู้เก็บรักษา ธนาคาร หรือที่ปรึกษาการลงทุน เราไม่รับ ถือ หรือจัดการเงินฝากของลูกค้า USDC ของคุณยังอยู่บนบัญชี Hyperliquid ในชื่อของคุณ การฝาก/ถอนต้องใช้ลายเซ็นวอลเล็ต เอเจนต์เทรดที่อนุมัติอาจส่งคำสั่งได้แต่ถอนเงินโดยไม่มีคุณไม่ได้"
                ],
            },
            {
                "id": "live-trading",
                "heading": "เทรดจริง — ความเสี่ยงจริง",
                "paragraphs": [
                    "ต่างจากบัญชีกระดาษหรือบัญชีประเมิน {{brand}} ทำให้ตำแหน่งจริงบน Hyperliquid เป็นอัตโนมัติ คุณอาจสูญเสียมาร์จิ้นบางส่วนหรือทั้งหมด เลเวอเรจขยายทั้งกำไรและขาดทุน ใช้เฉพาะเงินทุนที่เสียได้ และตรวจสอบว่าอนุพันธ์คริปโตได้รับอนุญาตในที่ที่คุณอยู่"
                ],
            },
            {
                "id": "not-advice",
                "heading": "ไม่ใช่คำแนะนำการลงทุน",
                "paragraphs": [
                    "เนื้อหา สัญญาณ แดชบอร์ด และเครื่องมือทั้งหมดมีไว้เพื่อข้อมูลและการเข้าถึงซอฟต์แวร์เท่านั้น ไม่มีสิ่งใดบนไซต์นี้ที่เป็นคำแนะนำการลงทุน ภาษี หรือกฎหมาย หรือการชักชวนให้ซื้อหรือขายผลิตภัณฑ์การเงิน คริปโตเคอร์เรนซี หรืออนุพันธ์ ปรึกษาที่ปรึกษาอิสระก่อนเทรด"
                ],
            },
            {
                "id": "performance",
                "heading": "การเปิดเผยผลงาน",
                "paragraphs": [
                    "ผลงานในอดีต อัตราชนะ แบ็กเทสต์ หรือตัวอย่างในสื่อการตลาดหรือแอป ไม่บ่งชี้ผลในอนาคต กลยุทธ์อัตโนมัติอาจล้มเหลวในสภาวะผันผวน สภาพคล่องต่ำ หรือขับเคลื่อนด้วยข่าว ผลสมมติหรือจำลองมีข้อจำกัดโดยธรรมชาติและอาจไม่สะท้อนต้นทุนการเทรดจริง สลิปเพจ หรือความหน่วง"
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "ข้อจำกัดตามเขตอำนาจ",
                "paragraphs": [
                    "คุณต้องมีอายุอย่างน้อย 18 ปี และได้รับอนุญาตตามกฎหมายให้ใช้อนุพันธ์คริปโตในเขตอำนาจของคุณ {{brand}} ไม่ได้มุ่งเป้าผู้ใช้ในที่ที่บริการดังกล่าวถูกห้าม การปฏิบัติตามกฎหมายท้องถิ่น มาตรการคว่ำบาตร และภาระภาษีเป็นความรับผิดชอบของคุณ การเข้าถึงอาจถูกจำกัดหรือยุติตามที่กฎหมายกำหนด"
                ],
            },
            {
                "id": "risk",
                "heading": "คำเตือนความเสี่ยง",
                "paragraphs": [
                    "การเทรดฟิวเจอร์สเพอร์เพตชวล คริปโตแบบเลเวอเรจ และตลาดผลลัพธ์บนเชน มีความเสี่ยงขาดทุนสูง ตลาดอาจเกิดช่องว่าง บังคับปิดสถานะ หรือใช้งานไม่ได้ชั่วคราว มีความเสี่ยงจากสมาร์ทคอนแทรกต์ สะพาน วอลเล็ต และโปรโตคอลบุคคลที่สาม Hyperliquid เป็นแพลตฟอร์มแยกต่างหากภายใต้ข้อกำหนดของตนเอง"
                ],
            },
            {
                "id": "fees",
                "heading": "ค่าธรรมเนียมและการคืนเงิน",
                "paragraphs": [
                    "ค่าธรรมเนียมโปรโตคอลและเครือข่ายของ Hyperliquid ใช้กับทุกดีล HyperGain อาจเรียกค่าธรรมเนียมแพลตฟอร์มตามความสำเร็จเมื่อปิดทำกำไร ค่า builder หรือค่าอื่นตามที่เปิดเผยในแอป ค่าธรรมเนียมแพลตฟอร์มค้างชำระอาจบล็อกการเปิดบอทใหม่และการถอน Hyperliquid ในแอปจนกว่าจะชำระ ดูตารางค่าธรรมเนียมและการบังคับใช้ในข้อกำหนดการใช้บริการ"
                ],
            },
        ],
        "tagline": "ไม่ใช่เงินฝากธนาคาร · ไม่มีประกัน FDIC หรือรัฐบาล · ไม่รับประกันผลตอบแทน · คุณอาจสูญเสียเงินลงทุนทั้งหมด",
    }


def es() -> dict:
    return {
        "ariaLabel": "Avisos legales",
        "operator": [
            "Operar en {{brand}} conecta tu wallet con tu propia cuenta de Hyperliquid. Las órdenes se ejecutan en mercados perpetuos y de resultados de Hyperliquid con tu margen en USDC: es trading en vivo con instrumentos financieros reales, no un programa simulado ni de evaluación demo.",
            "{{brand}} fue fundada, creada y desarrollada por Lorenzo Vanza. El sitio {{domain}} ofrece acceso a herramientas de trading automatizado, paneles y mercados opcionales de resultados deportivos en Hyperliquid. La responsabilidad operativa y legal completa recae actualmente de forma privada en Lorenzo Vanza, quien reconoce estar actualmente sobrecargado por el producto. X/Twitter oficial (único): @{{xHandle}}. {{brand}} NO está en Telegram: cualquier cuenta, grupo, bot o DM de Telegram que diga representar a {{brand}} es una estafa. Cualquier otra cuenta social no es oficial. Para consultas legales o de cumplimiento, contacta {{email}}.",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "Aviso legal",
                "paragraphs": [
                    "{{brand}} proporciona software que puede automatizar entradas y salidas en Hyperliquid según ajustes configurados y señales de mercado. El servicio está pensado para ayudar en la ejecución y el seguimiento; no constituye garantía de rentabilidad ni de trading sin riesgo."
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "Sin rentabilidades prometidas ni garantizadas",
                "paragraphs": [
                    "Nada en {{domain}}, en la app, en materiales de marketing o en comunicaciones de soporte constituye promesa, proyección o garantía de beneficio, rendimiento o resultado de trading concreto. El cripto y los derivados apalancados son especulativos. Puedes perder parte o todo tu margen. Ejemplos, tasas de acierto, backtests y rendimiento pasado del bot son solo ilustrativos y no indican resultados futuros.",
                    "Los resultados varían según condiciones de mercado, apalancamiento, comisiones, slippage, latencia y ajustes del usuario. Los sistemas automatizados pueden leer mal el mercado, fallar en volatilidad o dejar de operar por problemas técnicos. Tú asumes solo el riesgo financiero de cada operación.",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "Responsabilidad según el país",
                "paragraphs": [
                    "Eres el único responsable de determinar si el uso de HyperGain, Hyperliquid, derivados cripto, bots de trading automatizado, mercados de resultados deportivos o servicios relacionados está permitido en tu país o región de residencia, ciudadanía o acceso.",
                    "Los residentes de India y otras jurisdicciones con normas fiscales y de reporte específicas sobre cripto, derivados o juego deben cumplir su legislación local, incluida renta, GST, TDS u obligaciones equivalentes. HyperGain no ofrece asesoría fiscal ni presenta declaraciones en tu nombre.",
                    "Si el trading automatizado, el cripto apalancado o los mercados de predicción están restringidos o prohibidos donde vives, no debes usar el servicio. Acceder a HyperGain mediante VPN, proxy u ocultación de ubicación para eludir restricciones está prohibido (véanse los Términos). No aceptamos responsabilidad por uso ilegal.",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN y ocultación de ubicación",
                "paragraphs": [
                    "El uso de VPN, proxies, Tor u herramientas similares para acceder a {{brand}} ocultando tu ubicación real vulnera nuestras políticas cuando se hace para eludir restricciones geográficas, controles de cumplimiento o medidas sobre la cuenta.",
                    "{{brand}} no acepta responsabilidad por pérdidas, acciones sobre la cuenta, exposición regulatoria o consecuencias fiscales derivadas del uso de VPN o proxy. Podemos detectar intentos de elusión y suspender o cerrar permanentemente cuentas sin reembolso de comisiones de plataforma acumuladas o acceso de software no utilizado.",
                ],
            },
            {
                "id": "no-custody",
                "heading": "Sin custodia de fondos de clientes",
                "paragraphs": [
                    "{{brand}} no es bróker, dealer, exchange, custodio, banco ni asesor de inversiones. No aceptamos, retenemos ni gestionamos depósitos de clientes. Tu USDC permanece en tu cuenta Hyperliquid a tu nombre. Depósitos y retiros requieren tu firma de wallet; el agente de trading aprobado puede colocar órdenes pero no retirar fondos sin ti."
                ],
            },
            {
                "id": "live-trading",
                "heading": "Trading en vivo — riesgo real",
                "paragraphs": [
                    "A diferencia de cuentas paper o de evaluación, {{brand}} automatiza posiciones reales en Hyperliquid. Puedes perder parte o todo tu margen. El apalancamiento amplifica ganancias y pérdidas. Usa solo capital que puedas permitirte perder y asegúrate de que los derivados cripto estén permitidos donde vives."
                ],
            },
            {
                "id": "not-advice",
                "heading": "No es asesoramiento de inversión",
                "paragraphs": [
                    "Todo el contenido, señales, paneles y herramientas se ofrecen solo con fines informativos y de acceso al software. Nada en este sitio es asesoramiento de inversión, fiscal o legal, ni una solicitud de compra o venta de ningún producto financiero, criptomoneda o derivado. Consulta asesores independientes antes de operar."
                ],
            },
            {
                "id": "performance",
                "heading": "Divulgación de rendimiento",
                "paragraphs": [
                    "El rendimiento pasado, tasas de acierto, backtests o ejemplos en marketing o en la app no son indicativos de resultados futuros. Las estrategias automatizadas pueden fallar en condiciones volátiles, ilíquidas o impulsadas por noticias. Los resultados hipotéticos o simulados tienen limitaciones inherentes y pueden no reflejar costes reales, slippage o latencia."
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "Restricciones jurisdiccionales",
                "paragraphs": [
                    "Debes tener al menos 18 años y estar legalmente autorizado a usar derivados cripto en tu jurisdicción. {{brand}} no se dirige a usuarios donde dichos servicios estén prohibidos. Cumplir leyes locales, sanciones y obligaciones fiscales es tu responsabilidad. El acceso puede restringirse o terminarse cuando lo exija la ley."
                ],
            },
            {
                "id": "risk",
                "heading": "Advertencia de riesgo",
                "paragraphs": [
                    "Operar futuros perpetuos, cripto apalancado y mercados de resultados on-chain implica un riesgo sustancial de pérdida. Los mercados pueden hacer gaps, liquidar posiciones o quedar temporalmente no disponibles. Aplican riesgos de smart contracts, bridges, wallets y protocolos de terceros. Hyperliquid es una plataforma separada regida por sus propios términos."
                ],
            },
            {
                "id": "fees",
                "heading": "Comisiones y reembolsos",
                "paragraphs": [
                    "Las comisiones de protocolo y red de Hyperliquid aplican a cada operación. HyperGain puede cobrar comisiones de plataforma basadas en éxito en cierres rentables, builder fees u otros cargos divulgados en la app. Las comisiones de plataforma acumuladas impagas pueden bloquear nuevas aperturas del bot y retiros Hyperliquid en la app hasta liquidarse. Consulta los Términos para el calendario de comisiones y las reglas de aplicación."
                ],
            },
        ],
        "tagline": "No es un depósito bancario · No asegurado por FDIC ni por el gobierno · Sin rentabilidades garantizadas · Puedes perder todo el capital invertido",
    }


def it() -> dict:
    return {
        "ariaLabel": "Informativa legale",
        "operator": [
            "Operare su {{brand}} collega il tuo wallet al tuo account Hyperliquid. Gli ordini vengono eseguiti sui mercati perpetual e outcome di Hyperliquid con il tuo margine USDC: è trading live con strumenti finanziari reali, non un programma simulato o di valutazione demo.",
            "{{brand}} è stata fondata, creata e sviluppata da Lorenzo Vanza. Il sito {{domain}} offre accesso a strumenti di trading automatizzato, dashboard e mercati opzionali di outcome sportivi su Hyperliquid. La piena responsabilità operativa e legale è attualmente assunta privatamente da Lorenzo Vanza, che riconosce di essere attualmente sopraffatto dal prodotto. X/Twitter ufficiale (unico): @{{xHandle}}. {{brand}} NON è su Telegram: qualsiasi account, gruppo, bot o DM Telegram che pretende di rappresentare {{brand}} è una truffa. Qualsiasi altro account social non è ufficiale. Per richieste legali o di compliance: {{email}}.",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "Informativa legale",
                "paragraphs": [
                    "{{brand}} fornisce software che può automatizzare ingressi e uscite su Hyperliquid in base a impostazioni e segnali di mercato. Il servizio è pensato per assistere esecuzione e monitoraggio — non costituisce garanzia di redditività o trading senza rischio."
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "Nessun rendimento promesso o garantito",
                "paragraphs": [
                    "Nulla su {{domain}}, nell’app, nei materiali di marketing o nelle comunicazioni di supporto costituisce promessa, proiezione o garanzia di profitto, yield o esito di trading specifico. Cripto e derivati a leva sono speculativi. Puoi perdere parte o tutto il margine. Esempi, win rate, backtest e performance passate del bot sono solo illustrativi e non indicativi di risultati futuri.",
                    "I risultati variano in base a condizioni di mercato, leva, fee, slippage, latenza e impostazioni utente. I sistemi automatici possono leggere male i mercati, fallire in volatilità o interrompersi per problemi tecnici. Il rischio finanziario di ogni trade è solo tuo.",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "Responsabilità per paese",
                "paragraphs": [
                    "Sei l’unico responsabile di verificare se l’uso di HyperGain, Hyperliquid, derivati cripto, bot di trading automatico, mercati outcome sportivi o servizi correlati è consentito nel tuo paese o regione di residenza, cittadinanza o accesso.",
                    "I residenti in India e in altre giurisdizioni con regole fiscali e di reporting specifiche su cripto, derivati o gioco devono rispettare le leggi locali — incluse imposte sul reddito, GST, TDS o obblighi equivalenti. HyperGain non fornisce consulenza fiscale e non presenta dichiarazioni per tuo conto.",
                    "Se trading automatico, cripto a leva o prediction market sono limitati o vietati dove vivi, non devi usare il servizio. Accedere a HyperGain tramite VPN, proxy o mascheramento della posizione per eludere restrizioni è vietato (vedi Termini di servizio). Non accettiamo responsabilità per uso illecito.",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN e mascheramento della posizione",
                "paragraphs": [
                    "L’uso di VPN, proxy, Tor o strumenti simili per accedere a {{brand}} nascondendo la tua posizione reale viola le nostre policy se fatto per aggirare restrizioni geografiche, controlli di compliance o enforcement dell’account.",
                    "{{brand}} non accetta responsabilità per perdite, azioni sull’account, esposizione normativa o conseguenze fiscali derivanti da uso di VPN o proxy. Possiamo rilevare tentativi di elusione e sospendere o chiudere definitivamente gli account senza rimborso di fee di piattaforma accumulate o accesso software non utilizzato.",
                ],
            },
            {
                "id": "no-custody",
                "heading": "Nessuna custodia di fondi dei clienti",
                "paragraphs": [
                    "{{brand}} non è broker, dealer, exchange, custode, banca o consulente di investimento. Non accettiamo, deteniamo o gestiamo depositi dei clienti. Il tuo USDC resta sul tuo account Hyperliquid a tuo nome. Depositi e prelievi richiedono la firma del wallet; l’agente di trading approvato può piazzare ordini ma non prelevare fondi senza di te."
                ],
            },
            {
                "id": "live-trading",
                "heading": "Trading live — rischio reale",
                "paragraphs": [
                    "A differenza di account paper o di valutazione, {{brand}} automatizza posizioni reali su Hyperliquid. Puoi perdere parte o tutto il margine. La leva amplifica guadagni e perdite. Usa solo capitale che puoi permetterti di perdere e assicurati che i derivati cripto siano consentiti dove vivi."
                ],
            },
            {
                "id": "not-advice",
                "heading": "Non è consulenza di investimento",
                "paragraphs": [
                    "Tutti i contenuti, segnali, dashboard e strumenti sono forniti solo a fini informativi e di accesso al software. Nulla su questo sito è consulenza di investimento, fiscale o legale, né una sollecitazione ad acquistare o vendere prodotti finanziari, criptovalute o derivati. Consulta consulenti indipendenti prima di operare."
                ],
            },
            {
                "id": "performance",
                "heading": "Informativa sulle performance",
                "paragraphs": [
                    "Performance passate, win rate, backtest o esempi in marketing o nell’app non sono indicativi di risultati futuri. Le strategie automatiche possono fallire in condizioni volatili, illiquide o guidate dalle notizie. Risultati ipotetici o simulati hanno limiti intrinseci e possono non riflettere costi reali, slippage o latenza."
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "Restrizioni giurisdizionali",
                "paragraphs": [
                    "Devi avere almeno 18 anni ed essere legalmente autorizzato a usare derivati cripto nella tua giurisdizione. {{brand}} non si rivolge a utenti dove tali servizi sono vietati. Spetta a te rispettare leggi locali, sanzioni e obblighi fiscali. L’accesso può essere limitato o terminato ove richiesto dalla legge."
                ],
            },
            {
                "id": "risk",
                "heading": "Avvertenza sui rischi",
                "paragraphs": [
                    "Il trading di perpetual futures, cripto a leva e mercati outcome on-chain comporta un rischio sostanziale di perdita. I mercati possono fare gap, liquidare posizioni o diventare temporaneamente non disponibili. Si applicano rischi di smart contract, bridge, wallet e protocolli di terze parti. Hyperliquid è una piattaforma separata regolata dai propri termini."
                ],
            },
            {
                "id": "fees",
                "heading": "Commissioni e rimborsi",
                "paragraphs": [
                    "Le fee di protocollo e di rete Hyperliquid si applicano a ogni trade. HyperGain può addebitare fee di piattaforma basate sul successo su chiusure profittevoli, builder fee o altri oneri indicati nell’app. Fee di piattaforma accumulate non pagate possono bloccare nuove aperture del bot e prelievi Hyperliquid in-app fino al pagamento. Vedi i Termini di servizio per tariffario e regole di enforcement."
                ],
            },
        ],
        "tagline": "Non è un deposito bancario · Non assicurato FDIC o dallo Stato · Nessun rendimento garantito · Puoi perdere tutto il capitale investito",
    }


def ru() -> dict:
    return {
        "ariaLabel": "Юридические сведения",
        "operator": [
            "Торговля на {{brand}} подключает ваш кошелёк к вашему собственному счёту Hyperliquid. Ордера исполняются на perpetual- и outcome-рынках Hyperliquid с вашей маржой в USDC — это живая торговля реальными финансовыми инструментами, а не симуляция или демо-оценка.",
            "{{brand}} основан, создан и разработан Lorenzo Vanza. Сайт {{domain}} предоставляет доступ к инструментам автоматизированной торговли, дашбордам и опциональным спортивным outcome-рынкам на Hyperliquid. Полную операционную и юридическую ответственность в настоящее время несёт лично Lorenzo Vanza, который признаёт, что сейчас перегружен продуктом. Официальный X/Twitter (единственный): @{{xHandle}}. {{brand}} НЕ представлен в Telegram — любой Telegram-аккаунт, группа, бот или ЛС, выдающие себя за {{brand}}, являются мошенничеством. Любой другой соцаккаунт неофициален. По юридическим и compliance-вопросам: {{email}}.",
        ],
        "blocks": [
            {
                "id": "legal-disclosure",
                "heading": "Юридическое раскрытие",
                "paragraphs": [
                    "{{brand}} предоставляет ПО, которое может автоматизировать входы и выходы на Hyperliquid на основе настроек и рыночных сигналов. Сервис предназначен для помощи в исполнении и мониторинге — он не является гарантией прибыльности или безрисковой торговли."
                ],
            },
            {
                "id": "no-promised-returns",
                "heading": "Нет обещанной или гарантированной доходности",
                "paragraphs": [
                    "Ничто на {{domain}}, в приложении, в маркетинговых материалах или в сообщениях поддержки не является обещанием, прогнозом или гарантией прибыли, доходности или конкретного торгового результата. Крипто и маржинальные деривативы спекулятивны. Вы можете потерять часть или всю маржу. Примеры, винрейты, бэктесты и прошлые результаты бота носят иллюстративный характер и не указывают на будущие результаты.",
                    "Доходность зависит от рыночных условий, плеча, комиссий, проскальзывания, задержек и настроек пользователя. Автоматизированные системы могут неверно читать рынок, сбоить при волатильности или останавливаться из‑за технических проблем. Финансовый риск каждой сделки несёте только вы.",
                ],
            },
            {
                "id": "country-responsibility",
                "heading": "Ответственность по стране",
                "paragraphs": [
                    "Вы самостоятельно отвечаете за то, разрешено ли использование HyperGain, Hyperliquid, криптодеривативов, торговых ботов, спортивных outcome-рынков или связанных сервисов в стране или регионе вашего проживания, гражданства или доступа.",
                    "Резиденты Индии и других юрисдикций со специальными налоговыми и отчётными правилами по крипто, деривативам или азартным играм должны соблюдать местные законы — включая налог на доходы, GST, TDS или эквивалентные обязательства. HyperGain не даёт налоговых советов и не подаёт декларации от вашего имени.",
                    "Если автоматизированная торговля, маржинальное крипто или prediction-рынки ограничены или запрещены там, где вы живёте, вы не должны пользоваться сервисом. Доступ к HyperGain через VPN, прокси или маскировку локации для обхода ограничений запрещён (см. Условия использования). Мы не несём ответственности за незаконное использование.",
                ],
            },
            {
                "id": "vpn-policy",
                "heading": "VPN и маскировка локации",
                "paragraphs": [
                    "Использование VPN, прокси, Tor или подобных средств для доступа к {{brand}} со скрытием реального местоположения нарушает наши политики, если это делается для обхода географических ограничений, compliance-контролей или мер по аккаунту.",
                    "{{brand}} не принимает ответственность за убытки, действия с аккаунтом, регуляторные риски или налоговые последствия, связанные с использованием VPN или прокси. Мы можем выявлять попытки обхода и приостанавливать или навсегда закрывать аккаунты без возврата накопленных платформенных комиссий или неиспользованного доступа к ПО.",
                ],
            },
            {
                "id": "no-custody",
                "heading": "Без хранения клиентских средств",
                "paragraphs": [
                    "{{brand}} не является брокером, дилером, биржей, кастодианом, банком или инвестиционным советником. Мы не принимаем, не храним и не управляем депозитами клиентов. Ваш USDC остаётся на вашем счёте Hyperliquid на ваше имя. Депозиты и выводы требуют подписи кошелька; одобренный торговый агент может размещать ордера, но не может выводить средства без вас."
                ],
            },
            {
                "id": "live-trading",
                "heading": "Живая торговля — реальный риск",
                "paragraphs": [
                    "В отличие от paper- или evaluation-счетов, {{brand}} автоматизирует реальные позиции на Hyperliquid. Вы можете потерять часть или всю маржу. Плечо усиливает прибыль и убытки. Используйте только капитал, который можете позволить себе потерять, и убедитесь, что криптодеривативы разрешены там, где вы живёте."
                ],
            },
            {
                "id": "not-advice",
                "heading": "Не инвестиционный совет",
                "paragraphs": [
                    "Весь контент, сигналы, дашборды и инструменты предоставляются только в информационных целях и для доступа к ПО. Ничто на этом сайте не является инвестиционным, налоговым или юридическим советом и не является предложением купить или продать какой‑либо финансовый продукт, криптовалюту или дериватив. Перед торговлей консультируйтесь с независимыми советниками."
                ],
            },
            {
                "id": "performance",
                "heading": "Раскрытие результатов",
                "paragraphs": [
                    "Прошлые результаты, винрейты, бэктесты или примеры в маркетинге или приложении не являются показателем будущих результатов. Автоматизированные стратегии могут давать сбой в волатильных, неликвидных или новостных условиях. Гипотетические или симулированные результаты имеют врождённые ограничения и могут не отражать реальные торговые издержки, проскальзывание или задержки."
                ],
            },
            {
                "id": "jurisdiction",
                "heading": "Юрисдикционные ограничения",
                "paragraphs": [
                    "Вам должно быть не менее 18 лет, и использование криптодеривативов должно быть законно разрешено в вашей юрисдикции. {{brand}} не ориентирован на пользователей там, где такие услуги запрещены. Соблюдение местных законов, санкций и налоговых обязательств — ваша ответственность. Доступ может быть ограничен или прекращён, если того требует закон."
                ],
            },
            {
                "id": "risk",
                "heading": "Предупреждение о рисках",
                "paragraphs": [
                    "Торговля perpetual futures, маржинальным крипто и on-chain outcome-рынками связана с существенным риском убытков. Рынки могут давать гэпы, ликвидировать позиции или временно становиться недоступными. Применяются риски смарт-контрактов, мостов, кошельков и сторонних протоколов. Hyperliquid — отдельная платформа со своими условиями."
                ],
            },
            {
                "id": "fees",
                "heading": "Комиссии и возвраты",
                "paragraphs": [
                    "К каждой сделке применяются комиссии протокола и сети Hyperliquid. HyperGain может взимать success-based платформенные комиссии на прибыльных закрытиях, builder fees или иные сборы, раскрытые в приложении. Неоплаченные накопленные платформенные комиссии могут блокировать новые открытия бота и выводы Hyperliquid в приложении до погашения. Актуальный тариф и правила принуждения — в Условиях использования."
                ],
            },
        ],
        "tagline": "Не банковский вклад · Не застраховано FDIC или государством · Нет гарантированной доходности · Вы можете потерять весь вложенный капитал",
    }


LEGAL["zh"] = zh()
LEGAL["ja"] = ja()
LEGAL["th"] = th()
LEGAL["es"] = es()
LEGAL["it"] = it()
LEGAL["ru"] = ru()


def main() -> None:
    for code, legal in LEGAL.items():
        path = ROOT / f"{code}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        landing = data.setdefault("landing", {})
        landing["legal"] = legal
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"updated {path.name}")


if __name__ == "__main__":
    main()
