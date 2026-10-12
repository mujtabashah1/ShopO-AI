# LinkedIn launch post

I built **ShopO-AI** to explore a practical question: how can a shopper compare marketplace prices and review evidence without treating an opaque “AI score” as fact?

The result is a full-stack price-intelligence and product-risk analysis platform. An authenticated React client streams listings from multiple marketplace adapters, compares normalized prices, and presents a clear factor-by-factor recommendation. The Express API stores searches and analyses in MongoDB, while an optional FastAPI service adds VADER/TextBlob sentiment and TF-IDF-based review signals.

What I implemented:

- multi-platform acquisition with incremental Server-Sent Events and isolated failures;
- a transparent four-factor score using price position, seller rating, review volume, and sentiment;
- duplicate/relevance review checks with TF-IDF and cosine similarity;
- saved analysis history, JWT authentication, rate limits, CI, and technical documentation;
- explicit separation between rule-based risk signals, classical NLP, external vision inference, and experimental logo artifacts.

One of the most valuable lessons was that reliability is part of the feature. Marketplace layouts change, optional AI services fail, and model outputs need evidence boundaries. I designed the flow to keep partial results useful and documented what the system can—and cannot—claim. During the latest local audit, Amazon, Daraz, and AliExpress returned results; eBay needs selector maintenance, and image inference remains credential-dependent.

ShopO-AI is our Final Year Project at FAST-NUCES Peshawar, developed with Muhammad Waseel under the supervision of Dr. Usman Wajid.

Code, architecture, methodology, test evidence, and real application screenshots:
https://github.com/mujtabashah1/ShopO-AI

#React #NodeJS #MongoDB #FastAPI #NLP #SoftwareEngineering #MachineLearning #FinalYearProject
