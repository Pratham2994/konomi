from fastapi import FastAPI

from .auth.routes import me_router
from .auth.routes import router as auth_router

app = FastAPI(title="Konomi")
app.include_router(auth_router)
app.include_router(me_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}
