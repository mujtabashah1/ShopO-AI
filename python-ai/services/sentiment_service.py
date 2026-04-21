"""
Advanced Sentiment Analysis Service
------------------------------------
Combines VADER and TextBlob for ensemble sentiment scoring.
More accurate than AFINN-165 alone.

- VADER: Rule-based, great for social media / review text
- TextBlob: Pattern-based, provides polarity + subjectivity
- Ensemble: Weighted average (VADER 50%, TextBlob 50%)
"""

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from textblob import TextBlob

_vader = SentimentIntensityAnalyzer()


def classify_sentiment(score: float) -> str:
    """Classify a -1 to 1 score into positive/neutral/negative."""
    if score > 0.1:
        return "positive"
    elif score < -0.1:
        return "negative"
    return "neutral"


def analyze_single_review(text: str) -> dict:
    """Analyze a single review with both VADER and TextBlob."""
    # VADER
    vader_scores = _vader.polarity_scores(text)
    vader_compound = vader_scores["compound"]  # -1 to 1

    # TextBlob
    blob = TextBlob(text)
    tb_polarity = blob.sentiment.polarity  # -1 to 1
    tb_subjectivity = blob.sentiment.subjectivity  # 0 to 1

    # Ensemble score
    ensemble = vader_compound * 0.5 + tb_polarity * 0.5

    return {
        "text": text[:200],
        "vader": {
            "compound": round(vader_compound, 3),
            "positive": round(vader_scores["pos"], 3),
            "neutral": round(vader_scores["neu"], 3),
            "negative": round(vader_scores["neg"], 3),
        },
        "textblob": {
            "polarity": round(tb_polarity, 3),
            "subjectivity": round(tb_subjectivity, 3),
        },
        "ensemble": round(ensemble, 3),
        "label": classify_sentiment(ensemble),
    }


def analyze_sentiment(reviews: list[str]) -> dict:
    """Analyze all reviews and return aggregated results."""
    if not reviews:
        return {
            "reviewScores": [],
            "distribution": {"positive": 33, "neutral": 34, "negative": 33},
            "averageEnsemble": 0.0,
            "averageSubjectivity": 0.0,
            "confidence": "low",
            "totalReviews": 0,
            "note": "No reviews available",
        }

    # Filter valid reviews
    valid_reviews = [r.strip() for r in reviews if r and len(r.strip()) > 5]
    if not valid_reviews:
        return {
            "reviewScores": [],
            "distribution": {"positive": 33, "neutral": 34, "negative": 33},
            "averageEnsemble": 0.0,
            "averageSubjectivity": 0.0,
            "confidence": "low",
            "totalReviews": 0,
            "note": "All reviews too short to analyze",
        }

    # Analyze each review
    results = [analyze_single_review(r) for r in valid_reviews]

    # Count sentiments
    pos = sum(1 for r in results if r["label"] == "positive")
    neu = sum(1 for r in results if r["label"] == "neutral")
    neg = sum(1 for r in results if r["label"] == "negative")
    total = len(results)

    # Calculate agreement between VADER and TextBlob
    agreements = 0
    for r in results:
        vader_label = classify_sentiment(r["vader"]["compound"])
        tb_label = classify_sentiment(r["textblob"]["polarity"])
        if vader_label == tb_label:
            agreements += 1

    agreement_pct = (agreements / total * 100) if total > 0 else 0
    if agreement_pct >= 80:
        confidence = "high"
    elif agreement_pct >= 60:
        confidence = "medium"
    else:
        confidence = "low"

    avg_ensemble = sum(r["ensemble"] for r in results) / total if total else 0
    avg_subjectivity = sum(r["textblob"]["subjectivity"] for r in results) / total if total else 0

    return {
        "reviewScores": results,
        "distribution": {
            "positive": round(pos / total * 100) if total else 33,
            "neutral": round(neu / total * 100) if total else 34,
            "negative": round(neg / total * 100) if total else 33,
        },
        "averageEnsemble": round(avg_ensemble, 3),
        "averageSubjectivity": round(avg_subjectivity, 3),
        "confidence": confidence,
        "agreementPercentage": round(agreement_pct, 1),
        "totalReviews": total,
    }
