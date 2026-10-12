# LinkedIn post draft

I have completed ShopO-AI, our Final Year Project at FAST-NUCES Peshawar.

ShopO-AI lets a user search for a product on multiple shopping sites and compare the returned listings in one place. A user can also open a product analysis that shows how price, seller rating, review count, and review sentiment contributed to the result.

We used React for the frontend, Node and Express for the API, MongoDB for storage, and FastAPI for additional review analysis. The review code includes AFINN, VADER, TextBlob, and TF-IDF cosine similarity.

Each marketplace can change independently, which is one of the main problems we faced while working on the scrapers. The API reports results per platform so a failed adapter does not discard successful results. In our latest local check, Amazon, Daraz, and AliExpress returned products. The eBay adapter needs updated selectors.

The product score is kept easy to inspect. It is a rule-based risk estimate rather than a trained or validated counterfeit detector.

The repository contains the source code, setup steps, tests, screenshots, architecture notes, and current limitations:

https://github.com/mujtabashah1/ShopO-AI

Developed by Syed Ahmad Mujtaba Shah and Muhammad Waseel under the supervision of Dr. Usman Wajid.

#FinalYearProject #React #NodeJS #MongoDB #FastAPI
