import OpenAI from "openai";
import { env } from "@/lib/env";

export const openaiClient = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;
