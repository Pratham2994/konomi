import numpy as np

from konomi_api.taste import rerank
from konomi_api.taste.rerank import (genre_affinity, genre_bits, genre_score, mmr, near_liked, popularity_prior,
                                     reason_text, summary_text)


def test_genre_bits_keep_only_plain_genres():
    assert genre_bits(["Action", "Hentai", "Avant Garde"]) == 1 << rerank.GENRE_BIT["action"]
    assert genre_bits(None) == 0


def test_loved_genres_outrank_ones_rated_low():
    act, com = genre_bits(["Action", "Adventure"]), genre_bits(["Comedy"])
    bits = np.array([act, act, act, com, com], dtype=np.uint32)
    aff, n = genre_affinity(bits, np.array([1.1, 1.0, 0.8, -0.3, 0.1], dtype=np.float32))
    a, c = rerank.GENRE_BIT["action"], rerank.GENRE_BIT["comedy"]
    assert aff[a] > 0.5 > aff[c] and n[a] == 3
    s = genre_score(np.array([act, com, 0], dtype=np.uint32), aff)
    assert s[0] > s[1] and s[2] == 0


def test_like_naruto_and_one_piece_gets_bleach():
    # Two loved shounen titles; the candidate closest to both wins the liked-neighbour score.
    likes = np.array([[1, 0.1, 0], [0.9, 0.3, 0]], dtype=np.float32)
    cands = np.array([[0.95, 0.2, 0], [0, 1, 0], [0, 0, 1]], dtype=np.float32)
    likes /= np.linalg.norm(likes, axis=1, keepdims=True)
    cands /= np.linalg.norm(cands, axis=1, keepdims=True)
    n = near_liked(cands @ likes.T, np.array([1.1, 1.0], dtype=np.float32))
    assert int(np.argmax(n)) == 0


def test_mmr_mixes_kinds_and_caps_sequels():
    u = np.array([[1, 0], [0.99, 0.14], [0.98, 0.2], [0, 1], [-1, 0]], dtype=np.float32)
    u /= np.linalg.norm(u, axis=1, keepdims=True)
    bits = np.array([1, 1, 1, 2, 4], dtype=np.uint32)
    picked = mmr(np.array([1.0, 0.98, 0.97, 0.9, 0.0]), u, bits, k=2)
    assert picked == [0, 3]  # the near copy of the first pick waits for a different kind of show
    capped = np.array([True, True, True, False, False])
    assert mmr(np.array([1.0, 0.9, 0.8, 0.1, 0.0]), np.eye(5, dtype=np.float32), bits, k=3, lam=0,
               capped=capped, cap=1) == [0, 3, 4]


def test_popularity_prior_judges_new_titles_within_their_year():
    pop = np.array([1_000_000] * 30 + [50_000] * 29 + [60_000], dtype=np.float64)
    year = np.array([2008] * 30 + [2024] * 30)
    p = popularity_prior(pop, year)
    assert p[-1] > 0  # the 2024 hit is a hit, though older titles have more watchers


def test_reasons_are_plain_sentences():
    texts = [
        reason_text("similar", ["Naruto", "One Piece"], ["loved", "loved"], []),
        reason_text("similar", ["Naruto", "One Piece"], ["loved", "liked"], []),
        reason_text("genre", [], [], ["Action", "Adventure"], fan=True),
        reason_text("sequel", ["Mob Psycho 100"], ["loved"], []),
        reason_text("side", ["Demon Slayer"], ["liked"], [], rec_type="MOVIE"),
        reason_text("taste", [], [], []),
        reason_text("popular", [], [], []),
    ]
    assert texts[0] == "Because you loved Naruto and One Piece"
    assert texts[1] == "Because you loved Naruto and liked One Piece"
    assert texts[2] == "A fan favourite in Action and Adventure, which you rate highly"
    assert texts[3] == "Next season of Mob Psycho 100, which you loved"
    assert texts[4] == "A film from Demon Slayer, which you liked"
    assert all("—" not in t and "–" not in t for t in texts)
    assert summary_text(["A", "B", "C"], ["loved", "loved", "liked"]) == "Mostly because you liked A, B and C"
    assert summary_text([], []) is None
