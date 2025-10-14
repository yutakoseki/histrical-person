import { config as loadEnv } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnv({ path: join(__dirname, "../../.env"), override: false });
loadEnv({ path: join(__dirname, "../../.env.local"), override: true });
loadEnv({ path: join(__dirname, ".env"), override: true });
loadEnv({ path: join(__dirname, ".env.local"), override: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: [
      "@aws-sdk/client-dynamodb",
      "@aws-sdk/lib-dynamodb",
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
      "openai"
    ]
  },
  eslint: {
    dirs: ["app", "components", "lib"]
  }
};

export default nextConfig;
