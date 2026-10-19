import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from pydantic import ValidationError
from main import AnalyzeRequest, SentimentRequest


class RequestLimitTests(unittest.TestCase):
    def test_rejects_excessive_review_work(self):
        for reviews in [["review"] * 101, ["x" * 5001]]:
            with self.assertRaises(ValidationError):
                SentimentRequest(reviews=reviews)

    def test_rejects_invalid_prices(self):
        for price in [-1, float("inf"), float("nan")]:
            with self.assertRaises(ValidationError):
                AnalyzeRequest(reviews=[], productPrice=price)

    def test_accepts_missing_review_evidence(self):
        self.assertEqual(AnalyzeRequest(reviews=[]).reviews, [])
