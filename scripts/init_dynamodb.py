#!/usr/bin/env python3
"""Initialize DynamoDB with sample historical figures."""

import sys
import boto3
from botocore.exceptions import ClientError

# Sample historical figures
SAMPLE_FIGURES = [
    {
        "pk": "figure#001",
        "name": "織田信長",
        "status": "available",
        "bio": "戦国時代の武将。天下統一を目指し、桶狭間の戦いで今川義元を破る。本能寺の変で倒れる。",
    },
    {
        "pk": "figure#002",
        "name": "豊臣秀吉",
        "status": "available",
        "bio": "戦国時代から安土桃山時代の武将。織田信長に仕え、天下統一を果たす。",
    },
    {
        "pk": "figure#003",
        "name": "徳川家康",
        "status": "available",
        "bio": "江戸幕府の初代征夷大将軍。関ヶ原の戦いで勝利し、260年続く江戸時代を築く。",
    },
    {
        "pk": "figure#004",
        "name": "坂本龍馬",
        "status": "available",
        "bio": "幕末の志士。薩長同盟の仲介や大政奉還に尽力。近代日本の礎を築いた。",
    },
    {
        "pk": "figure#005",
        "name": "西郷隆盛",
        "status": "available",
        "bio": "幕末から明治時代の武士・軍人・政治家。明治維新の立役者の一人。",
    },
    {
        "pk": "figure#006",
        "name": "伊達政宗",
        "status": "available",
        "bio": "戦国時代から江戸時代初期の武将。仙台藩の初代藩主。独眼竜として知られる。",
    },
    {
        "pk": "figure#007",
        "name": "武田信玄",
        "status": "available",
        "bio": "戦国時代の武将。甲斐国の守護大名。風林火山の旗印で知られる。",
    },
    {
        "pk": "figure#008",
        "name": "上杉謙信",
        "status": "available",
        "bio": "戦国時代の武将。越後国の守護代。軍神と称される。川中島の戦いで武田信玄と対峙。",
    },
    {
        "pk": "figure#009",
        "name": "真田幸村",
        "status": "available",
        "bio": "安土桃山時代から江戸時代初期の武将。大坂の陣で徳川家康を追い詰めた。",
    },
    {
        "pk": "figure#010",
        "name": "源義経",
        "status": "available",
        "bio": "平安時代末期の武将。兄・頼朝を助けて平家を滅ぼすが、後に追われる身となる。",
    },
]


def init_figures_table(table_name: str = "figures") -> None:
    """Initialize figures table with sample data."""
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)

    print(f"Initializing DynamoDB table: {table_name}")
    print("-" * 60)

    success_count = 0
    error_count = 0

    for figure in SAMPLE_FIGURES:
        try:
            # Check if item already exists
            response = table.get_item(Key={"pk": figure["pk"]})
            if "Item" in response:
                print(f"⏩ Skipped (exists): {figure['name']} ({figure['pk']})")
                continue

            # Put new item
            table.put_item(Item=figure)
            print(f"✓ Added: {figure['name']} ({figure['pk']})")
            success_count += 1

        except ClientError as e:
            print(f"✗ Error adding {figure['name']}: {e}")
            error_count += 1

    print("-" * 60)
    print(f"Summary: {success_count} added, {error_count} errors")

    if error_count > 0:
        sys.exit(1)


def verify_table_exists(table_name: str = "figures") -> bool:
    """Check if the DynamoDB table exists."""
    try:
        dynamodb = boto3.client("dynamodb")
        dynamodb.describe_table(TableName=table_name)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            print(f"Error: Table '{table_name}' does not exist.")
            print("Please deploy the CDK stack first: pnpm cdk deploy")
            return False
        raise


def main():
    """Main entry point."""
    table_name = "figures"

    print("DynamoDB Initialization Script")
    print("=" * 60)

    # Check if table exists
    if not verify_table_exists(table_name):
        sys.exit(1)

    # Initialize table
    init_figures_table(table_name)

    print("\nDone! You can now verify the data:")
    print(f"  aws dynamodb scan --table-name {table_name} --max-items 10")


if __name__ == "__main__":
    main()


