import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "@netlify/functions";

// Runs daily at 8:00 AM JST (23:00 UTC)
export const config: Config = {
  schedule: "0 23 * * *",
  timeout: 120,
};

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";
const WP_API_BASE = "https://public-api.wordpress.com/rest/v1.1/sites/kskfinovatenews.wordpress.com";

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

interface NewsItem {
  number: string;
  heading: string;
  body: string;
  impact: string;
}

async function fetchFinancialNews(): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error("NEWS_API_KEY is not set");

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

  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });
}

async function buildLineSummaryAndItems(
  articles: NewsArticle[]
): Promise<{ lineText: string; items: NewsItem[] }> {
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
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `あなたは日本の家庭向けに世界の金融ニュースをわかりやすく伝える専門家です。

以下の英語ニュース記事の中から、日本の一般家庭（生活費・物価・円の価値・エネルギー・食費・投資・住宅ローン等）に特に影響しそうなものを3〜5件選び、日本語で要約してください。

【要件】
- 各ニュースに「日本の家庭への影響」を1文で付記する
- 全体1000文字以内

【出力フォーマット（このまま出力）】
📰 今日の世界金融ニュース（${today}）

1️⃣ 【見出し】
要約文。
💡 日本への影響: 影響説明。

2️⃣ 【見出し】
要約文。
💡 日本への影響: 影響説明。

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
  console.log("Generated lineText length:", lineText.length);

  const safeText = lineText.length > 4900 ? lineText.slice(0, 4900) + "…" : lineText;

  const items: NewsItem[] = [];
  const itemMatches = safeText.matchAll(/(\d+)️⃣\s*【(.+?)】\n([\s\S]+?)(?=\d+️⃣|---|\n\n🏦|$)/g);
  for (const m of itemMatches) {
    const body = m[3].replace(/💡.+/s, "").trim();
    const impactMatch = m[3].match(/💡 日本への影響[:：]\s*(.+)/);
    items.push({
      number: m[1],
      heading: m[2],
      body,
      impact: impactMatch ? impactMatch[1].trim() : "",
    });
  }

  return { lineText: safeText, items };
}

async function generateWordPressArticle(
  item: NewsItem,
  date: string
): Promise<{ title: string; content: string }> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `あなたは株式会社 FINOVATE GROUP のCOO・中野 圭介として、note.com向けの高品質な金融解説記事を書くライターです。
2児の父で、個人・法人100名以上の資産形成を支援してきた独立系FAの視点から、日本の一般家庭に向けて書いてください。

【ニュース情報】
見出し: ${item.heading}
概要: ${item.body}
日本への影響: ${item.impact}
日付: ${date}

【記事要件】
- 文字数: 2000〜3000字
- 読者: 金融知識がない日本の一般家庭（主婦・会社員・子育て世代）
- トーン: 親しみやすく、不安を煽らず、具体的で実践的なアドバイス
- Markdown形式で出力（WordPressに貼り付け）

【必須の構成・フォーマット（以下のテンプレートに従って出力）】

# [絵文字] [ニューステーマ]──[読者への影響を一言で]

[日付]、[ニュースの核心を具体的な数字・事実で1〜2文]。

「[読者が思い込みがちな反応]」──そう思った方も多いでしょう。でも、実際はもう少し複雑です。

> **【このnoteを読むメリット】**
> ✅ [メリット1]
> ✅ [メリット2]
> ✅ [メリット3]

---

## 🌍 1. 何が起きているのか？

[ニュースの背景を200字程度でわかりやすく説明]

<!-- 📊【図1挿入位置】世界地図や関連チャートのイメージ -->

> **🔑 キーポイント**
> [最重要な事実を1〜2文で箇条書き]

---

## 💴 2. なぜ日本円・日本経済に影響するのか？

[日本経済・円への影響メカニズムを200字程度で説明]

<!-- 📊【図2挿入位置】円相場や関連グラフのイメージ -->

---

## 🏠 3. わが家の家計への影響は？

### ⏱️ 短期（1〜3ヶ月）
[食費・光熱費・ガソリン等への具体的影響]

### ⏱️ 中期（3〜6ヶ月）
[住宅ローン・保険・投資信託等への影響]

### ⏱️ 長期（6ヶ月以降）
[資産形成・老後資金・教育費等への影響]

> **⚠️ 見落としがちなポイント**
> [専門家として一般人が見逃しやすい重要なポイント]

---

## 💡 4. 家庭でできる3つの視点

### 🔑 視点1｜[具体的なアクション名]
[実践的なアドバイス100字程度]

### 🔑 視点2｜[具体的なアクション名]
[実践的なアドバイス100字程度]

### 🔑 視点3｜[具体的なアクション名]
[実践的なアドバイス100字程度]

---

## 📌 まとめ

> **📌 今日のポイント**
> ✅ [要点1]
> ✅ [要点2]
> ✅ [要点3]

[締めの言葉：不安を煽らず、前向きに締めくくる2〜3文]

---

💬 **お金のことで迷ったら、気軽にご相談ください**
[LINE相談はこちら](https://liff.line.me/2005725637-lrY7QyMb?unique_key=C703UC&ts=1776069643)

---

## 📚 参考情報

- [情報源1（メディア名・記事タイトル等）]
- [情報源2]
- [情報源3]

---

**中野 圭介｜株式会社 FINOVATE GROUP 取締役COO**
2児の父。個人・法人100名以上の資産形成を支援してきた独立系FA。「難しい金融を、もっと身近に」をモットーに、家庭に寄り添った資産形成のサポートを行っている。

#金融ニュース #家計 #物価 #${item.heading.slice(0, 8)} #FINOVATEGROUP`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");

  const text = block.text.trim();

  const titleMatch = text.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].replace(/[#*`]/g, "").trim() : item.heading;

  const content = text.replace(/\n/g, "<br>\n");

  return { title, content };
}

async function postToWordPress(title: string, content: string): Promise<string> {
  const token = process.env.WP_ACCESS_TOKEN;
  if (!token) throw new Error("WP_ACCESS_TOKEN is not set");

  const res = await fetch(`${WP_API_BASE}/posts/new`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      content,
      status: "draft",
      tags: "金融ニュース,家計,物価,Finovate",
      categories: "金融ニュース",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WordPress API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { URL: string; title: string };
  return data.URL ?? "";
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
    console.error("LINE error status:", res.status);
    console.error("LINE error body:", body.slice(0, 400));
    throw new Error(`LINE API error ${res.status}`);
  }
}

export default async function handler(): Promise<Response> {
  try {
    console.log("Fetching financial news...");
    const articles = await fetchFinancialNews();
    console.log(`Fetched ${articles.length} articles`);

    console.log("Building summary with Claude...");
    const today = new Date().toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const { lineText, items } = await buildLineSummaryAndItems(articles);

    console.log("Sending to LINE...");
    await sendLineMessage(lineText);
    console.log("LINE sent successfully");

    // WordPress記事生成・投稿（最も重要な1件のみ）
    if (process.env.WP_ACCESS_TOKEN && items.length > 0) {
      const item = items[0];
      console.log(`Generating WordPress article for: ${item.heading}`);
      try {
        const { title, content } = await generateWordPressArticle(item, today);
        await postToWordPress(title, content);
        console.log(`Posted: ${title}`);
        const wpNotice = `📝 WordPress下書き作成完了\n\nhttps://wordpress.com/posts/kskfinovatenews.wordpress.com\n\n・${title}`;
        await sendLineMessage(wpNotice);
        console.log("WordPress notice sent to LINE");
      } catch (err) {
        console.error(`Failed to post article: ${item.heading}`, err);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error in daily-finance-news:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
