# AI and scoring methodology

## Active systems

| System | Type | Input | Output | Runtime |
|---|---|---|---|---|
| Marketplace trust score | Rule engine | Price, comparison average, seller rating, review count, sentiment distribution | 0–100 score, four-factor breakdown, verdict | Node API |
| Review sentiment | Lexicon-based | Review text | Positive/neutral/negative labels and distribution | Node API, AFINN |
| Enhanced sentiment | Lexicon/pattern ensemble | Review text | VADER and TextBlob values, average ensemble, agreement confidence | Optional FastAPI |
| Duplicate and relevance analysis | Classical NLP | Reviews and product name | TF-IDF cosine similarities and flags | Node and FastAPI |
| Fake-review indicators | Rules + classical NLP | Review batch | Duplicate pairs, linguistic flags, suspicious percentage | Optional FastAPI |
| Image verification | Third-party multimodal inference | Image bytes/URL and prompt | Provider-generated brand/verdict/confidence | OpenRouter, optional |
| Logo reference matcher | Perceptual hash rules | Uploaded image and local reference set | Nearest brand/reference and heuristic verdict | Prototype, inactive |
| ONNX artifact | Unknown exported model | Undocumented | Undocumented | Inactive |

## Trust score

The four factors are capped at 25 points. Price scoring rewards a price near 60–120% of the comparison average and penalizes extreme discounts. Seller rating, review volume, and positive sentiment use fixed bands. Near-duplicate reviews above cosine similarity 0.85 can subtract up to five points. Thresholds are explicit in `server/ai/authenticityScorer.js` and `server/ai/verdictEngine.js`.

This is a rules engine. It has not been calibrated against labelled counterfeit products and cannot establish that an item is genuine.

## Text preprocessing and inference

The Node baseline lowercases review documents before Natural builds TF-IDF vectors. Its AFINN package tokenizes and scores English sentiment words; raw scores above 1 are positive and below -1 are negative.

FastAPI filters blank or very short reviews. VADER compound polarity and TextBlob polarity are averaged with equal weight. Values above 0.1 are positive and below -0.1 are negative. Agreement between the two classifiers determines a low/medium/high consistency label. Fake-review analysis combines TF-IDF similarity with length, punctuation, capitalization, vocabulary diversity, generic phrases, and batch sentiment uniformity.

## Vision and logo distinction

Product-logo classification asks “which brand does this image resemble?” Product-authenticity prediction asks whether a particular item is genuine. They require different labelled data and evaluation. The local logo matcher compares perceptual hashes to reference images, so even if activated it would measure visual similarity, not manufacturing authenticity.

The active image endpoints instead call a configurable external vision model. The returned verdict is provider-generated and must be treated as advisory. During the audit, the route could not be exercised because no API key was configured.

## Artifacts and provenance

`logo_detection_model.onnx` is approximately 0.92 MiB and is not imported by application code. Its preprocessing, label map, dataset split, training parameters, and metrics are absent. `logo-detection/Model/logo_detection_model.pth` is an HTML document rather than a valid PyTorch checkpoint. The image reference folders and notebook are present, but their dataset provenance and redistribution rights are undocumented.

## Evaluation

**Not independently evaluated.** No labelled ground-truth test set, confusion matrix, precision/recall result, or reproducible model card was found. Unit tests verify software contracts and deterministic thresholds; they do not measure real-world authenticity accuracy.

A defensible evaluation should freeze a provenance-cleared dataset, separate training/validation/test products and sellers, define counterfeit ground truth, compare rule-only and text-enhanced baselines, report per-class precision/recall/F1 with confidence intervals, and document geographic/language bias and error analysis.

## Limitations and bias

English lexicons underperform on sarcasm, multilingual text, and domain-specific usage. Review-count and seller-rating rules may disadvantage new sellers. Scraped reviews can be incomplete. Low price can indicate a sale rather than fraud. Similar phrasing can be legitimate boilerplate. Vision models can hallucinate brand details and should never be the sole purchase decision.
