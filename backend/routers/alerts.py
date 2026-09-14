"""
MS-PlateNet - Telegram Alert Router
Sends alert when Singapore plate detected.
Config saved to .env file so it persists across restarts.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import httpx
import os
import base64

router = APIRouter()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID", "")


class TelegramConfig(BaseModel):
    bot_token: str
    chat_id: str


class AlertPayload(BaseModel):
    plate_text: str
    country: str
    confidence: float
    inference_time_ms: float
    crop_base64: str | None = None
    timestamp: str


@router.post("/configure")
def configure_telegram(config: TelegramConfig):
    """
    Save Telegram bot token and chat ID.
    Writes to backend/.env so config persists across uvicorn restarts.
    """
    global TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
    TELEGRAM_BOT_TOKEN = config.bot_token
    TELEGRAM_CHAT_ID   = config.chat_id

    # Read existing .env lines (if file exists)
    env_path = ".env"
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()

    # Remove old token/chat_id lines
    lines = [
        line for line in lines
        if not line.startswith("TELEGRAM_BOT_TOKEN=")
        and not line.startswith("TELEGRAM_CHAT_ID=")
    ]

    # Append updated values
    lines.append("TELEGRAM_BOT_TOKEN=" + config.bot_token + "\n")
    lines.append("TELEGRAM_CHAT_ID="   + config.chat_id   + "\n")

    with open(env_path, "w") as f:
        f.writelines(lines)

    return {"message": "Telegram configured and saved to .env successfully."}


@router.get("/status")
def telegram_status():
    """Check if Telegram is configured."""
    return {
        "configured": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID),
        "has_token":   bool(TELEGRAM_BOT_TOKEN),
        "has_chat_id": bool(TELEGRAM_CHAT_ID),
    }


@router.post("/send")
async def send_telegram_alert(payload: AlertPayload):
    """Send Telegram alert for Singapore plate detection."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise HTTPException(
            status_code=400,
            detail="Telegram not configured. Go to Settings and enter your Bot Token and Chat ID."
        )

    confidence_pct = round(payload.confidence * 100, 1)

    message = (
        "\U0001f6a8 *AMARAN / ALERT* \U0001f6a8\n"
        "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        "*Plat Nombor / Plate:* `" + (payload.plate_text or 'Tidak dapat dibaca') + "`\n"
        "*Negara / Country:* " + payload.country + "\n"
        "*Keyakinan / Confidence:* " + str(confidence_pct) + "%\n"
        "*Masa / Time:* " + payload.timestamp + "\n"
        "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        "*Kenderaan Singapura dikesan!*\n"
        "*Singapore vehicle detected!*\n\n"
        "\u26a0\ufe0f Sila periksa pam dan tolak RON95.\n"
        "\u26a0\ufe0f Please check pump and refuse RON95."
    )

    base_url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN

    async with httpx.AsyncClient(timeout=10) as client:
        if payload.crop_base64:
            try:
                img_bytes = base64.b64decode(payload.crop_base64)
                resp = await client.post(
                    base_url + "/sendPhoto",
                    data={
                        "chat_id":    TELEGRAM_CHAT_ID,
                        "caption":    message,
                        "parse_mode": "Markdown",
                    },
                    files={"photo": ("plate.jpg", img_bytes, "image/jpeg")},
                )
            except Exception:
                resp = await client.post(
                    base_url + "/sendMessage",
                    json={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"},
                )
        else:
            resp = await client.post(
                base_url + "/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"},
            )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Telegram API error: " + resp.text)

    return {"message": "Alert sent successfully.", "telegram_response": resp.json()}
