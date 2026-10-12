# Known limitations

- The trust score is a hand-authored risk heuristic with no labelled counterfeit evaluation.
- eBay’s current page structure did not match the implemented selectors during the audit.
- Scrapers depend on third-party HTML and access policies; partial failures are expected and isolated.
- Currency normalization is not backed by a live exchange-rate source.
- Review sentiment is strongest for straightforward English and can misread context, sarcasm, or mixed languages.
- Image verification requires an OpenRouter key and sends requested images to that provider.
- The perceptual-hash logo detector and ONNX artifact are not connected to the running API.
- The ONNX model lacks documented labels, preprocessing, provenance, and metrics. The `.pth` file under `logo-detection/Model` is HTML, not a usable checkpoint.
- Logo reference-image provenance and redistribution rights are undocumented.
- The browser extension has not received an end-to-end automated test and requires manual installation.
- The application has no password reset, email verification, refresh tokens, admin console, or production observability.
- No project-level licence file is present.

## Roadmap

1. Repair eBay extraction with sanitized DOM fixtures and selector regression tests.
2. Replace adapter-specific currency constants with a cached, attributed exchange-rate service.
3. Build a provenance-cleared labelled evaluation set and publish a reproducible model card.
4. Define and integrate the ONNX model only after documenting preprocessing, labels, licensing, and benchmark results.
5. Add provider-independent image tests and explicit consent copy for external vision calls.
6. Add Playwright smoke coverage against mock marketplace fixtures.
7. Add password recovery, refresh-token rotation, structured logs, and production monitoring.
