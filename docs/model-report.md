# Konomi taste model — evaluation report

Data: 14,085 anime; 263,739 training users (27,081,171 positive ratings); 14,653 held-out test users.
Positives = ratings ≥ the user's own mean. Each test user's positives: 80% shown to the model, 20% hidden; metrics measure how well the hidden ones are recovered (Recall/NDCG, higher is better).
Rating MAE: predict each test user's hidden ratings (1–10) from the model's rank, calibrated on validation users (lower is better).

| Model | Recall@20 | NDCG@20 | Recall@100 | NDCG@100 | Rating MAE |
|---|---|---|---|---|---|
| popularity | 0.1633 | 0.1576 | 0.3436 | 0.2217 | — |
| item-knn | 0.3263 | 0.3145 | 0.5501 | 0.3915 | — |
| ease | 0.4844 | 0.4799 | 0.6920 | 0.5487 | 0.9443 |
| ease-top200 | 0.4710 | 0.4678 | 0.6691 | 0.5334 | — |
| multvae | 0.4615 | 0.4452 | 0.6893 | 0.5253 | 0.9563 |
| user-mean (rating baseline) | — | — | — | — | 1.0988 |
| blend (Mult-VAE + EASE-top200, w=0.2) | 0.4828 | 0.4770 | 0.6990 | 0.5489 | — |

**Best single model: ease** — NDCG@20 is 3.0× the popularity baseline.
Mult-VAE always runs in serving: it gives the shared user/item taste space behind the galaxy, taste DNA, taste match and the content bridge. EASE joins it as a blend only when the blend wins (see below).

**Serving:** blend (w=0.2) — Mult-VAE + pruned EASE scores 0.4770 NDCG@20 on test users, +7% over Mult-VAE alone (0.4452) and within 1% of full EASE (0.4799), while still covering titles with no ratings through the bridge.

## Content bridge (anime without ratings)

25,717 catalogue titles have no ratings (mostly post-2020). A 1736-feature MLP (tags, studios, genres, type, year, length, MiniLM synopsis embedding) predicts where each sits in the taste space. On 10% held-out rated titles:

- mean cosine to the true vector: **0.802**
- top-10 neighbour overlap: **19.2%** (random vectors: 0.1%)

## Taste axes

1. Drama · Tragedy ↔ Kids · Music
2. Drama · Romance ↔ School · Comedy
3. Drama · Tragedy ↔ Ecchi · Female harem
4. Shounen · Action ↔ Cute girls doing cute things · Slice of life
5. Shoujo · Slice of life ↔ Action · Ecchi
6. Action · Science fiction ↔ Shoujo · Romance

## Score prediction

Predicting a held-out rating (1–10) for 310,284 test ratings:

| Method | MAE |
|---|---|
| user's own mean | 1.092 |
| served model rank, calibrated | 0.938 |
| rank + title quality (served) | **0.886** |

Title quality = a title's mean standardised rating among training users. Fitted on validation users: z = 0.66·rank + 0.69·quality + -0.04. Titles with no ratings estimate quality from their community score.
