#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import { HistricalPersonStack } from "../lib/stack";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = new cdk.App();

new HistricalPersonStack(app, "HistricalPersonStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
});
