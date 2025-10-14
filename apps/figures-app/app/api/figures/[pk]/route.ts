import { NextResponse } from "next/server";
import { updateFigure, updateFigureSchema } from "@/lib/figures";

export async function PATCH(
  request: Request,
  { params }: { params: { pk: string } },
) {
  const { pk } = params;
  if (!pk) {
    return NextResponse.json({ error: "pk is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const payload = updateFigureSchema.parse(body);
    await updateFigure(pk, payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update figure", error);
    const message =
      error instanceof Error ? error.message : "Failed to update figure";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
