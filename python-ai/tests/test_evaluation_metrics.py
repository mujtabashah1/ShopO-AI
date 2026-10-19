import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "scripts"))
# The CLI's hyphenated name is intentionally loaded by path.
import importlib.util
spec = importlib.util.spec_from_file_location("evaluation", pathlib.Path(__file__).resolve().parents[2] / "scripts/evaluate-sentiment.py")
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


class EvaluationMetricsTests(unittest.TestCase):
    def test_neutral_predictions_count_as_errors(self):
        result = evaluation.metrics(["positive", "negative", "negative"], ["positive", "neutral", "positive"])
        self.assertEqual(result["accuracy"], 0.3333)
        self.assertEqual(result["neutral_predictions"], 1)
        self.assertEqual(result["per_class"]["negative"]["recall"], 0)
        self.assertEqual(result["confusion_matrix"]["negative"]["neutral"], 1)

    def test_perfect_predictions_have_finite_interval(self):
        result = evaluation.metrics(["positive", "negative"], ["positive", "negative"])
        self.assertEqual(result["accuracy"], 1)
        self.assertEqual(result["macro_f1_binary_labels"], 1)
        self.assertLess(result["accuracy_wilson_95"][0], 1)
        self.assertEqual(result["accuracy_wilson_95"][1], 1)
