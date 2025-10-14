import { z } from "zod";

const serverSchema = z.object({
  AWS_REGION: z.string().min(1, "AWS_REGION is required"),
  FIGURES_TABLE_NAME: z.string().min(1, "FIGURES_TABLE_NAME is required"),
  ARTIFACTS_BUCKET_NAME: z.string().min(1, "ARTIFACTS_BUCKET_NAME is required"),
  THUMBNAIL_BUCKET_NAME: z.string().min(1, "THUMBNAIL_BUCKET_NAME is required"),
  PORTRAIT_PREFIX: z.string().min(1).default("portraits/"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_TEMPERATURE: z.coerce.number().default(0.2),
});

export const env = serverSchema.parse({
  AWS_REGION: process.env.AWS_REGION,
  FIGURES_TABLE_NAME: process.env.FIGURES_TABLE_NAME,
  ARTIFACTS_BUCKET_NAME: process.env.ARTIFACTS_BUCKET_NAME,
  THUMBNAIL_BUCKET_NAME: process.env.THUMBNAIL_BUCKET_NAME,
  PORTRAIT_PREFIX: process.env.PORTRAIT_PREFIX,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? process.env.OPENAI_COMPLETION_MODEL,
  OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
});

export type ServerEnv = typeof env;
