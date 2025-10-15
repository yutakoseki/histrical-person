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
  thumbnailTitle: z
    .string()
    .min(1, "thumbnailTitle is required")
    .max(24, "thumbnailTitle must be 24 characters or fewer"),
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

const normalizeName = (value: string): string =>
  value
    .replace(/[\\s　・･\\.\\-_,、，「」『』（）()［］\\[\\]]+/g, "")
    .toLowerCase();

const toHalfWidthDigits = (value: string): string =>
  value.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );

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
- 日本人多めだが、日本人に限らず世界中の偉人を対象とすること。近代〜現代（19〜20世紀以降）の政治家・哲学者・学者・経営者など、史実に基づく名言が豊富な人物を優先。
- 「name」は日本語表記（カタカナ表記も可）で広く認知された人物名。
- 「youtubeTitle」は以下を満たすこと:
  * 55〜85文字程度
  * タイトル冒頭は必ず「【{人物名}に学ぶ】」で始める。
  * 下記テンプレートから選ぶ。原則として💀マイナス・煽り系を優先し、同じテンプレートを続けて使わない。
    💀 マイナス・煽り系テンプレート:
      - 【○○に学ぶ】なぜあなたはまだ成功できないのか
      - 【○○に学ぶ】“凡人”がやりがちな致命的ミス○選
      - 【○○に学ぶ】この習慣が“人生を壊す”
      - 【○○に学ぶ】優秀な人ほど陥る“罠”とは
      - 【○○に学ぶ】努力しても報われない人の共通点
      - 【○○に学ぶ】失敗を繰り返す人の“口癖”
      - 【○○に学ぶ】なぜ多くの人は“夢を諦める”のか
      - 【○○に学ぶ】あなたの人生がつまらない本当の理由
      - 【○○に学ぶ】気づかぬうちに“自分をダメにしている”習慣
      - 【○○に学ぶ】“結果が出ない人”が見落としている真実
    🌅 プラス・前向き系テンプレート:
      - 【○○に学ぶ】人生を変えるたった一つの考え方
      - 【○○に学ぶ】逆境を力に変える“思考法”
      - 【○○に学ぶ】夢を叶えるために必要な“覚悟”
      - 【○○に学ぶ】小さな一歩が人生を動かす
      - 【○○に学ぶ】どん底から立ち上がる“勇気”
      - 【○○に学ぶ】心を軽くする“生き方のヒント”
      - 【○○に学ぶ】成功者が持つ“たった一つの共通点”
      - 【○○に学ぶ】今日から変われる“習慣の力”
      - 【○○に学ぶ】幸せを引き寄せる“考え方”
      - 【○○に学ぶ】努力が報われる人に共通する“信念”
    💡 応用パターン:
      - 【○○に学ぶ】“今この瞬間”から人生が変わる言葉
      - 【○○に学ぶ】たった一言で生き方が変わる
      - 【○○に学ぶ】“心に刺さる”人生の真理
      - 【○○に学ぶ】100年経っても色あせない“教え”
      - 【○○に学ぶ】“時代を超える”成功の哲学
  * テンプレ内の○○を人物名に置換し、前半で「5つの◯◯」もしくは「7つの◯◯」といった半角数字+「つの」構文を必ず挿入し、煽りのニュアンスを維持する（3は避ける）。
  * 数字は【】の直後から前半（最初の全角波ダッシュ「～」より前）で提示する。
  * タイトル末尾には必ず「 ～◯◯が見抜いた本質～ 」形式のサブタイトルを加え、◯◯には人物の視点や象徴的な肩書きを入れる。
  * 選ぶテンプレートと仕上げの文言は、その人物の代表的な言葉・逸話・行動と論理的に結びつける。人物像にそぐわない煽りは避ける。
  * 昭和・平成などの時代感や「怪物」「帝王」「鉄人」などキャッチーなワードを活用。
  * ハッシュタグや #shorts は絶対に入れない。
- 「thumbnailTitle」はサムネ用の12〜18文字程度の短い煽りコピー。全角で読みやすく、最大8語以内。人物の象徴的な言葉や教訓とつながる内容にし、可能であれば「5つ」「7つ」などの半角数字を含める。
- 「summary」は3文以内で、人物の実績や格言が現代ビジネスに与える示唆を紹介。
- 「hook」は動画冒頭で視聴者を惹きつけるパンチライン。
- 「thumbnailIdea」はサムネイルデザインを考えるうえでの補足メモ（配色・構図・配置など）。
- 「tags」はテーマに沿った短い日本語キーワードを配列で。
- 「sourceHints」は信頼できる書籍・演説・論文など名言の出典を示すもの。
- 「notes」には扱う際の注意点や補足。

既存の人物と重複しないように、禁止リスト（forbidNames）に含まれる名前は絶対に選ばないこと。
出力はUTF-8のJSONオブジェクト単体で返してください。前後に余計なテキストを入れないこと。

参考条件:
${userIntent || "特になし"}
`.trim();

  const forbiddenNames = new Set(
    (payload.forbidNames ?? []).map((name) => normalizeName(name)),
  );

  let lastError: Error | null = null;
  let allowCustomTemperature = Number.isFinite(env.OPENAI_TEMPERATURE);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let completion;
    try {
      completion = await openaiClient.chat.completions.create({
        model: env.OPENAI_MODEL,
        response_format: { type: "json_object" },
        ...(allowCustomTemperature
          ? { temperature: env.OPENAI_TEMPERATURE }
          : {}),
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
    } catch (error) {
      const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
      const param = typeof error === "object" && error !== null ? (error as { param?: unknown }).param : undefined;
      if (
        allowCustomTemperature &&
        code === "unsupported_value" &&
        param === "temperature"
      ) {
        allowCustomTemperature = false;
        lastError = new Error(
          "指定したtemperatureはモデルでサポートされませんでした。デフォルト値で再試行します。",
        );
        continue;
      }
      throw error;
    }

    const message = completion.choices[0]?.message?.content;
    if (!message) {
      lastError = new Error("Failed to receive proposal content from OpenAI");
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      lastError = new Error(`OpenAI response was not valid JSON: ${error}`);
      continue;
    }

    const proposal = aiProposalSchema.safeParse(parsed);
    if (!proposal.success) {
      lastError = new Error(
        `AI response did not match schema: ${proposal.error.message}`,
      );
      continue;
    }

    if (forbiddenNames.has(normalizeName(proposal.data.name))) {
      lastError = new Error(
        `禁止対象の人物「${proposal.data.name}」が選ばれました。再試行します。`,
      );
      continue;
    }

    const { name, youtubeTitle } = proposal.data;
    const normalizedTitle = youtubeTitle.trim();

    if (!normalizedTitle.startsWith(`【${name}に学ぶ】`)) {
      lastError = new Error(
        `タイトルが指定フォーマットを満たしません: ${youtubeTitle}`,
      );
      continue;
    }

    const digitMatch = normalizedTitle.match(/[0-9０-９]+(?=つの)/);
    if (!digitMatch) {
      lastError = new Error(
        `「5つ/7つの◯◯」構文が見つかりません: ${youtubeTitle}`,
      );
      continue;
    }

    const digitIndex = normalizedTitle.indexOf(digitMatch[0]);
    const numberValue = parseInt(toHalfWidthDigits(digitMatch[0]), 10);
    if (!Number.isFinite(numberValue) || (numberValue !== 5 && numberValue !== 7)) {
      lastError = new Error(
        `使用できる数字は5または7です: ${youtubeTitle}`,
      );
      continue;
    }

    const closingBracketIndex = normalizedTitle.indexOf("】");
    const firstWaveIndex = normalizedTitle.search(/[～〜]/);
    if (firstWaveIndex === -1) {
      lastError = new Error(
        `「～◯◯が見抜いた本質～」の構文が不足しています: ${youtubeTitle}`,
      );
      continue;
    }

    if (digitIndex <= closingBracketIndex || digitIndex > firstWaveIndex) {
      lastError = new Error(
        `数字はタイトル前半（～の前）に配置してください: ${youtubeTitle}`,
      );
      continue;
    }

    if (!/～[^～〜]*本質[^～〜]*～\s*$/.test(normalizedTitle)) {
      lastError = new Error(
        `末尾は「～◯◯が見抜いた本質～」形式にしてください: ${youtubeTitle}`,
      );
      continue;
    }

    return proposal.data;
  }

  throw lastError ?? new Error("Failed to generate a unique figure proposal");
}
