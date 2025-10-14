import { z } from "zod";
import { openaiClient } from "@/lib/openai";
import { env } from "@/lib/env";

const flexibleStringArray = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value
        .split(/[\n、,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.map((item) => (typeof item === "string" ? item.trim() : item)).filter(Boolean);
    }
    return value;
  },
  z.array(z.string().min(1)),
);

export const aiProposalSchema = z.object({
  name: z
    .string()
    .min(1, "name is required")
    .max(32, "name must be 32 characters or fewer"),
  youtubeTitle: z
    .string()
    .min(1, "youtubeTitle is required")
    .max(100, "youtubeTitle must be 100 characters or fewer"),
  summary: z
    .string()
    .min(1, "summary is required")
    .max(280, "summary must be 280 characters or fewer"),
  hook: z.string().optional(),
  thumbnailIdea: z.string().optional(),
  tags: flexibleStringArray.optional(),
  sourceHints: flexibleStringArray.optional(),
  notes: z.string().optional(),
});

export type AiProposal = z.infer<typeof aiProposalSchema>;

export const aiRequestSchema = z.object({
  theme: z.string().optional(),
  era: z.string().optional(),
  focus: z.string().optional(),
  forbidNames: z.array(z.string().min(1)).optional(),
});

export type AiRequestInput = z.infer<typeof aiRequestSchema>;

export async function generateFigureProposal(
  input: AiRequestInput,
): Promise<AiProposal> {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const payload = aiRequestSchema.parse(input);

  const userIntent = [
    payload.theme ? `テーマ: ${payload.theme}` : null,
    payload.era ? `時代: ${payload.era}` : null,
    payload.focus ? `焦点: ${payload.focus}` : null,
    payload.forbidNames?.length
      ? `除外: ${payload.forbidNames.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const instruction = `
あなたは日本語のビジネス・教養系チャンネルの編集者です。40〜70代男性視聴者（特に50〜60代）に刺さる偉人候補を提案してください。

要件:
- 日本人に限らず世界中の偉人を対象とすること。近代〜現代（19〜20世紀以降）の政治家・哲学者・学者・経営者など、史実に基づく名言が豊富な人物を優先。
- 「name」は日本語表記（カタカナ表記も可）で広く認知された人物名。
- 「youtubeTitle」は以下を満たすこと:
  * 55〜85文字程度
  * 例: 「【{人物名}に学ぶ】仕事ができる人の７つの習慣〜昭和の怪物、{人物名}が語る本物の人間力〜｜成功哲学｜教訓｜名言｜聞き流し｜偉人の名言｜」
  * 冒頭に【〜】で括った訴求フレーズ、その後に数字を含む具体的なベネフィット（例: 7つの習慣 / 5つの鉄則）。
  * 昭和・平成などの時代感や「怪物」「帝王」「鉄人」などキャッチーなワードを活用。
  * 視聴者の課題を煽るネガティブ要素も許容（例: 「○○できない人は一生成功できない」）。
  * ハッシュタグや #shorts は絶対に入れない。
- 「summary」は3文以内で、人物の実績や格言が現代ビジネスに与える示唆を紹介。
- 「hook」は動画冒頭で視聴者を惹きつけるパンチライン。
- 「thumbnailIdea」はサムネイル用の短いキャッチコピーや構図案。
- 「tags」はテーマに沿った短い日本語キーワードを配列で。
- 「sourceHints」は信頼できる書籍・演説・論文など名言の出典を示すもの。
- 「notes」には扱う際の注意点や補足。

既存の人物と重複しないように、禁止リスト（forbidNames）に含まれる名前は絶対に選ばないこと。
出力はUTF-8のJSONオブジェクト単体で返してください。前後に余計なテキストを入れないこと。

参考条件:
${userIntent || "特になし"}
`.trim();

  const completion = await openaiClient.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: env.OPENAI_TEMPERATURE,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert producer for a Japanese short-form video channel featuring historical figures. Always respond with pure JSON that matches the requested schema.",
      },
      {
        role: "user",
        content: instruction,
      },
    ],
  });

  const message = completion.choices[0]?.message?.content;
  if (!message) {
    throw new Error("Failed to receive proposal content from OpenAI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch (error) {
    throw new Error(`OpenAI response was not valid JSON: ${error}`);
  }

  return aiProposalSchema.parse(parsed);
}
