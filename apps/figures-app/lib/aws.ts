import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

const dynamoClient = new DynamoDBClient({
  region: env.AWS_REGION,
});

export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  forcePathStyle: false,
});
