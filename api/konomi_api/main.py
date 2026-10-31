from fastapi import FastAPI

from .auth.routes import me_router
from .auth.routes import router as auth_router
from .catalog.routes import router as catalog_router
from .catalog.sweep import router as sweep_router
from .lists.routes import router as list_router
from .rating.routes import router as rate_router
from .taste.routes import router as taste_router
from .profile.routes import router as profile_router
from .profile.og import router as og_router

app = FastAPI(title="Konomi")
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(catalog_router)
app.include_router(sweep_router)
app.include_router(list_router)
app.include_router(rate_router)
app.include_router(taste_router)
app.include_router(profile_router)
app.include_router(og_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}
