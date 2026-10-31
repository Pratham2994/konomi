"""In-process sliding-window limiter. Enough for one API process; swap for Postgres/Redis when scaled out."""
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def hit(key: str, limit: int, window_s: int) -> None:
    """Record one hit for key; raise 429 if more than `limit` hits in the last `window_s` seconds."""
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            retry = int(window_s - (now - q[0])) + 1
            raise HTTPException(429, {"code": "rate_limited", "retry_after": retry})
        q.append(now)


def undo(key: str) -> None:
    """Forget the latest hit for key (the guarded action failed on our side, e.g. mail down)."""
    with _lock:
        if _hits.get(key):
            _hits[key].pop()


def reset() -> None:
    with _lock:
        _hits.clear()
