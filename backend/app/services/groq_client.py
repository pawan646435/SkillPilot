"""Groq chat-completion wrapper — Python port of functions/src/groq.js.

Same model (llama-3.3-70b-versatile), same upstream URL, same env var name.

Two calling styles live here (Stage 3 added the second):
- fetch_groq_chat / fetch_groq_content / fetch_groq_json: buffered — one
  POST, one parsed response. Clash, Assessments, and the non-streaming
  panel endpoints all use these; their behavior is unchanged.
- stream_groq_content: an async generator over the same endpoint with
  stream=True. Groq then answers with text/event-stream — a sequence of
  `data: {...}` SSE lines whose choices[0].delta.content each carry the
  next few characters — instead of one JSON body. This yields just those
  text deltas; assembling them is the caller's job.
"""
import json
import re
from collections.abc import AsyncIterator

from app.config import DEBUG, GROQ_API_KEY, GROQ_API_URL, GROQ_MODEL
from app.services.http_client import get_http_client


class GroqError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def strip_json_fences(text: str) -> str:
    cleaned = re.sub(r"```json\s*", "", text or "", flags=re.IGNORECASE)
    cleaned = re.sub(r"```\s*", "", cleaned, flags=re.IGNORECASE).strip()

    # Fix truncated JSON: if it doesn't end with }, try to close it.
    if cleaned.startswith("{") and not cleaned.endswith("}"):
        last_brace = cleaned.rfind("}")
        last_bracket = cleaned.rfind("]")
        last_complete = max(last_brace, last_bracket)
        if last_complete > 0:
            cleaned = cleaned[: last_complete + 1]
            open_braces = cleaned.count("{") - cleaned.count("}")
            open_brackets = cleaned.count("[") - cleaned.count("]")
            cleaned += "]" * max(0, open_brackets) + "}" * max(0, open_braces)

    # Remove trailing commas before closing brackets/braces.
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    return cleaned


async def fetch_groq_chat(messages: list[dict], *, temperature: float = 0.7, max_tokens: int = 1024,
                           json_mode: bool = False) -> dict:
    """Calls Groq's chat completions endpoint and returns the raw parsed JSON
    response body (mirrors fetchGroqChatHandler's return value: the full
    Groq response object, not just the message content)."""
    if not GROQ_API_KEY:
        raise GroqError("Groq API key is missing on the server.", 500)

    if not messages:
        raise GroqError("messages must be a non-empty array.", 400)

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    client = get_http_client()
    response = await client.post(
        GROQ_API_URL,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30.0,
    )

    raw = response.text
    if DEBUG:
        print("Groq upstream status:", response.status_code)
        print("Groq upstream body:", raw)

    if response.status_code >= 400:
        raise GroqError(f"Groq API error {response.status_code}: {raw}", 500)

    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        raise GroqError("Groq API returned invalid JSON.", 500) from exc


async def stream_groq_content(messages: list[dict], *, temperature: float = 0.7,
                              max_tokens: int = 1024) -> AsyncIterator[str]:
    """Streams a completion, yielding each text delta as Groq produces it.

    Upstream errors are raised as GroqError only if they happen before the
    first delta (a >=400 status arrives before any SSE line does, so this
    covers the auth/quota/bad-request cases). Mid-stream failures surface as
    httpx exceptions to the caller, which must decide how to represent an
    error inside an already-started response — by then the HTTP status has
    already gone out.
    """
    if not GROQ_API_KEY:
        raise GroqError("Groq API key is missing on the server.", 500)
    if not messages:
        raise GroqError("messages must be a non-empty array.", 400)

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    client = get_http_client()
    async with client.stream(
        "POST",
        GROQ_API_URL,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30.0,
    ) as response:
        if response.status_code >= 400:
            body = (await response.aread()).decode("utf-8", errors="replace")
            raise GroqError(f"Groq API error {response.status_code}: {body}", 500)

        async for line in response.aiter_lines():
            # SSE frames: content lines are "data: <json>", the stream ends
            # with the literal sentinel "data: [DONE]". Blank lines are
            # frame separators; ignore anything else.
            if not line.startswith("data: "):
                continue
            data = line[len("data: "):]
            if data.strip() == "[DONE]":
                return
            try:
                chunk = json.loads(data)
            except (json.JSONDecodeError, ValueError) as exc:
                raise GroqError("Groq stream returned an invalid chunk.", 500) from exc
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content")
            if content:
                yield content


async def fetch_groq_content(messages: list[dict], **kwargs) -> str:
    """Convenience wrapper that returns just the completion's text content,
    for callers that don't need the full response envelope."""
    data = await fetch_groq_chat(messages, **kwargs)
    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not isinstance(content, str):
        raise GroqError("Groq API returned an invalid completion.", 500)
    return content


async def fetch_groq_json(messages: list[dict], **kwargs) -> dict:
    """Calls Groq expecting a JSON-object completion, strips code fences,
    and parses it. Mirrors clash.js's callGroqJson."""
    content = await fetch_groq_content(messages, json_mode=True, **kwargs)
    try:
        return json.loads(strip_json_fences(content))
    except (json.JSONDecodeError, ValueError) as exc:
        raise GroqError("Generated content was not valid JSON.", 500) from exc
