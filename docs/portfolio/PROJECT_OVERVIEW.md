# ShopO-AI portfolio overview

ShopO-AI is a full-stack price-intelligence and product-risk analysis platform created as a Final Year Project at FAST-NUCES Peshawar. It reduces the manual work of comparing marketplace listings by streaming results from Amazon, Daraz, AliExpress, and eBay adapters into a React interface, then storing searches and analyses in MongoDB.

The Express API combines a transparent four-factor trust score with AFINN sentiment and TF-IDF review-similarity signals. An optional FastAPI service adds VADER/TextBlob ensemble sentiment, linguistic fake-review indicators, summarization, and trustworthiness features. The project deliberately presents these outputs as risk signals: no labelled evaluation set supports a claim of reliable counterfeit detection.

Engineering highlights include authenticated and rate-limited APIs, per-user caching, Server-Sent Events, partial-failure handling across marketplace adapters, optional service degradation, a React/Recharts analysis experience, deterministic Node/Python test suites, and CI. The repository also contains an experimental browser extension and logo-analysis artifacts whose current integration and evidence boundaries are explicitly documented.

Developed by Syed Ahmad Mujtaba Shah and Muhammad Waseel under the supervision of Dr. Usman Wajid.
