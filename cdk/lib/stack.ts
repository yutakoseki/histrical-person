import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as destinations from "aws-cdk-lib/aws-lambda-destinations";

export class HistricalPersonStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const figuresTable = new dynamodb.Table(this, "FiguresTable", {
      tableName: "figures",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    figuresTable.addGlobalSecondaryIndex({
      indexName: "status-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "pk", type: dynamodb.AttributeType.STRING },
    });

    const sayingsTable = new dynamodb.Table(this, "SayingsTable", {
      tableName: "sayings",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const artifactsBucket = new s3.Bucket(this, "ArtifactsBucket", {
      autoDeleteObjects: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // サムネイルバケット（既存バケットを参照）
    const thumbnailBucket = s3.Bucket.fromBucketName(
      this,
      "ThumbnailBucket",
      "histrical-person-thumbnails"
    );

    // BGMバケット（既存バケットを参照）
    const bgmBucket = s3.Bucket.fromBucketName(
      this,
      "BgmBucket",
      "histrical-person-bgm"
    );

    const ffmpegLayer = new lambda.LayerVersion(this, "FfmpegLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../../layers/ffmpeg")),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      description: "Static ffmpeg/ffprobe binaries for media rendering",
    });

    const fontsLayer = new lambda.LayerVersion(this, "FontsLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../../layers/fonts")),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      description: "Font assets for ASS subtitle rendering",
    });

    const baseEnv = {
      DDB_FIGURES: figuresTable.tableName,
      DDB_SAYINGS: sayingsTable.tableName,
      S3_BUCKET: artifactsBucket.bucketName,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      OPENAI_COMPLETION_MODEL: process.env.OPENAI_COMPLETION_MODEL ?? "gpt-4o",
      OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      OPENAI_TTS_VOICE: process.env.OPENAI_TTS_VOICE ?? "ash",
      OPENAI_TTS_FORMAT: process.env.OPENAI_TTS_FORMAT ?? "mp3",
      OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
      OPENAI_IMAGE_SIZE: process.env.OPENAI_IMAGE_SIZE ?? "1024x1792",
      LOCK_MINUTES: process.env.LOCK_MINUTES ?? "60",
      YT_CLIENT_ID: process.env.YT_CLIENT_ID ?? "",
      YT_CLIENT_SECRET: process.env.YT_CLIENT_SECRET ?? "",
      YT_REFRESH_TOKEN: process.env.YT_REFRESH_TOKEN ?? "",
    };

    // uploadYoutubeを先に定義
    const uploadYoutube = this.createPythonFunction("UploadYoutube", {
      entry: path.join(__dirname, "../../lambdas/upload_youtube"),
      environment: {
        ...baseEnv,
        THUMBNAIL_BUCKET: thumbnailBucket.bucketName,
      },
      timeout: cdk.Duration.minutes(15),
    });

    // renderAudioVideoを次に定義
    const renderAudioVideo = this.createPythonFunction("RenderAudioVideo", {
      entry: path.join(__dirname, "../../lambdas/render_audio_video"),
      environment: {
        ...baseEnv,
        BGM_S3_BUCKET: "histrical-person-bgm",
        BGM_S3_KEY: "bgm.mp3",
        BGM_VOLUME: "0.15",
      },
      timeout: cdk.Duration.minutes(15),  // Lambdaの最大タイムアウト
      memorySize: 3008,  // Lambda最大メモリ（このアカウントの上限）
      ephemeralStorageSize: cdk.Size.mebibytes(10240),  // 最大エフェメラルストレージ（10240 MB）
      layers: [ffmpegLayer, fontsLayer],
      onSuccess: new destinations.LambdaDestination(uploadYoutube, {
        responseOnly: false,
      }),
    });

    // generateSnippetsを次に定義
    const generateSnippets = this.createPythonFunction("GenerateSnippets", {
      entry: path.join(__dirname, "../../lambdas/generate_snippets_for_figure"),
      environment: baseEnv,
      timeout: cdk.Duration.minutes(10),  // 150個生成のため5分→10分に延長
      onSuccess: new destinations.LambdaDestination(renderAudioVideo, {
        responseOnly: false,
      }),
    });

    const selectAndLock = this.createPythonFunction("SelectAndLockFigure", {
      entry: path.join(__dirname, "../../lambdas/select_and_lock_figure"),
      environment: baseEnv,
      timeout: cdk.Duration.seconds(30),
      onSuccess: new destinations.LambdaDestination(generateSnippets, {
        responseOnly: false,
      }),
    });

    const lockAutoRelease = this.createPythonFunction("LockAutoRelease", {
      entry: path.join(__dirname, "../../lambdas/lock_auto_release"),
      environment: baseEnv,
      timeout: cdk.Duration.minutes(1),
    });

    // Permissions
    figuresTable.grantReadWriteData(selectAndLock);
    figuresTable.grantReadWriteData(generateSnippets);
    figuresTable.grantReadWriteData(lockAutoRelease);
    figuresTable.grantReadWriteData(renderAudioVideo);
    figuresTable.grantReadWriteData(uploadYoutube);

    sayingsTable.grantReadWriteData(generateSnippets);
    sayingsTable.grantReadData(renderAudioVideo);

    artifactsBucket.grantReadWrite(renderAudioVideo);
    artifactsBucket.grantReadWrite(uploadYoutube);

    thumbnailBucket.grantRead(uploadYoutube);
    bgmBucket.grantRead(renderAudioVideo);


    // EventBridge schedules
    const selectRule = new events.Rule(this, "SelectFigureRule", {
      schedule: events.Schedule.cron({ minute: "5", hour: "15" }), // 00:05 JST (UTC 15:05)
    });
    selectRule.addTarget(new targets.LambdaFunction(selectAndLock));

    const lockRule = new events.Rule(this, "LockAutoReleaseRule", {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });
    lockRule.addTarget(new targets.LambdaFunction(lockAutoRelease));

    const renderRule = new events.Rule(this, "RenderVideoRule", {
      enabled: false,
      schedule: events.Schedule.cron({ minute: "30", hour: "1" }),
    });
    renderRule.addTarget(new targets.LambdaFunction(renderAudioVideo));


    // Outputs
    new cdk.CfnOutput(this, "FiguresTableName", { value: figuresTable.tableName });
    new cdk.CfnOutput(this, "SayingsTableName", { value: sayingsTable.tableName });
    new cdk.CfnOutput(this, "ArtifactsBucketName", { value: artifactsBucket.bucketName });
  }

  private createPythonFunction(
    id: string,
    props: {
      entry: string;
      environment: { [key: string]: string };
      timeout: cdk.Duration;
      layers?: lambda.ILayerVersion[];
      memorySize?: number;
      ephemeralStorageSize?: cdk.Size;
      onSuccess?: lambda.IDestination;
    }
  ): lambda.Function {
    const { entry, environment, timeout, layers, memorySize, ephemeralStorageSize } = props;

    return new lambda.Function(this, id, {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "main.handler",
      code: lambda.Code.fromAsset(entry, {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "set -euo pipefail",
              "if [ -f requirements.txt ]; then pip install -r requirements.txt -t /asset-output; fi",
              "cp -R . /asset-output/",
            ].join(" && "),
          ],
        },
      }),
      timeout,
      environment,
      layers,
      memorySize,
      ephemeralStorageSize,
      onSuccess: props.onSuccess,
    });
  }
}
