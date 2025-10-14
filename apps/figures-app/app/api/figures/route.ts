import { NextResponse } from "next/server";
import { createFigure, listFigures, newFigureSchema } from "@/lib/figures";

export async function GET() {
  try {
    const figures = await listFigures();
    return NextResponse.json({ figures });
  } catch (error) {
    console.error("Failed to list figures", error);
    return NextResponse.json(
      { error: "Failed to list figures" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = newFigureSchema.parse(body);
    const item = await createFigure(payload);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Failed to create figure", error);
    const message =
      error instanceof Error ? error.message : "Failed to create figure";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
