from konomi_api.catalog.blurb import MAX, pick, sentences

PREMISE = ("For centuries, humanity has been hunted by giant, mysterious predators known as the Titans. "
           "Three mighty walls have kept humanity safe behind them for over a hundred years. ")
S2 = PREMISE + "Forced to retreat behind Wall Rose, the survivors wait for the Titans to strike their safe haven again."
S3 = PREMISE + "The Survey Corps ride out to retake Wall Maria and finally reach the cellar in Shiganshina."


def test_each_season_gets_the_line_only_it_has():
    # The shared premise is a recap: each season's own sentence wins, so the two read differently.
    assert pick(S2, [S3]).startswith("Forced to retreat behind Wall Rose")
    assert pick(S3, [S2]).startswith("The Survey Corps ride out")


def test_a_title_with_no_other_seasons_skips_recap_openers():
    text = "Long ago, the world was split in two by a great war. A young courier carries a letter across the border."
    assert pick(text, []) == "A young courier carries a letter across the border."


def test_notes_and_lines_about_the_show_are_never_shown():
    assert pick("The second cour of the third season of One Punch Man.", ["Saitama trains hard every single day."]) is None
    text = "A new battle begins for Tanjiro and his comrades in the village.\n\n• The first episode runs 49 minutes long."
    assert sentences(text) == ["A new battle begins for Tanjiro and his comrades in the village."]
    assert pick(None, []) is None and pick("", []) is None


def test_long_lines_are_cut_at_a_word_and_have_no_em_dash():
    line = pick("Tanjiro meets the Hashira — " + "the strongest swordsmen of the corps, " * 8 + "at the village.", [])
    assert len(line) <= MAX and line.endswith("…") and "—" not in line and not line[:-1].endswith(" ")
