"""
Review Summarization Service
-----------------------------
Extractive summarization: groups reviews by sentiment and extracts
key themes, praises, and complaints. No heavy transformer models.
"""

from textblob import TextBlob
import re
from collections import Counter


def _extract_noun_phrases(text: str) -> list[str]:
    """Extract noun phrases from text using TextBlob."""
    try:
        blob = TextBlob(text)
        return [str(np).lower() for np in blob.noun_phrases if len(str(np)) > 2]
    except Exception:
        return []


def _get_key_phrases(reviews: list[str], top_n: int = 5) -> list[str]:
    """Extract the most common noun phrases from a set of reviews."""
    all_phrases = []
    for r in reviews:
        all_phrases.extend(_extract_noun_phrases(r))
    counter = Counter(all_phrases)
    return [phrase for phrase, _ in counter.most_common(top_n)]


def _pick_representative(reviews: list[str], max_sentences: int = 3) -> str:
    """Pick the most representative sentences from reviews."""
    if not reviews:
        return ""

    # Collect all sentences
    all_sentences = []
    for r in reviews:
        blob = TextBlob(r)
        for sent in blob.sentences:
            s = str(sent).strip()
            if 15 < len(s) < 300:
                all_sentences.append(s)

    if not all_sentences:
        # Fallback: use first few reviews directly
        return " ".join(r[:150] for r in reviews[:max_sentences])

    # Score sentences by word overlap with other sentences (TextRank-lite)
    word_sets = [set(s.lower().split()) for s in all_sentences]
    scores = []
    for i, ws in enumerate(word_sets):
        score = 0
        for j, other_ws in enumerate(word_sets):
            if i != j and len(ws | other_ws) > 0:
                score += len(ws & other_ws) / len(ws | other_ws)
        scores.append(score)

    # Pick top sentences
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    selected = []
    seen_content = set()
    for idx in ranked:
        if len(selected) >= max_sentences:
            break
        sent = all_sentences[idx]
        # Avoid near-duplicate sentences
        key = sent.lower()[:50]
        if key not in seen_content:
            selected.append(sent)
            seen_content.add(key)

    return " ".join(selected)


def summarize_reviews(reviews: list[str], sentiment_data: dict = None) -> dict:
    """Summarize reviews by grouping into positive/negative and extracting themes."""
    if not reviews:
        return {
            "positiveSummary": "No reviews available.",
            "negativeSummary": "No reviews available.",
            "keyPraises": [],
            "keyComplaints": [],
            "overallSummary": "Insufficient data for summarization.",
        }

    valid_reviews = [r.strip() for r in reviews if r and len(r.strip()) > 10]
    if not valid_reviews:
        return {
            "positiveSummary": "No substantive reviews found.",
            "negativeSummary": "No substantive reviews found.",
            "keyPraises": [],
            "keyComplaints": [],
            "overallSummary": "Reviews too short to summarize.",
        }

    # Classify reviews by sentiment
    positive_reviews = []
    negative_reviews = []
    neutral_reviews = []

    for r in valid_reviews:
        blob = TextBlob(r)
        polarity = blob.sentiment.polarity
        if polarity > 0.1:
            positive_reviews.append(r)
        elif polarity < -0.1:
            negative_reviews.append(r)
        else:
            neutral_reviews.append(r)

    # Generate summaries
    pos_summary = _pick_representative(positive_reviews, 3) if positive_reviews else "No positive reviews found."
    neg_summary = _pick_representative(negative_reviews, 3) if negative_reviews else "No negative reviews found."

    # Extract key themes
    key_praises = _get_key_phrases(positive_reviews, 5) if positive_reviews else []
    key_complaints = _get_key_phrases(negative_reviews, 5) if negative_reviews else []

    # Overall summary
    total = len(valid_reviews)
    pos_pct = round(len(positive_reviews) / total * 100) if total else 0
    neg_pct = round(len(negative_reviews) / total * 100) if total else 0

    if pos_pct >= 70:
        overall = f"Overwhelmingly positive reviews ({pos_pct}% positive). Buyers are generally satisfied."
    elif pos_pct >= 50:
        overall = f"Mostly positive reviews ({pos_pct}% positive, {neg_pct}% negative). Some mixed opinions."
    elif neg_pct >= 50:
        overall = f"Mostly negative reviews ({neg_pct}% negative). Significant buyer dissatisfaction."
    else:
        overall = f"Mixed reviews ({pos_pct}% positive, {neg_pct}% negative, {100-pos_pct-neg_pct}% neutral)."

    return {
        "positiveSummary": pos_summary,
        "negativeSummary": neg_summary,
        "keyPraises": key_praises,
        "keyComplaints": key_complaints,
        "overallSummary": overall,
        "reviewCounts": {
            "positive": len(positive_reviews),
            "negative": len(negative_reviews),
            "neutral": len(neutral_reviews),
        },
    }
