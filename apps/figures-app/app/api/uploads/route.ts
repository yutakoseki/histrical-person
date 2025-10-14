import { NextResponse } from "next/server";
import { createPresignedUpload, uploadSchema } from "@/lib/uploads";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = uploadSchema.parse(body);
    const result = await createPresignedUpload(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create presigned upload URL", error);
    const message =
      error instanceof Error ? error.message : "Failed to create upload URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
