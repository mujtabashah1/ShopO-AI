"""
Fake Review Detection Service
------------------------------
Detects potentially fake/manipulated reviews using:
1. TF-IDF + Cosine Similarity clustering (near-duplicate detection)
2. Linguistic features (length variance, vocab richness, exclamation frequency)
3. Generic content detection (template phrase matching)
4. Sentiment uniformity check
"""

import re
import math
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Common fake review template phrases
GENERIC_PHRASES = [
    "great product", "works well", "works great", "as described",
    "good quality", "nice product", "very good", "highly recommend",
    "love it", "perfect", "exactly what i needed", "fast shipping",
    "looks great", "very happy", "excellent product", "amazing product",
    "best product", "five stars", "5 stars", "recommend to everyone",
    "very satisfied", "worth the money", "just as described",
    "good value", "great value", "a must buy", "must have",
    "couldn't be happier", "totally worth it", "exceeded expectations",
]

SIMILARITY_THRESHOLD = 0.85


def detect_fake_reviews(reviews: list[str], product_name: str = "") -> dict:
    """Detect potentially fake reviews using multiple signals."""
    if not reviews or len(reviews) < 2:
        return {
            "fakePercentage": 0,
            "flaggedReviews": [],
            "duplicatePairs": [],
            "linguisticFlags": {},
            "overallAssessment": "Insufficient reviews for fake detection",
            "totalAnalyzed": len(reviews) if reviews else 0,
        }

    valid_reviews = [r.strip() for r in reviews if r and len(r.strip()) > 5]
    if len(valid_reviews) < 2:
        return {
            "fakePercentage": 0,
            "flaggedReviews": [],
            "duplicatePairs": [],
            "linguisticFlags": {},
            "overallAssessment": "Insufficient valid reviews",
            "totalAnalyzed": len(valid_reviews),
        }

    fake_scores = [0.0] * len(valid_reviews)  # Per-review fake score (0 to 1)
    reasons = [[] for _ in range(len(valid_reviews))]

    # ===== 1. TF-IDF Cosine Similarity (near-duplicate detection) =====
    duplicate_pairs = []
    try:
        vectorizer = TfidfVectorizer(stop_words="english", max_features=5000)
        tfidf_matrix = vectorizer.fit_transform(valid_reviews)
        sim_matrix = cosine_similarity(tfidf_matrix)

        for i in range(len(valid_reviews)):
            for j in range(i + 1, len(valid_reviews)):
                sim = sim_matrix[i][j]
                if sim >= SIMILARITY_THRESHOLD:
                    duplicate_pairs.append({
                        "reviewA": valid_reviews[i][:100],
                        "reviewB": valid_reviews[j][:100],
                        "similarity": round(float(sim), 3),
                    })
                    fake_scores[i] += 0.4
                    fake_scores[j] += 0.4
                    reasons[i].append(f"Near-duplicate with review #{j+1} ({sim:.0%} similar)")
                    reasons[j].append(f"Near-duplicate with review #{i+1} ({sim:.0%} similar)")
    except Exception:
        pass  # TF-IDF can fail with very short/empty texts

    # ===== 2. Linguistic Features =====
    lengths = [len(r) for r in valid_reviews]
    avg_length = sum(lengths) / len(lengths) if lengths else 0

    for i, review in enumerate(valid_reviews):
        text = review.strip()
        words = text.split()
        word_count = len(words)

        # Very short reviews
        if word_count <= 3:
            fake_scores[i] += 0.2
            reasons[i].append("Extremely short review")

        # Excessive exclamation marks
        excl_count = text.count("!")
        if excl_count >= 3:
            fake_scores[i] += 0.15
            reasons[i].append(f"Excessive exclamation marks ({excl_count})")

        # ALL CAPS ratio
        if word_count > 0:
            caps_words = sum(1 for w in words if w.isupper() and len(w) > 1)
            caps_ratio = caps_words / word_count
            if caps_ratio > 0.5:
                fake_scores[i] += 0.15
                reasons[i].append(f"High ALL CAPS ratio ({caps_ratio:.0%})")

        # Low vocabulary richness (type-token ratio)
        if word_count >= 5:
            unique_words = len(set(w.lower() for w in words))
            ttr = unique_words / word_count
            if ttr < 0.4:
                fake_scores[i] += 0.1
                reasons[i].append(f"Low vocabulary diversity ({ttr:.2f} TTR)")

    # ===== 3. Generic Content Detection =====
    for i, review in enumerate(valid_reviews):
        lower = review.lower().strip()
        generic_matches = sum(1 for phrase in GENERIC_PHRASES if phrase in lower)
        if generic_matches >= 2:
            fake_scores[i] += 0.25
            reasons[i].append(f"Contains {generic_matches} generic phrases")
        elif generic_matches == 1 and len(review) < 50:
            fake_scores[i] += 0.15
            reasons[i].append("Short review with generic phrasing")

    # ===== 4. Sentiment Uniformity =====
    # If 90%+ reviews are very positive with similar phrasing, flag the batch
    from services.sentiment_service import classify_sentiment, _vader

    sentiments = []
    for r in valid_reviews:
        score = _vader.polarity_scores(r)["compound"]
        sentiments.append(classify_sentiment(score))

    pos_ratio = sentiments.count("positive") / len(sentiments) if sentiments else 0
    if pos_ratio >= 0.9 and len(valid_reviews) >= 5:
        # Uniformly positive — add a small flag to all
        for i in range(len(valid_reviews)):
            if sentiments[i] == "positive":
                fake_scores[i] += 0.1
                reasons[i].append("Part of suspiciously uniform positive batch")

    # ===== Build Results =====
    flagged_reviews = []
    for i, score in enumerate(fake_scores):
        clamped = min(1.0, score)
        if clamped >= 0.3:
            flagged_reviews.append({
                "text": valid_reviews[i][:200],
                "fakeScore": round(clamped, 2),
                "reasons": reasons[i],
            })

    fake_count = sum(1 for s in fake_scores if s >= 0.3)
    fake_pct = round(fake_count / len(valid_reviews) * 100, 1) if valid_reviews else 0

    # Overall assessment
    if fake_pct >= 50:
        assessment = "High risk: majority of reviews show fake indicators"
    elif fake_pct >= 25:
        assessment = "Moderate risk: some reviews appear suspicious"
    elif fake_pct >= 10:
        assessment = "Low risk: a few reviews show minor fake indicators"
    else:
        assessment = "Reviews appear authentic"

    # Linguistic summary
    length_variance = (
        math.sqrt(sum((l - avg_length) ** 2 for l in lengths) / len(lengths))
        if lengths else 0
    )

    return {
        "fakePercentage": fake_pct,
        "flaggedReviews": flagged_reviews,
        "duplicatePairs": duplicate_pairs,
        "linguisticFlags": {
            "averageLength": round(avg_length, 1),
            "lengthVariance": round(length_variance, 1),
            "totalFlagged": fake_count,
        },
        "overallAssessment": assessment,
        "totalAnalyzed": len(valid_reviews),
    }
