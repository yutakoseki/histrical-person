"""Select an available figure and lock it for snippet generation."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict

import boto3
from boto3.dynamodb.conditions import Key


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

DDB_FIGURES = os.environ.get("DDB_FIGURES", "figures")
STATUS_INDEX = "status-index"
LOCK_MINUTES = int(os.environ.get("LOCK_MINUTES", "60"))

dynamodb = boto3.resource("dynamodb")
figures_table = dynamodb.Table(DDB_FIGURES)


def _lock_until_ms(now_ms: int) -> int:
    return now_ms + LOCK_MINUTES * 60 * 1000


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda entrypoint."""
    LOGGER.info(f"SelectAndLockFigure started. Event: {event}")
    
    response = figures_table.query(
        IndexName=STATUS_INDEX,
        KeyConditionExpression=Key("status").eq("available"),
        Limit=1,
        ScanIndexForward=True,
    )

    items = response.get("Items") or []
    LOGGER.info(f"Found {len(items)} available figures")
    
    if not items:
        LOGGER.info("No available figure found")
        return {"message": "no available figure"}

    figure = items[0]
    pk = figure["pk"]
    name = figure.get("name")
    LOGGER.info(f"Selected figure: {name} ({pk})")
    
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
        LOGGER.info(f"Successfully locked {name}")
    except figures_table.meta.client.exceptions.ConditionalCheckFailedException:
        # Another worker acquired the lock; fall back to indicating none available.
        LOGGER.warning(f"Failed to lock {name} - already locked by another worker")
        return {"message": "no available figure"}

    result = {"figurePk": pk, "name": name}
    LOGGER.info(f"Returning result: {result}")
    return result


if __name__ == "__main__":
    print(handler({}, None))
