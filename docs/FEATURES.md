# Verified feature matrix

Audit date: 13 October 2026. “Verified” means exercised locally during this audit; it does not guarantee future third-party availability.

| Feature | Implementation path | Status | Test evidence | Screenshot | Limitations |
|---|---|---|---|---|---|
| Registration, login, current user | `server/routes/auth.js`, `client/src/context/AuthContext.jsx` | Verified working | Register/login/`/me` API flow completed against local MongoDB | Login is included without personal data | JWT is stored client-side; no refresh-token flow |
| Product search UI | `client/src/pages/Home.jsx`, `Results.jsx` | Verified working | React client and authenticated search flow loaded | `01-home.png`, `02-product-search.png` | Results depend on third-party pages |
| Amazon acquisition | `server/scrapers/amazon.js` | Verified working | 23 live results for “wireless headphones” | Search screenshot | Selector and access-control changes can break it |
| Daraz acquisition | `server/scrapers/daraz.js` | Verified working | 115 live results for “wireless headphones” | Search screenshot where selected | Price conversion is adapter-based |
| AliExpress acquisition | `server/scrapers/aliexpress.js` | Verified working | 104 live results for “wireless headphones” | Search screenshot where selected | Slow run; bot controls may intervene |
| eBay acquisition | `server/scrapers/ebay.js` | Implemented but failing live check | Zero results; `#gh-ac`/product selectors timed out | None | Current markup no longer matches adapter |
| Incremental SSE results | `server/controllers/productController.js` | Verified working | Browser search received incremental platform status/results | `02-product-search.png` | Connection interruption is reported as platform error |
| Search caching | `server/models/Search.js` | Verified working | Repeat per-user query loaded from MongoDB; TTL index is one hour | Not visually distinct | Cache is local to the configured database |
| Heuristic trust score and verdict | `server/ai/authenticityScorer.js`, `verdictEngine.js` | Verified working | Unit tests plus persisted 92/100 labelled demo fixture | `03-authenticity-analysis.png` | Risk heuristic, not counterfeit proof |
| Node review sentiment | `server/ai/sentimentAnalyzer.js` | Verified working | AFINN positive/negative unit test | Analysis screenshot | English lexicon; context and sarcasm limitations |
| Duplicate/relevance signals | `server/ai/cosineSimilarity.js` | Verified working | TF-IDF duplicate test | Analysis detail | Lexical similarity is not authorship attribution |
| Python enhanced analysis | `python-ai/` | Verified working | `/health` and `/analyze` completed; service tests pass | Analysis screenshot where enhanced data exists | Optional service; not model-trained here |
| Analysis history | `server/models/Analysis.js`, `client/src/pages/History.jsx` | Verified working | Saved integration analysis retrieved from history endpoint | `04-analysis-history.png` | User-scoped records only |
| Image identification/verification | `server/utils/geminiVision.js` | Implemented but untested | Route reports unavailable without provider key | `05-image-verification.png` shows UI only | Requires `OPENROUTER_API_KEY`; third-party output is probabilistic |
| Perceptual-hash logo prototype | `server/ai/logoDetector.js` | Implemented but untested/inactive | Source inspection only | None | Not wired to routes; reference provenance unknown |
| ONNX logo artifact | `logo_detection_model.onnx` | Not integrated | No runtime imports found | None | Inputs, labels, provenance, and evaluation unavailable |
| Browser extension | `extension/` | Partially implemented | Manifest and API task routes inspected; not loaded in Chrome | None | Manual installation; live browser flow unverified |
| Deployment configuration | `render.yaml`, `client/vercel.json` | Implemented but untested | Static configuration review | None | No live deployment was claimed or tested |

## User workflow

1. Register or sign in.
2. Enter a product query and choose marketplaces.
3. Compare streamed listings and platform statuses.
4. Open a listing for a trust analysis.
5. Review the factor scores, sentiment evidence, and recommendation.
6. Return to History to revisit a saved analysis.
