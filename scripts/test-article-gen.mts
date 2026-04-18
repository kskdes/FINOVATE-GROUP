import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";

config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const testItem = {
  number: "1",
  heading: "中東平和期待でドル急落、2週連続の下落",
  body: "中東和平交渉の進展期待から安全資産としてのドル需要が低下し、ドル円は一時147円台まで下落。DXY（ドル指数）も2週連続で下落している。",
  impact: "円高が進めばガソリン・食料品の輸入コスト低下につながるが、輸出企業の業績悪化で株式市場に影響が出る可能性もある。",
};

const today = new Date().toLocaleDateString("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

console.log("Generating article for:", testItem.heading);
console.log("Date:", today);
console.log("---\n");

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4000,
  messages: [
    {
      role: "user",
      content: `あなたは株式会社 FINOVATE GROUP のCOO・中野 圭介として、note.com向けの高品質な金融解説記事を書くライターです。
2児の父で、個人・法人100名以上の資産形成を支援してきた独立系FAの視点から、日本の一般家庭に向けて書いてください。

【ニュース情報】
見出し: ${testItem.heading}
概要: ${testItem.body}
日本への影響: ${testItem.impact}
日付: ${today}

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

#金融ニュース #家計 #物価 #${testItem.heading.slice(0, 8)} #FINOVATEGROUP`,
    },
  ],
});

const block = message.content[0];
if (block.type !== "text") throw new Error("Unexpected response type");

const text = block.text.trim();
console.log(text);
console.log("\n---");
console.log("文字数:", text.length);
