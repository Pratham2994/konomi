from konomi_api.catalog.blurb import MAX, excerpt, sentences

PREMISE = ("For centuries, humanity has been hunted by giant, mysterious predators known as the Titans. "
           "Three mighty walls have kept humanity safe behind them for over a hundred years. ")
S2 = PREMISE + "Forced to retreat behind Wall Rose, the survivors wait for the Titans to strike their safe haven again."
S3 = PREMISE + "The Survey Corps ride out to retake Wall Maria and finally reach the cellar in Shiganshina."


def test_a_later_season_starts_where_its_own_story_does():
    # The shared premise is a recap: each season begins at its own sentence, so the two read differently.
    assert excerpt(S2, [S3], first=False).startswith("Forced to retreat behind Wall Rose")
    assert excerpt(S3, [S2], first=False).startswith("The Survey Corps ride out")


def test_a_first_season_keeps_its_setup_and_reads_in_order():
    text = "Long ago, the world was split in two by a great war. A young courier carries a letter across the border."
    assert excerpt(text, []) == text
    assert excerpt(S2, [S3], first=True).startswith("For centuries, humanity")


def test_notes_and_lines_about_the_show_are_never_shown():
    assert excerpt("The second cour of the third season of One Punch Man.", ["Saitama trains hard every day."]) is None
    text = "A new battle begins for Tanjiro and his comrades in the village.\n\n• The first episode runs 49 minutes long."
    assert sentences(text) == ["A new battle begins for Tanjiro and his comrades in the village."]
    assert excerpt(None, []) is None and excerpt("", []) is None


def test_long_passages_stop_at_a_sentence_or_a_word_and_have_no_em_dash():
    s = "Tanjiro meets the Hashira — the strongest swordsmen of the whole corps at the village. "
    passage = excerpt(s * 6, [])
    assert len(passage) <= MAX and passage.endswith(".") and "—" not in passage
    one = excerpt("Tanjiro meets the Hashira, " + "the strongest swordsmen of the corps, " * 12 + "at last.", [])
    assert len(one) <= MAX and one.endswith("…")


def test_written_summaries_load_by_both_ids_and_follow_the_copy_rules():
    from konomi_api.catalog.blurb import written
    lines = written()
    assert len(lines) > 400
    assert lines["a16498"] == lines["m16498"]  # Attack on Titan, by AniList and by MAL id
    assert all(140 <= len(s) <= 240 and "—" not in s and "–" not in s for s in lines.values())
