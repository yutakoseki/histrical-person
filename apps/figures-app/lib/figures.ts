import {
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { dynamoDocClient } from "@/lib/aws";
import { env } from "@/lib/env";

export const FIGURE_STATUSES = ["ready", "available", "locked", "completed"] as const;

export const figureRecordSchema = z.object({
  pk: z.string(),
  name: z.string(),
  status: z.string(),
  youtubeTitle: z.string().optional(),
  bio: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  aiPlan: z
    .object({
      summary: z.string(),
      angle: z.string().optional(),
      hook: z.string().optional(),
      thumbnailIdea: z.string().optional(),
      thumbnailTitle: z.string().optional(),
      sources: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    })
    .partial()
    .optional(),
  thumbnailKey: z.string().optional(),
  portraitKey: z.string().optional(),
  lockedUntil: z.number().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  video: z
    .object({
      s3Key: z.string().optional(),
      youtubeId: z.string().optional(),
      durationMs: z.number().optional(),
      updatedAt: z.number().optional(),
    })
    .optional(),
});

export type FigureRecord = z.infer<typeof figureRecordSchema>;

export const newFigureSchema = z.object({
  name: z
    .string({ required_error: "name is required" })
    .min(1, "name is required")
    .max(32, "name must be 32 characters or fewer"),
  youtubeTitle: z
    .string({ required_error: "youtubeTitle is required" })
    .min(1, "youtubeTitle is required")
    .max(100, "youtubeTitle must be 100 characters or fewer"),
  status: z.string().default("ready"),
  bio: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  aiPlan: figureRecordSchema.shape.aiPlan.optional(),
  thumbnailKey: z.string().optional(),
  portraitKey: z.string().optional(),
});

export type NewFigureInput = z.infer<typeof newFigureSchema>;

export const updateFigureSchema = newFigureSchema.partial().extend({
  status: z.string().optional(),
});

export type UpdateFigureInput = z.infer<typeof updateFigureSchema>;

export async function listFigures(): Promise<FigureRecord[]> {
  const response = await dynamoDocClient.send(
    new ScanCommand({
      TableName: env.FIGURES_TABLE_NAME,
    }),
  );
  const items = response.Items ?? [];
  return items
    .map((item) => {
      const parsed = figureRecordSchema.safeParse(item);
      if (!parsed.success) {
        return null;
      }
      return parsed.data;
    })
    .filter((item): item is FigureRecord => item !== null)
    .sort((a, b) => a.pk.localeCompare(b.pk));
}

export async function createFigure(input: NewFigureInput): Promise<FigureRecord> {
  const data = newFigureSchema.parse(input);
  const now = Date.now();
  const existing = await listFigures();

  if (existing.some((item) => item.name === data.name)) {
    throw new Error(`Figure with name ${data.name} already exists`);
  }

  const nextPk = determineNextPk(existing);

  const item: FigureRecord = {
    pk: nextPk,
    status: data.status ?? "ready",
    name: data.name,
    youtubeTitle: data.youtubeTitle,
    bio: data.bio,
    notes: data.notes,
    tags: data.tags,
    aiPlan: data.aiPlan,
    thumbnailKey: data.thumbnailKey,
    portraitKey: data.portraitKey,
    createdAt: now,
    updatedAt: now,
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: env.FIGURES_TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );

  return item;
}

export async function updateFigure(
  pk: string,
  changes: UpdateFigureInput,
): Promise<void> {
  const data = updateFigureSchema.parse(changes);
  const now = Date.now();
  const sets: string[] = [];
  const names: Record<string, string> = {
    "#updatedAt": "updatedAt",
  };
  const values: Record<string, unknown> = {
    ":updatedAt": now,
  };

  const apply = <Key extends keyof UpdateFigureInput>(
    key: Key,
    attrName: string = key as string,
  ) => {
    const value = data[key];
    if (value === undefined) {
      return;
    }
    const placeholderName = `#${attrName}`;
    const valueName = `:${attrName}`;
    names[placeholderName] = attrName;
    values[valueName] = value;
    sets.push(`${placeholderName} = ${valueName}`);
  };

  apply("name");
  apply("status");
  apply("youtubeTitle");
  apply("bio");
  apply("notes");
  apply("tags");
  apply("aiPlan");
  apply("thumbnailKey");
  apply("portraitKey");

  if (!sets.length) {
    return;
  }

  sets.push("#updatedAt = :updatedAt");

  await dynamoDocClient.send(
    new UpdateCommand({
      TableName: env.FIGURES_TABLE_NAME,
      Key: { pk },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

function determineNextPk(existing: FigureRecord[]): string {
  const prefix = "figure#";
  const maxId = existing.reduce((max, item) => {
    const match = item.pk.match(/^figure#(\d+)$/);
    if (!match) {
      return max;
    }
    const num = Number.parseInt(match[1], 10);
    return Number.isNaN(num) ? max : Math.max(max, num);
  }, 0);
  const next = maxId + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}
