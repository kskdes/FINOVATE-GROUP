import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "@netlify/functions";

// Runs daily at 8:00 AM JST (23:00 UTC)
export const config: Config = {
  schedule: "0 23 * * *",
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
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `あなたは日本の家庭向けに世界の金融ニュースをわかりやすく伝える専門家です。

以下の英語ニュース記事の中から、日本の一般家庭（生活費・物価・円の価値・エネルギー・食費・投資・住宅ローン等）に特に影響しそうなものを5〜7件選び、日本語で要約してください。

【要件】
- 日付: ${today}
- 各ニュースに「日本の家庭への影響」を1〜2文で付記する
- 難しい金融用語は噛み砕いて説明する
- 以下のJSONフォーマットで出力する（LINEテキストとニュース項目リストの両方）

【出力形式】
{
  "lineText": "📰 今日の世界金融ニュース（${today}）\\n\\n1️⃣ 【見出し】\\n要約。\\n💡 日本への影響: 影響。\\n\\n2️⃣ ...\\n\\n---\\n🏦 Finovate Group",
  "items": [
    {
      "number": "1",
      "heading": "見出し（20字以内）",
      "body": "本文要約（100〜150字）",
      "impact": "日本の家庭への影響（50〜80字）"
    }
  ]
}

【ニュース一覧】
${articlesText}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = block.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON not found in response");

  return JSON.parse(jsonMatch[0]) as { lineText: string; items: NewsItem[] };
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
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `あなたはnote.comに投稿するための金融解説記事を書くライターです。
以下のニュースをもとに、日本の一般家庭向けのわかりやすい解説記事を書いてください。

【ニュース情報】
見出し: ${item.heading}
概要: ${item.body}
日本への影響: ${item.impact}
日付: ${date}

【記事要件】
- 文字数: 800〜1200字
- 読者: 金融知識がない日本の一般家庭（主婦・会社員・子育て世代）
- トーン: 親しみやすく、不安を煽らず、具体的なアドバイスを含む
- 構成:
  1. タイトル（25字以内、キャッチーで検索されやすい）
  2. 導入（2〜3文、身近な話題から入る）
  3. ニュースの背景（何が起きているか）
  4. 日本の家庭への具体的な影響（食費・光熱費・ローン・投資など）
  5. 家庭でできる対策・心構え
  6. まとめ

【出力形式】
タイトル: （ここにタイトル）

（ここに本文。改行で段落を分ける）

#金融ニュース #家計 #物価 #${item.heading.slice(0, 5)}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");

  const text = block.text;
  const titleMatch = text.match(/タイトル[:：]\s*(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : item.heading;
  const content = text
    .replace(/タイトル[:：]\s*.+\n?/, "")
    .trim()
    .replace(/\n/g, "<br>\n");

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
    throw new Error(`LINE API error ${res.status}: ${body}`);
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

    // WordPress記事生成・投稿
    if (process.env.WP_ACCESS_TOKEN) {
      console.log(`Generating ${items.length} WordPress articles...`);
      const wpUrls: string[] = [];

      for (const item of items) {
        try {
          const { title, content } = await generateWordPressArticle(item, today);
          const url = await postToWordPress(title, content);
          wpUrls.push(`・${title}`);
          console.log(`Posted: ${title}`);
        } catch (err) {
          console.error(`Failed to post article: ${item.heading}`, err);
        }
      }

      if (wpUrls.length > 0) {
        const wpNotice = `📝 WordPress下書き作成完了（${wpUrls.length}件）\n\nhttps://wordpress.com/posts/kskfinovatenews.wordpress.com\n\n${wpUrls.join("\n")}`;
        await sendLineMessage(wpNotice);
        console.log("WordPress notice sent to LINE");
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error in daily-finance-news:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
