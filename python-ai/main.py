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
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import time

from services.sentiment_service import analyze_sentiment
from services.fake_detection_service import detect_fake_reviews
from services.summarization_service import summarize_reviews
from services.trustworthiness_service import calculate_trustworthiness

app = FastAPI(title="SmartShop AI Engine", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000", "http://127.0.0.1:5000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    reviews: List[str]
    productName: str = ""
    productPrice: float = 0.0
    averagePrice: float = 0.0


class SentimentRequest(BaseModel):
    reviews: List[str]


class FakeDetectionRequest(BaseModel):
    reviews: List[str]
    productName: str = ""


@app.on_event("startup")
async def startup():
    """Pre-load models and corpora on startup."""
    print("🐍 SmartShop AI Python Service starting...")
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
async def full_analysis(req: AnalyzeRequest):
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
async def sentiment_only(req: SentimentRequest):
    """Advanced sentiment analysis only."""
    return analyze_sentiment(req.reviews)


@app.post("/fake-detection")
async def fake_detection_only(req: FakeDetectionRequest):
    """Fake review detection only."""
    return detect_fake_reviews(req.reviews, req.productName)
