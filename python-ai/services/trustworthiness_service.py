"""
Trustworthiness Service
-----------------------
Combines outputs from all other services into an overall
trustworthiness assessment with score, risk factors, and recommendation.
"""


def calculate_trustworthiness(
    sentiment: dict,
    fake_detection: dict,
    summary: dict,
    product_price: float = 0,
    average_price: float = 0,
) -> dict:
    """Calculate overall trustworthiness score (0-100)."""

    scores = []
    risk_factors = []

    # 1. Sentiment confidence score (0-30)
    confidence = sentiment.get("confidence", "low")
    avg_ensemble = sentiment.get("averageEnsemble", 0)
    pos_pct = sentiment.get("distribution", {}).get("positive", 33)

    if confidence == "high" and pos_pct >= 60:
        sent_score = 30
    elif confidence == "high":
        sent_score = 22
    elif confidence == "medium" and pos_pct >= 50:
        sent_score = 20
    elif confidence == "medium":
        sent_score = 15
    else:
        sent_score = 10

    if pos_pct < 40:
        risk_factors.append(f"Only {pos_pct}% of reviews are positive")
    if confidence == "low":
        risk_factors.append("VADER and TextBlob disagree on sentiment (low confidence)")

    scores.append(("Sentiment Quality", sent_score, 30))

    # 2. Fake review score (0-35, inverted — higher fake % = lower score)
    fake_pct = fake_detection.get("fakePercentage", 0)

    if fake_pct <= 5:
        fake_score = 35
    elif fake_pct <= 15:
        fake_score = 28
    elif fake_pct <= 30:
        fake_score = 18
    elif fake_pct <= 50:
        fake_score = 10
    else:
        fake_score = 3

    if fake_pct >= 25:
        risk_factors.append(f"{fake_pct}% of reviews flagged as potentially fake")
    if len(fake_detection.get("duplicatePairs", [])) >= 2:
        risk_factors.append(
            f"{len(fake_detection['duplicatePairs'])} near-duplicate review pairs detected"
        )

    scores.append(("Review Authenticity", fake_score, 35))

    # 3. Review volume score (0-15)
    total_reviews = sentiment.get("totalReviews", 0)

    if total_reviews >= 10:
        vol_score = 15
    elif total_reviews >= 5:
        vol_score = 10
    elif total_reviews >= 2:
        vol_score = 6
    else:
        vol_score = 2
        risk_factors.append("Very few reviews available for analysis")

    scores.append(("Review Volume", vol_score, 15))

    # 4. Price reasonableness (0-20)
    if average_price > 0 and product_price > 0:
        ratio = product_price / average_price
        if 0.6 <= ratio <= 1.3:
            price_score = 20
        elif 0.4 <= ratio < 0.6:
            price_score = 12
            risk_factors.append(
                f"Price is {round((1-ratio)*100)}% below average"
            )
        elif ratio < 0.4:
            price_score = 4
            risk_factors.append(
                f"Price is suspiciously low ({round((1-ratio)*100)}% below average)"
            )
        else:
            price_score = 15  # Overpriced but not fake
    else:
        price_score = 10  # No data

    scores.append(("Price Analysis", price_score, 20))

    # Total score
    trust_score = sum(s for _, s, _ in scores)
    max_score = sum(m for _, _, m in scores)
    normalized = round(trust_score / max_score * 100) if max_score else 50

    # Recommendation
    if normalized >= 75:
        recommendation = "This product appears trustworthy. Reviews are genuine and sentiment is positive."
    elif normalized >= 50:
        recommendation = "Exercise caution. Some indicators suggest potential issues with review authenticity or sentiment."
    elif normalized >= 30:
        recommendation = "Multiple warning signs detected. Review authenticity is questionable and sentiment patterns are unusual."
    else:
        recommendation = "High risk. Strong indicators of fake reviews and manipulated ratings. Avoid this product."

    return {
        "trustScore": normalized,
        "maxScore": 100,
        "breakdown": [
            {"factor": name, "score": score, "max": mx}
            for name, score, mx in scores
        ],
        "riskFactors": risk_factors,
        "recommendation": recommendation,
    }
