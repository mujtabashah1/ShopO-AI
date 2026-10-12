# Project overview

ShopO-AI is our Final Year Project at FAST-NUCES Peshawar. We built it to reduce the manual work needed to compare the same type of product on different shopping sites.

The frontend is written in React. A Node and Express API handles login, marketplace searches, scoring, and MongoDB storage. Search results are sent to the browser as each marketplace finishes, so one slow or failed scraper does not hold back every result.

The product score uses price, seller rating, review count, and review sentiment. The project also checks for repeated review text with TF-IDF and cosine similarity. A separate FastAPI service can run VADER and TextBlob sentiment analysis and additional review checks.

This score is a project heuristic, not a tested counterfeit classifier. The repository does not contain a labelled counterfeit test set.

Developed by Syed Ahmad Mujtaba Shah and Muhammad Waseel under the supervision of Dr. Usman Wajid.
