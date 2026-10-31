from fastapi import FastAPI

from .auth.routes import me_router
from .auth.routes import router as auth_router
from .catalog.routes import router as catalog_router
from .lists.routes import router as list_router

app = FastAPI(title="Konomi")
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(catalog_router)
app.include_router(list_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}
