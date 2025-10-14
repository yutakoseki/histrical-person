import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { env } from "@/lib/env";
import { s3Client } from "@/lib/aws";

export const uploadSchema = z.object({
  type: z.enum(["thumbnail", "portrait"]),
  filename: z.string().min(1, "filename is required"),
  contentType: z.string().min(1, "contentType is required"),
});

export type UploadRequest = z.infer<typeof uploadSchema>;

export async function createPresignedUpload(
  input: UploadRequest,
): Promise<{ url: string; bucket: string; key: string; expiresIn: number }> {
  const payload = uploadSchema.parse(input);
  const expiresIn = 60 * 5; // 5 minutes

  const { bucket, key } = resolveTarget(payload);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: payload.contentType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  return { url, bucket, key, expiresIn };
}

function resolveTarget(payload: UploadRequest): { bucket: string; key: string } {
  if (payload.type === "thumbnail") {
    return {
      bucket: env.THUMBNAIL_BUCKET_NAME,
      key: payload.filename,
    };
  }

  const prefix = env.PORTRAIT_PREFIX.endsWith("/")
    ? env.PORTRAIT_PREFIX
    : `${env.PORTRAIT_PREFIX}/`;
  const normalizedFilename = payload.filename.startsWith(prefix)
    ? payload.filename.slice(prefix.length)
    : payload.filename;

  return {
    bucket: env.ARTIFACTS_BUCKET_NAME,
    key: `${prefix}${normalizedFilename}`,
  };
}
