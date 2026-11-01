from konomi_api.rating.score import BANDS, DuelRec, fit_scores
from konomi_api.rating.select import insertion_bounds


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
