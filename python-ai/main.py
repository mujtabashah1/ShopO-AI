"""
SmartShop AI — Python Analysis Service
---------------------------------------
FastAPI service providing advanced AI analysis:
- VADER + TextBlob sentiment analysis
- Fake review detection (TF-IDF clustering + linguistic features)
- Review summarization (extractive)
- Trustworthiness scoring

Runs alongside the Node.js server and is called via HTTP.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
import os
import secrets
from pydantic import BaseModel, Field, StringConstraints
from typing import Annotated, List
import time

from services.sentiment_service import analyze_sentiment
from services.fake_detection_service import detect_fake_reviews
from services.summarization_service import summarize_reviews
from services.trustworthiness_service import calculate_trustworthiness

app = FastAPI(title="SmartShop AI Engine", version="1.0.0")

# This service is called by Express, never directly by the browser.
@app.middleware("http")
async def service_auth(request, call_next):
    if request.url.path != "/health":
        key = os.getenv("PYTHON_AI_KEY", "")
        if key and not secrets.compare_digest(request.headers.get("x-service-key", ""), key):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized service request"})
    return await call_next(request)


Review = Annotated[str, StringConstraints(max_length=5000)]
Reviews = Annotated[List[Review], Field(max_length=100)]


class AnalyzeRequest(BaseModel):
    reviews: Reviews
    productName: str = Field(default="", max_length=500)
    productPrice: float = Field(default=0.0, ge=0, le=1e9, allow_inf_nan=False)
    averagePrice: float = Field(default=0.0, ge=0, le=1e9, allow_inf_nan=False)


class SentimentRequest(BaseModel):
    reviews: Reviews


class FakeDetectionRequest(BaseModel):
    reviews: Reviews
    productName: str = Field(default="", max_length=500)


@app.on_event("startup")
async def startup():
    """Pre-load models and corpora on startup."""
    print("🐍 SmartShop AI Python Service starting...")
    if os.getenv("NODE_ENV") == "production" and len(os.getenv("PYTHON_AI_KEY", "")) < 32:
        raise RuntimeError("PYTHON_AI_KEY must contain at least 32 characters in production")
    # Trigger TextBlob corpus download check
    try:
        from textblob import TextBlob
        TextBlob("test").sentiment
        print("  ✅ TextBlob ready")
    except Exception as e:
        print(f"  ⚠️ TextBlob init: {e}")

    # Trigger VADER lexicon load
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        SentimentIntensityAnalyzer().polarity_scores("test")
        print("  ✅ VADER ready")
    except Exception as e:
        print(f"  ⚠️ VADER init: {e}")

    print("🚀 Python AI Service ready on port 8000")


@app.get("/health")
async def health():
    return {"status": "OK", "service": "SmartShop AI Python Engine"}


@app.post("/analyze")
def full_analysis(req: AnalyzeRequest):
    """Run complete analysis pipeline: sentiment + fake detection + summary + trust."""
    start = time.time()

    sentiment = analyze_sentiment(req.reviews)
    fake_detection = detect_fake_reviews(req.reviews, req.productName)
    summary = summarize_reviews(req.reviews, sentiment)
    trustworthiness = calculate_trustworthiness(
        sentiment, fake_detection, summary,
        req.productPrice, req.averagePrice
    )

    elapsed = round((time.time() - start) * 1000)

    return {
        "sentiment": sentiment,
        "fakeDetection": fake_detection,
        "summary": summary,
        "trustworthiness": trustworthiness,
        "processingTimeMs": elapsed
    }


@app.post("/sentiment")
def sentiment_only(req: SentimentRequest):
    """Advanced sentiment analysis only."""
    return analyze_sentiment(req.reviews)


@app.post("/fake-detection")
def fake_detection_only(req: FakeDetectionRequest):
    """Fake review detection only."""
    return detect_fake_reviews(req.reviews, req.productName)
