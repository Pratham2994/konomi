from konomi_api.rating.score import BANDS, DuelRec, fit_scores, strength
from konomi_api.rating.select import insertion_bounds, next_session_question, uncertainty


def test_no_duels_sits_mid_band():
    tiers = {1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 5, 7: 3}
    s = fit_scores(tiers, [])
    for aid, t in tiers.items():
        lo, hi = BANDS[t]
        assert lo <= s[aid] <= hi, (aid, t, s[aid])


def test_duel_order_respected():
    tiers = {1: 4, 2: 4, 3: 4}
    duels = [DuelRec(2, 1, "a"), DuelRec(1, 3, "a"), DuelRec(2, 3, "a")]  # 2 > 1 > 3
    s = fit_scores(tiers, duels)
    assert s[2] > s[1] > s[3]


def test_single_item_midband():
    assert fit_scores({1: 5}, [])[1] == 9.5


def test_one_win_spreads_inside_the_band():
    s = fit_scores({1: 4, 2: 4}, [DuelRec(1, 2, "a")])
    assert 8.0 <= s[2] < s[1] <= 8.9


def test_all_loved_stays_in_band():
    s = fit_scores({i: 4 for i in range(20)}, [])
    assert all(8.0 <= v <= 8.9 for v in s.values())


def test_tie_keeps_close():
    s = fit_scores({1: 3, 2: 3, 3: 3}, [DuelRec(1, 2, "tie"), DuelRec(1, 3, "a"), DuelRec(2, 3, "a")])
    assert s[3] < s[1] and s[3] < s[2]


def test_one_win_does_not_cross_a_band():
    # A "liked" title that beats one "loved" title moves up, but one answer is not enough to change its band.
    s = fit_scores({0: 3, 1: 4, 2: 4, 3: 4}, [DuelRec(0, 1, "a")])
    assert fit_scores({0: 3}, [])[0] < s[0] < 8.0


def test_consistent_wins_cross_a_band():
    # Beating every "loved" title it meets is enough: comparisons decide, the first feeling only starts it.
    s = fit_scores({0: 3, 1: 4, 2: 4, 3: 4}, [DuelRec(0, 1, "a"), DuelRec(0, 2, "a"), DuelRec(0, 3, "a")])
    assert s[0] >= 8.0


def test_in_between_starts_on_the_edge():
    s = fit_scores({1: 4, 2: 4, 3: 3}, [], between={1})
    assert s[3] < s[1] < s[2]
    assert 7.8 <= s[1] <= 8.1


def test_guess_orders_uncompared_titles_inside_their_band():
    s = fit_scores({1: 3, 2: 3}, [], guess={1: 7.8, 2: 6.6})
    assert 6.5 <= s[2] < s[1] <= 7.9


def test_insertion_le_6_duels():
    ranked = list(range(60))  # worst..best
    target_pos = 37
    lo, hi, n = 0, len(ranked), 0
    while True:
        b = insertion_bounds(lo, hi)
        if b is None:
            break
        mid = b
        n += 1
        if target_pos > mid:  # new item beats ranked[mid]
            lo = mid + 1
        else:
            hi = mid
    assert n <= 6


def _session(tiers, truth, questions):
    """Answer the session's duels from a hidden true order; returns the duels asked."""
    duels = []
    for _ in range(questions):
        q = next_session_question(tiers, duels, [], [], strength(tiers, duels))
        if q is None or q["kind"] != "duel":
            break
        duels.append(DuelRec(q["a"], q["b"], "a" if truth[q["a"]] > truth[q["b"]] else "b"))
    return duels


def _tau(truth, s, ids):
    pairs = [(i, j) for k, i in enumerate(ids) for j in ids[k + 1:]]
    return sum(1 if (truth[i] - truth[j]) * (s[i] - s[j]) > 0 else -1 for i, j in pairs) / len(pairs)


def test_questions_reach_the_bottom_of_the_chart():
    # Ten favourites and ten didn't-likes, nothing compared yet: the first questions go to both, not the top first.
    tiers = {i: 5 if i < 10 else 1 for i in range(20)}
    duels = _session(tiers, {i: -i for i in tiers}, 10)
    bottom = sum(1 for d in duels if d.a >= 10)
    assert len(duels) == 10 and 3 <= bottom <= 7, bottom


def test_whole_chart_gets_ordered_from_answers():
    # A hidden true order over three feelings, three answers per title: the bottom half ends as well ordered as
    # the top half.
    truth = {i: 30 - i for i in range(30)}
    tiers = {i: 4 if i < 10 else 3 if i < 20 else 1 for i in range(30)}
    s = strength(tiers, _session(tiers, truth, 90))
    order = sorted(truth, key=lambda i: -truth[i])
    assert _tau(truth, s, order[:15]) > 0.8 and _tau(truth, s, order[15:]) > 0.8


def test_no_pointless_or_repeated_duels():
    # A favourite and a didn't-like: the answer is certain, so nothing is asked.
    assert next_session_question({1: 5, 2: 1}, [], [], []) is None
    # Two loved titles: asked once, never again.
    assert next_session_question({1: 4, 2: 4}, [], [], [])["kind"] == "duel"
    assert next_session_question({1: 4, 2: 4}, [DuelRec(1, 2, "a")], [], []) is None
    assert next_session_question({1: 4, 2: 4}, [DuelRec(1, 2, "a")], [], [1]) == {"kind": "facets", "anime_id": 1}


def test_band_edge_pairs_are_asked():
    # A liked title beat two loved ones and a loved title lost twice: both now sit at the band edge, and the next
    # question is across it, a loved title against a liked one.
    tiers = {0: 3, 1: 4, 2: 4, 3: 4, 4: 3, 5: 3}
    duels = [DuelRec(0, 1, "a"), DuelRec(0, 2, "a"), DuelRec(1, 2, "a"), DuelRec(4, 5, "a"), DuelRec(3, 1, "a")]
    q = next_session_question(tiers, duels, [], [], strength(tiers, duels))
    assert q["kind"] == "duel" and {tiers[q["a"]], tiers[q["b"]]} == {3, 4}, q


def test_titles_with_fewer_comparisons_are_less_certain():
    tiers, duels = {1: 4, 2: 4, 3: 4}, [DuelRec(1, 2, "a")] * 3
    v = uncertainty(tiers, duels, strength(tiers, duels))
    assert v[3] > v[1] and v[3] > v[2]
