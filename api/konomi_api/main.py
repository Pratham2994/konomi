import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .auth.routes import me_router
from .auth.routes import router as auth_router
from .catalog.routes import router as catalog_router
from .catalog.sweep import router as sweep_router
from .lists.routes import router as list_router
from .rating.routes import router as rate_router
from .taste.routes import router as taste_router
from .profile.routes import router as profile_router
from .profile.og import router as og_router
from .config import ROOT
from .imports.routes import router as import_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load the taste model in the background so the first recommendation request doesn't pay for it.
    from .taste.engine import get_engine
    threading.Thread(target=get_engine, daemon=True).start()
    yield


app = FastAPI(title="Konomi", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(catalog_router)
app.include_router(sweep_router)
app.include_router(list_router)
app.include_router(rate_router)
app.include_router(taste_router)
app.include_router(profile_router)
app.include_router(og_router)
app.include_router(import_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# Production: the same service serves the built web app, so pages and API share one origin (simple, first-party
# cookies). In development Vite serves the app and this block is skipped because web/dist doesn't exist.
WEB = ROOT / "web" / "dist"
if (WEB / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=WEB / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith(("api/", "og/")):
            raise HTTPException(404)
        f = (WEB / path).resolve()
        if path and f.is_file() and WEB.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(WEB / "index.html")
