import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "@netlify/functions";

// Runs daily at 8:00 AM JST (23:00 UTC)
export const config: Config = {
  schedule: "0 23 * * *",
};

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

interface NewsArticle {
  title: string;
  description: string | null;
  url: string;
  source: { name: string };
  publishedAt: string;
}

interface NewsAPIResponse {
  status: string;
  articles: NewsArticle[];
}

async function fetchFinancialNews(): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error("NEWS_API_KEY is not set");

  // Keywords relevant to global finance that affect Japanese households
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
    if (data.status === "ok") {
      articles.push(...data.articles);
    }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });
}

async function buildJapaneseNewsSummary(
  articles: NewsArticle[]
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const articlesText = articles
    .slice(0, 25)
    .map(
      (a, i) =>
        `[${i + 1}] ${a.source.name}\nタイトル: ${a.title}\n概要: ${a.description ?? "なし"}`
    )
    .join("\n\n");

  const today = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `あなたは日本の家庭向けに世界の金融ニュースをわかりやすく伝える専門家です。

以下の英語ニュース記事の中から、日本の一般家庭（生活費・物価・円の価値・エネルギー・食費・投資・住宅ローン等）に特に影響しそうなものを5〜7件選び、日本語で要約してください。

【要件】
- 日付: ${today}
- 各ニュースに「日本の家庭への影響」を1〜2文で付記する
- 難しい金融用語は噛み砕いて説明する
- LINEメッセージとして読みやすいフォーマット（絵文字可）にする
- 全体を1000文字以内に収める

【ニュース一覧】
${articlesText}

【出力フォーマット例】
📰 今日の世界金融ニュース（${today}）

1️⃣ 【見出し】
要約文。
💡 日本への影響: 影響説明。

2️⃣ ...

---
🏦 Finovate Group`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

async function sendLineMessage(text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_USER_ID;

  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  if (!to) throw new Error("LINE_USER_ID is not set");

  const res = await fetch(LINE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API error ${res.status}: ${body}`);
  }
}

export default async function handler(): Promise<Response> {
  try {
    console.log("Fetching financial news...");
    const articles = await fetchFinancialNews();
    console.log(`Fetched ${articles.length} articles`);

    console.log("Building Japanese summary with Claude...");
    const summary = await buildJapaneseNewsSummary(articles);

    console.log("Sending to LINE...");
    await sendLineMessage(summary);

    console.log("Daily finance news sent successfully");
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error in daily-finance-news:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
