"""
Forqast — FastAPI Backend
=========================
Main application entrypoint.

Run from the forqast/ root:
    uvicorn backend.main:app --reload --port 8000

Then open:
    http://localhost:8000        → health check
    http://localhost:8000/docs  → interactive API docs (Swagger)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes.predict import router as predict_router
from backend.routes.upload  import router as upload_router

app = FastAPI(
    title       = "Forqast API",
    description = "AI-powered demand forecasting for Sri Lankan restaurants",
    version     = "1.0.0",
)

# Allow React frontend (port 5173) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(predict_router, prefix="/api")
app.include_router(upload_router,  prefix="/api")


@app.get("/")
def root():
    return {
        "service": "Forqast API",
        "status":  "running",
        "version": "1.0.0",
        "docs":    "/docs",
    }