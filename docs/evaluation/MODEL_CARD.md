# Model evaluation and permitted claims

## Measured sentiment performance

We evaluated the unchanged engines on all 3,000 labeled sentences in [UCI Sentiment Labelled Sentences, dataset 331](https://archive.ics.uci.edu/dataset/331/sentiment+labelled+sentences), credited to Dimitrios Kotzias and distributed under CC BY 4.0. Each domain has 500 positive and 500 negative labels. The source archive checksum, source commit, package versions, per-class precision/recall/F1, confusion matrices and Wilson 95% accuracy intervals are in [sentiment-baseline.json](sentiment-baseline.json).

| Benchmark domain | Active Node AFINN | Optional Python ensemble | VADER reference | TextBlob reference |
|---|---:|---:|---:|---:|
| Amazon cell-phone/accessory sentences | 55.9% | 67.9% | 68.6% | 57.5% |
| IMDb sentences | 57.8% | 68.9% | 67.7% | 60.4% |
| Yelp sentences | 55.2% | 65.4% | 63.4% | 58.4% |

These are exact-label accuracies. Neutral outputs count as errors because the benchmark has no neutral ground-truth class. Macro F1 averages the two ground-truth classes, with neutral predictions counted as false negatives. No rows were discarded, no model was trained, and no thresholds were adjusted against this benchmark. IMDb contains non-newline Unicode separators inside sentences; parsing uses the actual newline record delimiter.

The ensemble exceeds Node AFINN on these samples, but neither supports a high-accuracy product claim. These older, balanced English sentence samples do not represent current marketplace prevalence, full reviews, sarcasm, Urdu, mixed-language reviews, or neutral text. The classifiers may also share historical data or lexicons with public research; this is an external benchmark, not a guarantee of pristine training-data independence. Confidence intervals quantify sampling uncertainty within this benchmark, not deployment performance.

## What remains unverified

| Component | Status | Reason |
|---|---|---|
| Shopping confidence / Buy-Risky-Avoid | Unvalidated heuristic | No labeled product-outcome or authenticity evaluation set exists in the repository |
| Duplicate review detection | Regression-tested signal | Similar wording does not prove deception; no labeled genuine/fraud dataset was evaluated |
| Python fake-review percentage | Uncalibrated heuristic | The displayed percentage is a fraction flagged by rules, not a probability that reviews are fake |
| External vision provider | Not accuracy-validated | Requires provider access and a labeled, provenance-cleared image set; a product photo cannot establish physical authenticity |
| Local logo/ONNX research artifacts | Not active production models | No reproducible mapping of preprocessing, labels, evaluation split and ground truth has been established |

Do not advertise counterfeit-detection accuracy or interpret an engine score as a calibrated probability. Favorable sentiment measures opinion, not authenticity. Missing evidence must remain distinguishable from negative evidence.

## Reproduce

Install the server dependencies and Python requirements, then use the project's Python environment:

```powershell
.\python-ai\.venv\Scripts\python.exe scripts/evaluate-sentiment.py --download
```

On Linux/macOS use `python-ai/.venv/bin/python`. The archive stays in ignored `.local/`; raw sentences are not committed. The evaluator fails if the checksum or 1,000-row-per-domain shape changes. It writes aggregate metrics only. Run without `--download` to reuse the verified archive. Use `--output` for a new report so future model versions do not overwrite the original baseline.

Any future tuning must use separate development data and a newly reserved evaluation set. This benchmark is now seen and must not be used to both tune and claim an unbiased improvement.
