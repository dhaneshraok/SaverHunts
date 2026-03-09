from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.endpoints import search, tasks

app = FastAPI(
    title="SaverHunt Engine",
    description="Backend API for SaverHunt Monorepo",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api/v1/search", tags=["Search"])
app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["Tasks"])

@app.get("/health")
async def health_check():
    return {"status": "ok"}
