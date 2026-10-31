"""Share images: 1200x630 Open Graph card for a public profile, drawn with Pillow."""
from __future__ import annotations

import io
import time
from functools import lru_cache

import httpx
from fastapi import APIRouter, Response
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from ..config import ROOT
from ..deps import Db
from .routes import profile_payload, visible_user

router = APIRouter(tags=["og"])
FONT_DIR = ROOT / "api" / "fonts"
INK, PAPER, MUTED = (13, 12, 18), (244, 241, 234), (201, 196, 214)
ACCENT = {"spring": (255, 122, 162), "summer": (255, 194, 61), "fall": (255, 115, 64), "winter": (99, 199, 255)}
_cache: dict[str, tuple[float, bytes]] = {}


def font(size: int, display: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    name = "DelaGothicOne-Regular.ttf" if display else "ZenKakuGothicNew-Bold.ttf"
    p = FONT_DIR / name
    try:
        return ImageFont.truetype(str(p), size)
    except OSError:
        return ImageFont.load_default(size)


@lru_cache(maxsize=512)
def fetch_image(url: str) -> Image.Image | None:
    try:
        r = httpx.get(url, timeout=6, follow_redirects=True)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception:
        return None


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    s = max(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def render(p: dict) -> bytes:
    W, H = 1200, 630
    acc = ACCENT.get(p["user"]["accent"], ACCENT["fall"])
    img = Image.new("RGB", (W, H), INK)
    favs = p["favourites"][:5]
    if p["banner"] and (b := fetch_image(p["banner"]["picture"] or p["banner"]["thumbnail"] or "")):
        bg = cover(b, W, H).filter(ImageFilter.GaussianBlur(28))
        img = Image.blend(img, bg, 0.35)
    d = ImageDraw.Draw(img)
    # Covers on the right, overlapping like a fanned stack.
    cw, ch = 190, 266
    for i, f in enumerate(reversed(favs)):
        k = len(favs) - 1 - i
        x, y = W - 60 - cw - k * 120, 150 + (k % 2) * 30
        src = fetch_image(f["picture"] or f["thumbnail"] or "")
        tile = cover(src, cw, ch) if src else Image.new("RGB", (cw, ch), (42, 38, 53))
        shadow = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((20, 26, cw + 20, ch + 26), 10, fill=(0, 0, 0, 170))
        img.paste(shadow.filter(ImageFilter.GaussianBlur(10)), (x - 20, y - 20), shadow.filter(ImageFilter.GaussianBlur(10)))
        mask = Image.new("L", (cw, ch), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw, ch), 8, fill=255)
        img.paste(tile, (x, y), mask)
        if f.get("score") is not None:
            d.rectangle((x - 3, y + ch - 52, x + cw + 3, y + ch - 22), fill=PAPER)
            d.rectangle((x - 3, y + ch - 52, x + 4, y + ch - 22), fill=acc)
            d.text((x + cw - 8, y + ch - 37), f"{f['score']:.1f}", font=font(22, True), fill=INK, anchor="rm")
    d.text((60, 70), "好み Konomi", font=font(30, True), fill=acc)
    d.text((60, 150), p["user"]["display_name"][:22], font=font(64, True), fill=PAPER)
    d.text((60, 236), f"@{p['user']['username']}", font=font(28), fill=MUTED)
    s = p["stats"]
    d.text((60, 330), f"{s['watched']}", font=font(72, True), fill=acc)
    d.text((60, 412), "anime watched", font=font(26), fill=PAPER)
    d.text((60, 470), f"about {s['hours']:,} hours", font=font(26), fill=MUTED)
    if p["favourites"]:
        top = p["favourites"][0]
        d.text((60, 545), f"Favourite: {(top.get('title_en') or top['title'])[:34]}", font=font(24), fill=PAPER)
    d.rectangle((0, H - 10, W, H), fill=acc)
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


@router.get("/og/u/{username}.png")
def og(username: str, db: Db) -> Response:
    u = visible_user(db, username, None)  # share images are always the public view
    key = u.username
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < 600:
        png = hit[1]
    else:
        png = render(profile_payload(db, u))
        _cache[key] = (time.time(), png)
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})



@router.get("/u/{username}", include_in_schema=False)
def profile_html(username: str, db: Db) -> Response:
    """Production entry for shared links: the SPA shell with link-preview tags filled in.
    (In development Vite serves /u/* itself, so previews only render once the built app is served from here.)"""
    from html import escape

    from fastapi.responses import HTMLResponse

    from ..config import get_settings

    index = ROOT / "web" / "dist" / "index.html"
    if not index.exists():
        return HTMLResponse("Build the web app first (npm run build).", status_code=503)
    shell = index.read_text(encoding="utf-8")
    try:
        u = visible_user(db, username, None)
    except Exception:
        return HTMLResponse(shell)
    base = get_settings().public_url.rstrip("/")
    title = escape(f"{u.display_name} on Konomi")
    desc = escape((u.profile or {}).get("bio") or f"{u.display_name}'s anime chart, scored by comparison.")
    meta = (f'<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">'
            f'<meta property="og:image" content="{base}/og/u/{escape(u.username)}.png">'
            f'<meta property="og:url" content="{base}/u/{escape(u.username)}"><meta name="twitter:card" content="summary_large_image">')
    return HTMLResponse(shell.replace("</head>", meta + "</head>", 1))
