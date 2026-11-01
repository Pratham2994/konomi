"""Plain names for the galaxy's neighbourhoods.

Clusters group anime by who watches them, not by genre, so tag-based labels misled ("Unrequited love" over
Attack on Titan and Jujutsu Kaisen). These names were chosen by reading each cluster's best-known titles, for one
model version. A retrained model gets new clusters; until it is named here, labels fall back to the cluster's
best-known title, which is always true.
"""

NAMES: dict[str, dict[int, str]] = {
    "202611011150": {
        0: "Classic ecchi rom-coms",
        1: "Newer titles, few ratings yet",
        2: "Long-running classics",
        3: "Harem action",
        4: "Old-school cult classics",
        5: "The biggest hits",
        6: "Moody and strange",
        7: "Airing now and recent",
        8: "Modern hits",
        9: "Supernatural romance",
        10: "All-time classics",
        11: "Fan-favourite sequels",
        12: "Isekai and game worlds",
        13: "Girls with guns and guitars",
        14: "Recent fantasy",
        15: "Franchise spin-offs",
        16: "Hit sequels",
        17: "Arthouse and literary",
        18: "Mecha and sci-fi",
        19: "Cute and cozy",
        20: "Big ongoing favourites",
        21: "Boys' love and shoujo",
        22: "Isekai power fantasies",
        23: "Fan-service comedies",
    },
}


def name_for(version: str, cluster: int, examples: list[str]) -> str:
    named = NAMES.get(str(version), {}).get(cluster)
    if named:
        return named
    return f"Near {examples[0]}" if examples else "Unnamed corner"


# The six Taste DNA sliders, named the same way: from the well-known titles at each end, not the tags.
# (low end, high end) per axis id.
AXES: dict[str, dict[int, tuple[str, str]]] = {
    "202611011150": {
        0: ("Dark, thoughtful drama", "Light seasonal fun"),
        1: ("Grown-up classics", "Light-novel fantasy"),
        2: ("Mature and artful", "Harem and fan-service"),
        3: ("Big shounen action", "Cute and slice of life"),
        4: ("Soft romance and shoujo", "Edgy fantasy"),
        5: ("Gritty seinen classics", "Pretty-boy supernatural"),
    },
}


def axis_names(version: str, axis: int) -> tuple[str, str] | None:
    return AXES.get(str(version), {}).get(axis)
