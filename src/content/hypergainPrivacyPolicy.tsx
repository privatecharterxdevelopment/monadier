import React from 'react';
import {
  BRAND_APP_URL,
  BRAND_DOMAIN,
  BRAND_NAME,
  OFFICIAL_TELEGRAM_HANDLE,
  OFFICIAL_TELEGRAM_URL,
  OFFICIAL_X_HANDLE,
  OFFICIAL_X_URL,
  SUPPORT_EMAIL,
} from '../lib/brand';
import type { LegalSection } from '../components/legal/LegalDocumentLayout';
import type { AppLanguage } from '../i18n/languages';

export type PrivacyPageContent = {
  title: string;
  updated: string;
  intro: string;
  backLabel: string;
  sections: LegalSection[];
};

const mail = () => (
  <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-doc-link">
    {SUPPORT_EMAIL}
  </a>
);

const appUrl = () => (
  <a href={BRAND_APP_URL} className="legal-doc-link" target="_blank" rel="noopener noreferrer">
    {BRAND_APP_URL}
  </a>
);

const brandLine = () => (
  <>
    {BRAND_NAME} · {BRAND_DOMAIN} · {appUrl()}
  </>
);

const officialChannelsEn = () => (
  <>
    <strong>Official channels only.</strong> The sole official X / Twitter account is{' '}
    <a href={OFFICIAL_X_URL} className="legal-doc-link" target="_blank" rel="noopener noreferrer">
      @{OFFICIAL_X_HANDLE}
    </a>
    . The sole official Telegram channel is{' '}
    <a
      href={OFFICIAL_TELEGRAM_URL}
      className="legal-doc-link"
      target="_blank"
      rel="noopener noreferrer"
    >
      @{OFFICIAL_TELEGRAM_HANDLE}
    </a>{' '}
    ({OFFICIAL_TELEGRAM_URL}). Any other X, Telegram, Discord, WhatsApp, Instagram, Facebook, or
    similar account, group, bot, or direct message claiming to represent {BRAND_NAME} is{' '}
    <strong>not</strong> official. Do not send funds, seed phrases, private keys, or account
    credentials to anyone contacting you on unofficial channels.
  </>
);

const officialChannelsDe = () => (
  <>
    <strong>Nur offizielle Kanäle.</strong> Der einzige offizielle X-/Twitter-Account ist{' '}
    <a href={OFFICIAL_X_URL} className="legal-doc-link" target="_blank" rel="noopener noreferrer">
      @{OFFICIAL_X_HANDLE}
    </a>
    . Der einzige offizielle Telegram-Kanal ist{' '}
    <a
      href={OFFICIAL_TELEGRAM_URL}
      className="legal-doc-link"
      target="_blank"
      rel="noopener noreferrer"
    >
      @{OFFICIAL_TELEGRAM_HANDLE}
    </a>{' '}
    ({OFFICIAL_TELEGRAM_URL}). Jeder andere X-, Telegram-, Discord-, WhatsApp-, Instagram-,
    Facebook- oder ähnliche Account, Gruppe, Bot oder Direktnachricht, die vorgibt, {BRAND_NAME} zu
    vertreten, ist <strong>nicht</strong> offiziell. Sende keine Gelder, Seed-Phrasen, Private Keys
    oder Zugangsdaten an Personen auf inoffiziellen Kanälen.
  </>
);

const operatorIdentityEn = () => (
  <>
    {BRAND_NAME} was founded, created, and developed by <strong>Lorenzo Vanza</strong> (PrivateCharterX
    / privatecharterx). The Service is currently operated as a private project under his personal
    responsibility. Full operational and legal responsibility is presently carried privately by
    Lorenzo Vanza, who acknowledges that he is currently overwhelmed by the product and related
    operational demands. Until responsibility is transferred to a separate legal entity, he remains
    the founder, creator, and developer accountable for the Service.
  </>
);

const operatorIdentityDe = () => (
  <>
    {BRAND_NAME} wurde gegründet, erstellt und entwickelt von <strong>Lorenzo Vanza</strong>{' '}
    (PrivateCharterX / privatecharterx). Der Service wird derzeit als privates Projekt unter seiner
    persönlichen Verantwortung betrieben. Die volle operative und rechtliche Verantwortung trägt
    derzeit privat Lorenzo Vanza; er stellt klar, dass er vom Produkt und der damit verbundenen
    Betriebsbelastung derzeit überfordert ist. Bis eine Übertragung auf eine separate juristische
    Person erfolgt, bleibt er Gründer, Creator und Entwickler mit Verantwortung für den Service.
  </>
);

function contactSection(intro: string, title: string, channels: React.ReactNode = officialChannelsEn()): LegalSection {
  return {
    title,
    body: (
      <>
        <p>{intro}</p>
        <p>{mail()}</p>
        <p>{channels}</p>
        <p>{brandLine()}</p>
      </>
    ),
  };
}

const EN_SECTIONS: LegalSection[] = [
  {
    title: '1. Who we are',
    body: (
      <>
        <p>
          {BRAND_NAME} operates the {BRAND_DOMAIN} website and {BRAND_APP_URL} trading application for
          automated Hyperliquid perpetuals trading. For privacy enquiries contact {mail()}.
        </p>
        <p>{operatorIdentityEn()}</p>
        <p>{officialChannelsEn()}</p>
      </>
    ),
  },
  {
    title: '2. Data we collect',
    body: (
      <>
        <p>Depending on how you use {BRAND_NAME}, we may process:</p>
        <ul>
          <li>Account data — email, name, country, username, profile avatar</li>
          <li>Wallet addresses you connect or link</li>
          <li>
            Hyperliquid trading activity, bot settings, and account balances (on-chain HL data is
            public)
          </li>
          <li>Technical logs — IP address, browser type, device, session timestamps</li>
          <li>Support messages you send us</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. How we use data',
    body: (
      <ul>
        <li>Provide and secure your account and dashboard</li>
        <li>Execute automated Hyperliquid trading and display trade history</li>
        <li>Send service emails (confirmation, password reset, important notices)</li>
        <li>Improve reliability, prevent fraud, and comply with legal obligations</li>
      </ul>
    ),
  },
  {
    title: '4. Legal bases (EEA / UK)',
    body: (
      <p>
        Where GDPR applies, we rely on contract performance (providing the service), legitimate
        interests (security and product improvement), and consent where required (e.g. non-essential
        cookies).
      </p>
    ),
  },
  {
    title: '5. Sharing & processors',
    body: (
      <p>
        We use trusted infrastructure providers (e.g. hosting, database, email) under
        data-processing agreements. We do not sell your personal data. Hyperliquid and Arbitrum
        on-chain activity is publicly visible. We may disclose data if required by law or to protect
        rights and safety.
      </p>
    ),
  },
  {
    title: '6. Retention',
    body: (
      <p>
        We keep account data while your account is active and for a reasonable period afterward for
        legal, tax, and dispute-resolution purposes. You may request deletion subject to obligations
        we must retain.
      </p>
    ),
  },
  {
    title: '7. Your rights',
    body: (
      <p>
        Depending on your location you may have rights to access, correct, delete, or export your
        data, and to object to certain processing. Contact {mail()} to exercise these rights.
      </p>
    ),
  },
  {
    title: '8. Security & international transfers',
    body: (
      <p>
        We apply technical and organisational measures to protect data. Your information may be
        processed in countries outside your own; we use appropriate safeguards where required.
      </p>
    ),
  },
  {
    title: '9. Changes',
    body: (
      <p>
        We may update this Policy by posting a new version on this page. Material changes will be
        indicated by updating the &ldquo;Last updated&rdquo; date above.
      </p>
    ),
  },
  contactSection(
    'For privacy questions, data requests, or account-related enquiries regarding your Hyperliquid trading data, contact:',
    '10. Contact'
  ),
];

const DE_SECTIONS: LegalSection[] = [
  {
    title: '1. Wer wir sind',
    body: (
      <>
        <p>
          {BRAND_NAME} betreibt die Website {BRAND_DOMAIN} und die Trading-Anwendung {BRAND_APP_URL}{' '}
          für automatisierten Hyperliquid-Perpetual-Handel. Datenschutzanfragen: {mail()}.
        </p>
        <p>{operatorIdentityDe()}</p>
        <p>{officialChannelsDe()}</p>
      </>
    ),
  },
  {
    title: '2. Welche Daten wir erheben',
    body: (
      <>
        <p>Je nach Nutzung von {BRAND_NAME} können wir verarbeiten:</p>
        <ul>
          <li>Kontodaten — E-Mail, Name, Land, Benutzername, Profilbild</li>
          <li>Verbundene oder verknüpfte Wallet-Adressen</li>
          <li>
            Hyperliquid-Handelsaktivität, Bot-Einstellungen und Kontostände (On-Chain-HL-Daten sind
            öffentlich)
          </li>
          <li>Technische Logs — IP-Adresse, Browser, Gerät, Sitzungszeitstempel</li>
          <li>Support-Nachrichten, die du uns sendest</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. Wie wir Daten nutzen',
    body: (
      <ul>
        <li>Bereitstellung und Absicherung deines Kontos und Dashboards</li>
        <li>Automatisierter Hyperliquid-Handel und Anzeige der Trade-Historie</li>
        <li>Service-E-Mails (Bestätigung, Passwort-Reset, wichtige Hinweise)</li>
        <li>Zuverlässigkeit, Betrugsprävention und gesetzliche Pflichten</li>
      </ul>
    ),
  },
  {
    title: '4. Rechtsgrundlagen (EWR / UK)',
    body: (
      <p>
        Wo die DSGVO gilt, stützen wir uns auf Vertragserfüllung, berechtigte Interessen (Sicherheit
        und Produktverbesserung) und Einwilligung, wo erforderlich (z. B. nicht essenzielle
        Cookies).
      </p>
    ),
  },
  {
    title: '5. Weitergabe & Auftragsverarbeiter',
    body: (
      <p>
        Wir nutzen vertrauenswürdige Infrastrukturanbieter (Hosting, Datenbank, E-Mail) mit
        Auftragsverarbeitungsverträgen. Wir verkaufen keine personenbezogenen Daten. Hyperliquid- und
        Arbitrum-On-Chain-Aktivität ist öffentlich sichtbar. Offenlegung erfolgt bei gesetzlicher
        Pflicht oder zum Schutz von Rechten und Sicherheit.
      </p>
    ),
  },
  {
    title: '6. Aufbewahrung',
    body: (
      <p>
        Kontodaten speichern wir während der Kontolaufzeit und danach angemessen für Recht, Steuern
        und Streitbeilegung. Löschung kann eingeschränkt sein, wenn wir Daten aufbewahren müssen.
      </p>
    ),
  },
  {
    title: '7. Deine Rechte',
    body: (
      <p>
        Je nach Standort hast du Rechte auf Auskunft, Berichtigung, Löschung, Export oder Widerspruch.
        Kontakt: {mail()}.
      </p>
    ),
  },
  {
    title: '8. Sicherheit & internationale Übermittlungen',
    body: (
      <p>
        Wir setzen technische und organisatorische Maßnahmen zum Datenschutz ein. Daten können
        außerhalb deines Landes verarbeitet werden; wir nutzen geeignete Schutzmaßnahmen.
      </p>
    ),
  },
  {
    title: '9. Änderungen',
    body: (
      <p>
        Wir können diese Richtlinie durch Veröffentlichung einer neuen Version aktualisieren.
        Wesentliche Änderungen erkennst du am Datum &bdquo;Zuletzt aktualisiert&ldquo; oben.
      </p>
    ),
  },
  contactSection(
    'Bei Datenschutzfragen, Auskunftsanfragen oder Kontofragen zu deinen Hyperliquid-Handelsdaten:',
    '10. Kontakt',
    officialChannelsDe()
  ),
];

const ZH_SECTIONS: LegalSection[] = [
  {
    title: '1. 我们是谁',
    body: (
      <>
        <p>
          {BRAND_NAME} 运营 {BRAND_DOMAIN} 网站及 {BRAND_APP_URL} 交易应用，提供 Hyperliquid
          永续合约自动交易服务。隐私咨询请联系 {mail()}。
        </p>
        <p>{operatorIdentityEn()}</p>
        <p>{officialChannelsEn()}</p>
      </>
    ),
  },
  {
    title: '2. 我们收集的数据',
    body: (
      <>
        <p>根据您使用 {BRAND_NAME} 的方式，我们可能处理：</p>
        <ul>
          <li>账户数据 — 电子邮件、姓名、国家、用户名、头像</li>
          <li>您连接或关联的钱包地址</li>
          <li>Hyperliquid 交易活动、机器人设置及账户余额（链上 HL 数据公开）</li>
          <li>技术日志 — IP 地址、浏览器、设备、会话时间戳</li>
          <li>您发送给我们的支持消息</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. 数据用途',
    body: (
      <ul>
        <li>提供并保护您的账户与仪表板</li>
        <li>执行 Hyperliquid 自动交易并显示交易历史</li>
        <li>发送服务邮件（确认、密码重置、重要通知）</li>
        <li>提高可靠性、防止欺诈并履行法律义务</li>
      </ul>
    ),
  },
  {
    title: '4. 法律依据（EEA / 英国）',
    body: (
      <p>
        在适用 GDPR 的情况下，我们依据合同履行、合法利益（安全与产品改进）以及在需要时取得同意（例如非必要
        Cookie）。
      </p>
    ),
  },
  {
    title: '5. 共享与处理方',
    body: (
      <p>
        我们使用可信的基础设施提供商（托管、数据库、邮件等）并签订数据处理协议。我们不出售您的个人数据。Hyperliquid
        与 Arbitrum 链上活动公开可见。在法律要求或为保护权利与安全时，我们可能披露数据。
      </p>
    ),
  },
  {
    title: '6. 保留期限',
    body: (
      <p>
        在账户活跃期间及之后合理期限内保留账户数据，用于法律、税务及争议解决。您可请求删除，但受我们必须保留的数据限制。
      </p>
    ),
  },
  {
    title: '7. 您的权利',
    body: (
      <p>
        根据所在地区，您可能有权访问、更正、删除或导出数据，以及反对某些处理。请联系 {mail()}。
      </p>
    ),
  },
  {
    title: '8. 安全与国际传输',
    body: (
      <p>
        我们采取技术与组织措施保护数据。您的信息可能在境外处理；我们在需要时使用适当保障措施。
      </p>
    ),
  },
  {
    title: '9. 变更',
    body: (
      <p>
        我们可能通过在本页发布新版本来更新本政策。重大变更将通过更新上方&ldquo;最后更新&rdquo;日期标明。
      </p>
    ),
  },
  contactSection('有关隐私、数据请求或与 Hyperliquid 交易数据相关的账户问题，请联系：', '10. 联系方式'),
];

const JA_SECTIONS: LegalSection[] = [
  {
    title: '1. 運営者',
    body: (
      <>
        <p>
          {BRAND_NAME} は {BRAND_DOMAIN} および {BRAND_APP_URL} で Hyperliquid
          パーペチュアル自動取引アプリを提供しています。プライバシーに関するお問い合わせは {mail()}{' '}
          まで。
        </p>
        <p>{operatorIdentityEn()}</p>
        <p>{officialChannelsEn()}</p>
      </>
    ),
  },
  {
    title: '2. 収集するデータ',
    body: (
      <>
        <p>{BRAND_NAME} の利用状況に応じて、以下を処理する場合があります：</p>
        <ul>
          <li>アカウントデータ — メール、氏名、国、ユーザー名、プロフィール画像</li>
          <li>接続またはリンクしたウォレットアドレス</li>
          <li>Hyperliquid 取引活動、ボット設定、口座残高（HL オンチェーンデータは公開）</li>
          <li>技術ログ — IP、アドレス、ブラウザ、デバイス、セッション時刻</li>
          <li>サポートメッセージ</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. データの利用目的',
    body: (
      <ul>
        <li>アカウントとダッシュボードの提供・保護</li>
        <li>Hyperliquid 自動取引の実行と取引履歴の表示</li>
        <li>サービスメール（確認、パスワードリセット、重要なお知らせ）</li>
        <li>信頼性向上、不正防止、法的義務の履行</li>
      </ul>
    ),
  },
  {
    title: '4. 法的根拠（EEA / UK）',
    body: (
      <p>
        GDPR が適用される場合、契約の履行、正当な利益（セキュリティと製品改善）、および必要に応じた同意（非必須
        Cookie 等）に基づきます。
      </p>
    ),
  },
  {
    title: '5. 共有と処理委託',
    body: (
      <p>
        信頼できるインフラ提供者（ホスティング、DB、メール等）をデータ処理契約の下で利用します。個人データの販売は行いません。Hyperliquid
        および Arbitrum のオンチェーン活動は公開されます。法令に基づく場合や権利・安全保護のため開示することがあります。
      </p>
    ),
  },
  {
    title: '6. 保存期間',
    body: (
      <p>
        アカウントが有効な間およびその後合理的な期間、法的・税務・紛争解決のためにデータを保持します。削除請求は、保持義務がある場合制限されることがあります。
      </p>
    ),
  },
  {
    title: '7. お客様の権利',
    body: (
      <p>
        居住地により、アクセス、訂正、削除、エクスポート、処理への異議申し立て等の権利があります。{mail()}{' '}
        までご連絡ください。
      </p>
    ),
  },
  {
    title: '8. セキュリティと国際転送',
    body: (
      <p>
        技術的・組織的措置でデータを保護します。国外で処理される場合があり、必要に応じて適切な保護措置を講じます。
      </p>
    ),
  },
  {
    title: '9. 変更',
    body: (
      <p>
        本ページに新版を掲載してポリシーを更新することがあります。重要な変更は上部の「最終更新日」で示します。
      </p>
    ),
  },
  contactSection(
    'プライバシー、データ請求、Hyperliquid 取引データに関するアカウントのお問い合わせは：',
    '10. お問い合わせ'
  ),
];

const TH_SECTIONS: LegalSection[] = [
  {
    title: '1. เราเป็นใคร',
    body: (
      <>
        <p>
          {BRAND_NAME} ให้บริการเว็บไซต์ {BRAND_DOMAIN} และแอปเทรด {BRAND_APP_URL} สำหรับการเทรด
          Hyperliquid แบบอัตโนมัติ ติดต่อเรื่องความเป็นส่วนตัว: {mail()}
        </p>
        <p>{operatorIdentityEn()}</p>
        <p>{officialChannelsEn()}</p>
      </>
    ),
  },
  {
    title: '2. ข้อมูลที่เราเก็บ',
    body: (
      <>
        <p>ขึ้นอยู่กับการใช้ {BRAND_NAME} เราอาจประมวลผล:</p>
        <ul>
          <li>ข้อมูลบัญชี — อีเมล ชื่อ ประเทศ ชื่อผู้ใช้ รูปโปรไฟล์</li>
          <li>ที่อยู่กระเป๋าเงินที่เชื่อมต่อหรือลิงก์</li>
          <li>กิจกรรมเทรด Hyperliquid การตั้งค่าบอท และยอดคงเหลือ (ข้อมูล HL บน chain เป็นสาธารณะ)</li>
          <li>บันทึกทางเทคนิค — IP เบราว์เซอร์ อุปกรณ์ เวลาเซสชัน</li>
          <li>ข้อความสนับสนุนที่คุณส่งถึงเรา</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. การใช้ข้อมูล',
    body: (
      <ul>
        <li>ให้บริการและรักษาความปลอดภัยบัญชีและแดชบอร์ด</li>
        <li>ดำเนินการเทรด Hyperliquid อัตโนมัติและแสดงประวัติการเทรด</li>
        <li>ส่งอีเมลบริการ (ยืนยัน รีเซ็ตรหัสผ่าน ประกาศสำคัญ)</li>
        <li>ปรับปรุงความน่าเชื่อถือ ป้องกันการฉ้อโกง และปฏิบัติตามกฎหมาย</li>
      </ul>
    ),
  },
  {
    title: '4. ฐานทางกฎหมาย (EEA / UK)',
    body: (
      <p>
        เมื่อ GDPR ใช้บังคับ เราอาศัยการปฏิบัติตามสัญญา ผลประโยชน์โดยชอบด้วยกฎหมาย (ความปลอดภัยและการปรับปรุงผลิตภัณฑ์)
        และความยินยอมเมื่อจำเป็น (เช่น คุกกี้ที่ไม่จำเป็น)
      </p>
    ),
  },
  {
    title: '5. การแบ่งปันและผู้ประมวลผล',
    body: (
      <p>
        เราใช้ผู้ให้บริการโครงสร้างพื้นฐานที่เชื่อถือได้ภายใต้ข้อตกลงประมวลผลข้อมูล
        เราไม่ขายข้อมูลส่วนบุคคล กิจกรรมบน Hyperliquid และ Arbitrum เป็นสาธารณะ
        เราอาจเปิดเผยข้อมูลเมื่อกฎหมายกำหนดหรือเพื่อปกป้องสิทธิและความปลอดภัย
      </p>
    ),
  },
  {
    title: '6. การเก็บรักษา',
    body: (
      <p>
        เราเก็บข้อมูลบัญชีตราบที่บัญชียังใช้งานและช่วงเวลาที่เหมาะสมหลังจากนั้นเพื่อกฎหมาย ภาษี
        และการแก้ข้อพิพาท คุณสามารถขอลบได้ภายใต้ข้อจำกัดที่เราต้องเก็บไว้
      </p>
    ),
  },
  {
    title: '7. สิทธิของคุณ',
    body: (
      <p>
        ขึ้นอยู่กับที่ตั้งของคุณ คุณอาจมีสิทธิเข้าถึง แก้ไข ลบ หรือส่งออกข้อมูล และคัดค้านการประมวลผลบางอย่าง
        ติดต่อ {mail()}
      </p>
    ),
  },
  {
    title: '8. ความปลอดภัยและการถ่ายโอนข้ามประเทศ',
    body: (
      <p>
        เราใช้มาตรการทางเทคนิคและองค์กรเพื่อปกป้องข้อมูล
        ข้อมูลของคุณอาจถูกประมวลผลในประเทศอื่น เราใช้การคุ้มครองที่เหมาะสมเมื่อจำเป็น
      </p>
    ),
  },
  {
    title: '9. การเปลี่ยนแปลง',
    body: (
      <p>
        เราอาจอัปเดตนโยบายนี้โดยเผยแพร่เวอร์ชันใหม่บนหน้านี้
        การเปลี่ยนแปลงที่สำคัญจะแสดงโดยการอัปเดตวันที่ &ldquo;อัปเดตล่าสุด&rdquo; ด้านบน
      </p>
    ),
  },
  contactSection(
    'สำหรับคำถามด้านความเป็นส่วนตัว คำขอข้อมูล หรือบัญชีที่เกี่ยวกับข้อมูลเทรด Hyperliquid ของคุณ:',
    '10. ติดต่อ'
  ),
];

const ES_SECTIONS: LegalSection[] = [
  {
    title: '1. Quiénes somos',
    body: (
      <>
        <p>
          {BRAND_NAME} opera el sitio {BRAND_DOMAIN} y la aplicación de trading {BRAND_APP_URL} para
          trading automatizado de perpetuos en Hyperliquid. Consultas de privacidad: {mail()}.
        </p>
        <p>{operatorIdentityEn()}</p>
        <p>{officialChannelsEn()}</p>
      </>
    ),
  },
  {
    title: '2. Datos que recopilamos',
    body: (
      <>
        <p>Según cómo uses {BRAND_NAME}, podemos procesar:</p>
        <ul>
          <li>Datos de cuenta — email, nombre, país, usuario, avatar</li>
          <li>Direcciones de wallet conectadas o vinculadas</li>
          <li>
            Actividad de trading en Hyperliquid, ajustes del bot y saldos (datos HL on-chain son
            públicos)
          </li>
          <li>Registros técnicos — IP, navegador, dispositivo, marcas de sesión</li>
          <li>Mensajes de soporte que nos envíes</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. Cómo usamos los datos',
    body: (
      <ul>
        <li>Proporcionar y asegurar tu cuenta y panel</li>
        <li>Ejecutar trading automatizado en Hyperliquid y mostrar historial</li>
        <li>Enviar emails de servicio (confirmación, restablecimiento, avisos importantes)</li>
        <li>Mejorar fiabilidad, prevenir fraude y cumplir obligaciones legales</li>
      </ul>
    ),
  },
  {
    title: '4. Bases legales (EEE / Reino Unido)',
    body: (
      <p>
        Donde aplique el RGPD, nos basamos en ejecución contractual, intereses legítimos (seguridad y
        mejora del producto) y consentimiento cuando sea necesario (p. ej. cookies no esenciales).
      </p>
    ),
  },
  {
    title: '5. Compartición y encargados',
    body: (
      <p>
        Usamos proveedores de infraestructura de confianza con acuerdos de tratamiento. No vendemos
        datos personales. La actividad on-chain en Hyperliquid y Arbitrum es pública. Podemos divulgar
        datos si la ley lo exige o para proteger derechos y seguridad.
      </p>
    ),
  },
  {
    title: '6. Conservación',
    body: (
      <p>
        Conservamos datos mientras la cuenta esté activa y un periodo razonable después para fines
        legales, fiscales y de resolución de disputas. Puedes solicitar eliminación sujeta a
        obligaciones de retención.
      </p>
    ),
  },
  {
    title: '7. Tus derechos',
    body: (
      <p>
        Según tu ubicación, puedes tener derechos de acceso, rectificación, supresión, exportación u
        oposición. Contacta {mail()}.
      </p>
    ),
  },
  {
    title: '8. Seguridad y transferencias internacionales',
    body: (
      <p>
        Aplicamos medidas técnicas y organizativas de protección. Tu información puede procesarse fuera
        de tu país; usamos garantías adecuadas cuando se requieren.
      </p>
    ),
  },
  {
    title: '9. Cambios',
    body: (
      <p>
        Podemos actualizar esta Política publicando una nueva versión en esta página. Los cambios
        materiales se indicarán actualizando la fecha &ldquo;Última actualización&rdquo; arriba.
      </p>
    ),
  },
  contactSection(
    'Para preguntas de privacidad, solicitudes de datos o consultas sobre tu actividad en Hyperliquid:',
    '10. Contacto'
  ),
];

const IT_SECTIONS: LegalSection[] = [
  {
    title: '1. Chi siamo',
    body: (
      <>
        <p>
          {BRAND_NAME} gestisce il sito {BRAND_DOMAIN} e l&apos;app di trading {BRAND_APP_URL} per il
          trading automatizzato di perpetui su Hyperliquid. Per la privacy: {mail()}.
        </p>
        <p>{operatorIdentityEn()}</p>
        <p>{officialChannelsEn()}</p>
      </>
    ),
  },
  {
    title: '2. Dati che raccogliamo',
    body: (
      <>
        <p>In base all&apos;uso di {BRAND_NAME}, possiamo trattare:</p>
        <ul>
          <li>Dati account — email, nome, paese, username, avatar</li>
          <li>Indirizzi wallet collegati</li>
          <li>
            Attività di trading Hyperliquid, impostazioni bot e saldi (dati HL on-chain sono pubblici)
          </li>
          <li>Log tecnici — IP, browser, dispositivo, timestamp di sessione</li>
          <li>Messaggi di supporto inviati a noi</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. Come usiamo i dati',
    body: (
      <ul>
        <li>Fornire e proteggere account e dashboard</li>
        <li>Eseguire trading automatizzato su Hyperliquid e mostrare lo storico</li>
        <li>Inviare email di servizio (conferma, reset password, avvisi importanti)</li>
        <li>Migliorare affidabilità, prevenire frodi e adempiere obblighi legali</li>
      </ul>
    ),
  },
  {
    title: '4. Basi legali (SEE / UK)',
    body: (
      <p>
        Dove si applica il GDPR, ci basiamo sull&apos;esecuzione contrattuale, interessi legittimi
        (sicurezza e miglioramento prodotto) e consenso quando richiesto (es. cookie non essenziali).
      </p>
    ),
  },
  {
    title: '5. Condivisione e responsabili',
    body: (
      <p>
        Usiamo fornitori infrastrutturali affidabili con accordi di trattamento. Non vendiamo dati
        personali. L&apos;attività on-chain su Hyperliquid e Arbitrum è pubblica. Possiamo divulgare dati
        se richiesto dalla legge o per proteggere diritti e sicurezza.
      </p>
    ),
  },
  {
    title: '6. Conservazione',
    body: (
      <p>
        Conserviamo i dati mentre l&apos;account è attivo e per un periodo ragionevole dopo, per obblighi
        legali, fiscali e risoluzione controversie. Puoi richiedere la cancellazione salvo obblighi di
        retention.
      </p>
    ),
  },
  {
    title: '7. I tuoi diritti',
    body: (
      <p>
        A seconda della tua ubicazione, puoi avere diritti di accesso, rettifica, cancellazione,
        export o opposizione. Contatta {mail()}.
      </p>
    ),
  },
  {
    title: '8. Sicurezza e trasferimenti internazionali',
    body: (
      <p>
        Applichiamo misure tecniche e organizzative di protezione. I dati possono essere elaborati
        fuori dal tuo paese; usiamo garanzie adeguate quando richiesto.
      </p>
    ),
  },
  {
    title: '9. Modifiche',
    body: (
      <p>
        Possiamo aggiornare questa Informativa pubblicando una nuova versione su questa pagina. Le
        modifiche rilevanti saranno indicate aggiornando la data &ldquo;Ultimo aggiornamento&rdquo; sopra.
      </p>
    ),
  },
  contactSection(
    'Per domande sulla privacy, richieste sui dati o account relativi ai tuoi dati di trading Hyperliquid:',
    '10. Contatti'
  ),
];

const RU_SECTIONS: LegalSection[] = [
  {
    title: '1. Кто мы',
    body: (
      <>
        <p>
          {BRAND_NAME} управляет сайтом {BRAND_DOMAIN} и торговым приложением {BRAND_APP_URL} для
          автоматической торговли перпетуалами на Hyperliquid. По вопросам конфиденциальности: {mail()}.
        </p>
        <p>{operatorIdentityEn()}</p>
        <p>{officialChannelsEn()}</p>
      </>
    ),
  },
  {
    title: '2. Какие данные мы собираем',
    body: (
      <>
        <p>В зависимости от использования {BRAND_NAME} мы можем обрабатывать:</p>
        <ul>
          <li>Данные аккаунта — email, имя, страна, username, аватар</li>
          <li>Подключённые или привязанные адреса кошельков</li>
          <li>
            Торговую активность на Hyperliquid, настройки бота и балансы (on-chain данные HL публичны)
          </li>
          <li>Технические логи — IP, браузер, устройство, время сессии</li>
          <li>Сообщения в поддержку</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. Как мы используем данные',
    body: (
      <ul>
        <li>Обеспечение и защита аккаунта и панели</li>
        <li>Автоматическая торговля на Hyperliquid и отображение истории сделок</li>
        <li>Сервисные письма (подтверждение, сброс пароля, важные уведомления)</li>
        <li>Надёжность, противодействие мошенничеству и соблюдение закона</li>
      </ul>
    ),
  },
  {
    title: '4. Правовые основания (ЕЭЗ / Великобритания)',
    body: (
      <p>
        Где применяется GDPR, мы опираемся на исполнение договора, законные интересы (безопасность и
        улучшение продукта) и согласие, когда это требуется (например, необязательные cookie).
      </p>
    ),
  },
  {
    title: '5. Передача и обработчики',
    body: (
      <p>
        Мы используем надёжных поставщиков инфраструктуры по договорам обработки данных. Мы не продаём
        персональные данные. On-chain активность на Hyperliquid и Arbitrum публична. Раскрытие возможно
        по закону или для защиты прав и безопасности.
      </p>
    ),
  },
  {
    title: '6. Хранение',
    body: (
      <p>
        Данные хранятся, пока аккаунт активен, и разумный срок после — для правовых, налоговых целей и
        споров. Удаление возможно с учётом обязательного хранения.
      </p>
    ),
  },
  {
    title: '7. Ваши права',
    body: (
      <p>
        В зависимости от региона у вас могут быть права доступа, исправления, удаления, экспорта или
        возражения против обработки. Свяжитесь: {mail()}.
      </p>
    ),
  },
  {
    title: '8. Безопасность и международные передачи',
    body: (
      <p>
        Мы применяем технические и организационные меры защиты. Данные могут обрабатываться за пределами
        вашей страны; используем надлежащие гарантии, когда это требуется.
      </p>
    ),
  },
  {
    title: '9. Изменения',
    body: (
      <p>
        Мы можем обновлять Политику, публикуя новую версию на этой странице. Существенные изменения
        отражаются в дате &laquo;Последнее обновление&raquo; выше.
      </p>
    ),
  },
  contactSection(
    'По вопросам конфиденциальности, запросам данных или аккаунта, связанным с торговлей на Hyperliquid:',
    '10. Контакты'
  ),
];

const META: Record<
  AppLanguage,
  { title: string; updated: string; intro: string; backLabel: string; sections: LegalSection[] }
> = {
  en: {
    title: 'Privacy Policy',
    updated: 'July 22, 2026',
    intro: `This Privacy Policy explains how ${BRAND_NAME} collects, uses, and protects personal data when you use our Hyperliquid trading website and application.`,
    backLabel: 'Back to registration',
    sections: EN_SECTIONS,
  },
  de: {
    title: 'Datenschutzerklärung',
    updated: '22. Juli 2026',
    intro: `Diese Datenschutzerklärung erläutert, wie ${BRAND_NAME} personenbezogene Daten erhebt, nutzt und schützt, wenn du unsere Hyperliquid-Trading-Website und -App nutzt.`,
    backLabel: 'Zurück zur Registrierung',
    sections: DE_SECTIONS,
  },
  zh: {
    title: '隐私政策',
    updated: '2026年6月30日',
    intro: `本隐私政策说明 ${BRAND_NAME} 在您使用我们的 Hyperliquid 交易网站和应用时如何收集、使用和保护个人数据。`,
    backLabel: '返回注册',
    sections: ZH_SECTIONS,
  },
  ja: {
    title: 'プライバシーポリシー',
    updated: '2026年6月30日',
    intro: `本プライバシーポリシーは、Hyperliquid 取引サイトおよびアプリの利用時に ${BRAND_NAME} が個人データをどのように収集・利用・保護するかを説明します。`,
    backLabel: '登録に戻る',
    sections: JA_SECTIONS,
  },
  th: {
    title: 'นโยบายความเป็นส่วนตัว',
    updated: '30 มิถุนายน 2026',
    intro: `นโยบายนี้อธิบายว่า ${BRAND_NAME} เก็บ ใช้ และปกป้องข้อมูลส่วนบุคคลอย่างไรเมื่อคุณใช้เว็บไซต์และแอปเทรด Hyperliquid ของเรา`,
    backLabel: 'กลับไปลงทะเบียน',
    sections: TH_SECTIONS,
  },
  es: {
    title: 'Política de privacidad',
    updated: '30 de junio de 2026',
    intro: `Esta Política de privacidad explica cómo ${BRAND_NAME} recopila, usa y protege datos personales cuando utilizas nuestro sitio y aplicación de trading en Hyperliquid.`,
    backLabel: 'Volver al registro',
    sections: ES_SECTIONS,
  },
  it: {
    title: 'Informativa sulla privacy',
    updated: '30 giugno 2026',
    intro: `Questa Informativa spiega come ${BRAND_NAME} raccoglie, utilizza e protegge i dati personali quando usi il nostro sito e l'app di trading Hyperliquid.`,
    backLabel: 'Torna alla registrazione',
    sections: IT_SECTIONS,
  },
  ru: {
    title: 'Политика конфиденциальности',
    updated: '30 июня 2026 г.',
    intro: `Настоящая Политика объясняет, как ${BRAND_NAME} собирает, использует и защищает персональные данные при использовании нашего сайта и приложения для торговли на Hyperliquid.`,
    backLabel: 'Назад к регистрации',
    sections: RU_SECTIONS,
  },
};

export function getPrivacyPageContent(language: string): PrivacyPageContent {
  const lang = (language in META ? language : 'en') as AppLanguage;
  return META[lang];
}
