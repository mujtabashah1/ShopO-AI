import pathlib
import sys
import unittest

SERVICE_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from services.sentiment_service import analyze_sentiment, classify_sentiment
from services.fake_detection_service import detect_fake_reviews


class SentimentServiceTests(unittest.TestCase):
    def test_classification_thresholds(self):
        self.assertEqual(classify_sentiment(0.5), "positive")
        self.assertEqual(classify_sentiment(-0.5), "negative")
        self.assertEqual(classify_sentiment(0.0), "neutral")

    def test_ensemble_contract(self):
        result = analyze_sentiment([
            "Excellent headphones with clear sound and strong battery life.",
            "The item arrived broken and the sound is terrible.",
        ])
        self.assertEqual(result["totalReviews"], 2)
        self.assertEqual(sum(result["distribution"].values()), 100)
        self.assertIn(result["confidence"], {"low", "medium", "high"})


class FakeReviewServiceTests(unittest.TestCase):
    def test_duplicate_signal_is_reported(self):
        reviews = [
            "Excellent headphones with clear sound and strong battery life.",
            "Excellent headphones with clear sound and strong battery life.",
            "Packaging was ordinary, but the item works as described.",
        ]
        result = detect_fake_reviews(reviews, "Wireless Headphones")
        self.assertGreaterEqual(len(result["duplicatePairs"]), 1)


if __name__ == "__main__":
    unittest.main()
