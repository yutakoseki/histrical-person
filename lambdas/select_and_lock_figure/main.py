"""Select an available figure and lock it for snippet generation."""

from __future__ import annotations

import os
import time
from typing import Any, Dict

import boto3
from boto3.dynamodb.conditions import Key


DDB_FIGURES = os.environ.get("DDB_FIGURES", "figures")
STATUS_INDEX = "status-index"
LOCK_MINUTES = int(os.environ.get("LOCK_MINUTES", "60"))

dynamodb = boto3.resource("dynamodb")
figures_table = dynamodb.Table(DDB_FIGURES)


def _lock_until_ms(now_ms: int) -> int:
    return now_ms + LOCK_MINUTES * 60 * 1000


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda entrypoint."""
    response = figures_table.query(
        IndexName=STATUS_INDEX,
        KeyConditionExpression=Key("status").eq("available"),
        Limit=1,
        ScanIndexForward=True,
    )

    items = response.get("Items") or []
    if not items:
        return {"message": "no available figure"}

    figure = items[0]
    pk = figure["pk"]
    name = figure.get("name")
    now_ms = int(time.time() * 1000)
    lock_until = _lock_until_ms(now_ms)

    try:
        figures_table.update_item(
            Key={"pk": pk},
            UpdateExpression="SET #s = :locked, lockedUntil = :until, updatedAt = :updated",
            ConditionExpression="#s = :available",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":locked": "locked",
                ":available": "available",
                ":until": lock_until,
                ":updated": now_ms,
            },
        )
    except figures_table.meta.client.exceptions.ConditionalCheckFailedException:
        # Another worker acquired the lock; fall back to indicating none available.
        return {"message": "no available figure"}

    return {"figurePk": pk, "name": name}


if __name__ == "__main__":
    print(handler({}, None))
