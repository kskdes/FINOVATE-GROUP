import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
config();

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sample articles with real URLs for format testing
const sampleArticlesText = `[1] Reuters
タイトル: Federal Reserve holds interest rates steady, signals caution on cuts
概要: The Fed kept rates at current levels as policymakers wait for more data on inflation before easing monetary policy.
URL: https://www.reuters.com/markets/us/federal-reserve-holds-rates-steady/

[2] Bloomberg
タイトル: Oil prices drop as Middle East tensions ease, OPEC weighs output
概要: Crude oil fell over 2% amid signs of diplomatic progress in the Middle East, reducing geopolitical risk premiums.
URL: https://www.bloomberg.com/news/articles/oil-prices-middle-east

[3] Nikkei Asia
タイトル: Dollar weakens against yen amid safe-haven demand shift
概要: The US dollar declined for a second consecutive week against the yen as investors moved away from safe-haven assets.
URL: https://asia.nikkei.com/Economy/dollar-yen-decline

[4] Financial Times
タイトル: China's factory output slows as export orders weaken
概要: Chinese manufacturing activity showed signs of slowing as global trade uncertainty weighs on export demand.
URL: https://www.ft.com/content/china-factory-output

[5] Wall Street Journal
タイトル: US inflation cools slightly but remains above Fed target
概要: Consumer prices rose at a slower pace last month, giving the Federal Reserve more room but not yet enough to cut rates.
URL: https://www.wsj.com/economy/us-inflation-data`;

const today = new Date().toLocaleDateString("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

console.log("🤖 Claude で要約生成中...");
const message = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 1500,
  messages: [
    {
      role: "user",
      content: `あなたは日本の家庭向けに世界の金融ニュースをわかりやすく伝える専門家です。

以下の英語ニュース記事の中から、日本の一般家庭（生活費・物価・円の価値・エネルギー・食費・投資・住宅ローン等）に特に影響しそうなものを3〜5件選び、日本語で要約してください。

【要件】
- 各ニュースに「日本の家庭への影響」を1文で付記する
- 各ニュースの出典URLを必ず含める
- 全体1000文字以内

【出力フォーマット（このまま出力）】
📰 今日の世界金融ニュース（${today}）

1️⃣ 【見出し】
要約文。
💡 日本への影響: 影響説明。
🔗 出典: URL

2️⃣ 【見出し】
要約文。
💡 日本への影響: 影響説明。
🔗 出典: URL

---
🏦 Finovate Group

【ニュース一覧】
${sampleArticlesText}`,
    },
  ],
});

const block = message.content[0];
if (block.type !== "text") throw new Error("Unexpected response");
const lineText = block.text.trim();
const safeText = lineText.length > 4900 ? lineText.slice(0, 4900) + "…" : lineText;

console.log("\n--- 送信内容プレビュー ---");
console.log(safeText);
console.log(`\n文字数: ${safeText.length}`);
console.log("---\n");

console.log("📲 LINE送信中...");
const res = await fetch(LINE_API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
  },
  body: JSON.stringify({
    to: process.env.LINE_USER_ID,
    messages: [{ type: "text", text: safeText }],
  }),
});

if (!res.ok) {
  const body = await res.text();
  console.error("❌ LINE error:", res.status, body);
  process.exit(1);
}
console.log("✅ LINEに送信しました！");
