import { NextResponse } from "next/server";
import {
  aiRequestSchema,
  generateFigureProposal,
} from "@/lib/ai";
import { listFigures } from "@/lib/figures";
import { openaiClient } from "@/lib/openai";

export async function POST(request: Request) {
  if (!openaiClient) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  try {
    const raw = await request.json().catch(() => ({}));
    const figures = await listFigures();
    const payload = aiRequestSchema.parse({
      ...raw,
      forbidNames: figures.map((item) => item.name),
    });
    const proposal = await generateFigureProposal(payload);
    return NextResponse.json({ proposal });
  } catch (error) {
    console.error("Failed to generate AI proposal", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate proposal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
