import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
config();

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

interface NewsArticle {
  title: string;
  description: string | null;
  url: string;
  source: { name: string };
}
interface NewsAPIResponse {
  status: string;
  articles: NewsArticle[];
}

async function fetchFinancialNews(): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY!;
  const queries = [
    "inflation interest rates federal reserve",
    "oil price energy dollar yen",
    "US economy recession stock market",
    "China economy trade",
    "food prices commodity",
  ];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const from = yesterday.toISOString().split("T")[0];
  const articles: NewsArticle[] = [];
  for (const q of queries) {
    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", q);
    url.searchParams.set("from", from);
    url.searchParams.set("sortBy", "relevancy");
    url.searchParams.set("pageSize", "5");
    url.searchParams.set("language", "en");
    url.searchParams.set("apiKey", apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) continue;
    const data = (await res.json()) as NewsAPIResponse;
    if (data.status === "ok") articles.push(...data.articles);
  }
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const today = new Date().toLocaleDateString("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

console.log("📡 ニュース取得中...");
const articles = await fetchFinancialNews();
console.log(`✅ ${articles.length}件取得`);

const articlesText = articles
  .slice(0, 25)
  .map(
    (a, i) =>
      `[${i + 1}] ${a.source.name}\nタイトル: ${a.title}\n概要: ${a.description ?? "なし"}\nURL: ${a.url}`
  )
  .join("\n\n");

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
${articlesText}`,
    },
  ],
});

const block = message.content[0];
if (block.type !== "text") throw new Error("Unexpected response type");
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
  console.error("LINE error:", res.status, body);
  process.exit(1);
}
console.log("✅ LINEに送信しました！");
