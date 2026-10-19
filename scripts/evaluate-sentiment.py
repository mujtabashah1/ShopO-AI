"""Evaluate frozen sentiment engines on UCI 331; never tune on this benchmark."""
import argparse
import hashlib
import importlib.metadata
import io
import json
import math
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python-ai"))
from services.sentiment_service import analyze_single_review, classify_sentiment, _vader
from textblob import TextBlob

URL = "https://archive.ics.uci.edu/static/public/331/sentiment+labelled+sentences.zip"
SHA256 = "afc26626d710899948693e1a61405dce197f57ffa719fa1130d346b4cc095343"


def metrics(expected, predicted):
    classes = ["negative", "positive"]
    matrix = {label: {p: 0 for p in classes + ["neutral"]} for label in classes}
    for truth, prediction in zip(expected, predicted):
        matrix[truth][prediction] += 1
    correct = sum(a == b for a, b in zip(expected, predicted))
    n = len(expected)
    accuracy = correct / n
    z = 1.96
    center = (accuracy + z * z / (2 * n)) / (1 + z * z / n)
    radius = z * math.sqrt(accuracy * (1 - accuracy) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    per_class = {}
    for label in classes:
        tp = matrix[label][label]
        fp = sum(matrix[other][label] for other in classes if other != label)
        fn = sum(matrix[label][other] for other in classes + ["neutral"] if other != label)
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        per_class[label] = {"precision": round(precision, 4), "recall": round(recall, 4),
                            "f1": round(2 * tp / (2 * tp + fp + fn), 4) if 2 * tp + fp + fn else 0}
    return {"samples": n, "accuracy": round(accuracy, 4),
            "accuracy_wilson_95": [round(center - radius, 4), round(center + radius, 4)],
            "macro_f1_binary_labels": round(sum(v["f1"] for v in per_class.values()) / 2, 4),
            "neutral_predictions": predicted.count("neutral"), "confusion_matrix": matrix, "per_class": per_class}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--archive", type=Path, default=ROOT / ".local/sentiment-labelled-sentences.zip")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/evaluation/sentiment-baseline.json")
    args = parser.parse_args()
    if args.download:
        args.archive.parent.mkdir(parents=True, exist_ok=True)
        args.archive.write_bytes(urllib.request.urlopen(URL, timeout=60).read())
    archive = args.archive.read_bytes()
    if hashlib.sha256(archive).hexdigest() != SHA256:
        raise ValueError("Dataset checksum changed; review provenance before evaluation")
    report = {"dataset": "UCI Sentiment Labelled Sentences (331)", "source": URL,
              "license": "CC BY 4.0", "author": "Dimitrios Kotzias", "sha256": SHA256,
              "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "protocol": "No training or threshold tuning. All source sentences evaluated once. Neutral predictions count as errors on binary labels. Macro F1 averages positive/negative labels only. Confidence intervals describe this benchmark, not deployment accuracy.",
              "versions": {name: importlib.metadata.version(name) for name in ["vaderSentiment", "textblob"]},
              "results": {}}
    node_code = "const fs=require('fs'); const {analyzeReview}=require('./server/ai/sentimentAnalyzer'); console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(t=>analyzeReview(t).label)));"
    with zipfile.ZipFile(io.BytesIO(archive)) as dataset:
        for domain in ["amazon_cells", "imdb", "yelp"]:
            filename = next(name for name in dataset.namelist() if name.endswith(f"/{domain}_labelled.txt") and not name.startswith("__MACOSX"))
            rows = [line.rstrip("\r").rsplit("\t", 1) for line in dataset.read(filename).decode("utf-8").split("\n") if line.strip()]
            if len(rows) != 1000 or any(label not in ["0", "1"] for _, label in rows):
                raise ValueError(f"Unexpected benchmark shape: {domain}")
            texts = [text for text, _ in rows]
            expected = ["positive" if label == "1" else "negative" for _, label in rows]
            node = json.loads(subprocess.check_output(["node", "-e", node_code], input=json.dumps(texts), cwd=ROOT, text=True, encoding="utf-8"))
            python = [analyze_single_review(text) for text in texts]
            predictions = {"node_afinn": node, "python_ensemble": [r["label"] for r in python],
                           "vader_reference": [classify_sentiment(_vader.polarity_scores(text)["compound"]) for text in texts],
                           "textblob_reference": [classify_sentiment(TextBlob(text).sentiment.polarity) for text in texts]}
            report["results"][domain] = {name: metrics(expected, pred) for name, pred in predictions.items()}
            print(domain, {name: result["accuracy"] for name, result in report["results"][domain].items()})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
