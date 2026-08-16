from app.services.achievements import compute_player_stats


def test_ties_only_are_never_defeats():
    # Two ties (winner=None) and nothing else: no wins, no losses recorded.
    games = [
        {"date": "2026-01-01T10:00:00Z", "mode": "Shanghai", "players": ["Alice", "Bob"], "winner": None},
        {"date": "2026-01-02T10:00:00Z", "mode": "Shanghai", "players": ["Alice", "Bob"], "winner": None},
    ]
    stats = compute_player_stats(games)
    for name in ("Alice", "Bob"):
        s = stats[name]
        assert s["games"] == 2
        assert s["wins"] == 0
        assert s["loss_streak"] == 0, "a tie must not increment the loss streak"
        assert s["max_loss_streak"] == 0, "a tie must never count as a defeat"


def test_tie_breaks_the_win_streak():
    # Win, then a tie: the tie is not a loss, but it ends the win streak.
    games = [
        {"date": "2026-01-01T10:00:00Z", "mode": "Cricket", "players": ["Alice", "Bob"], "winner": "Alice"},
        {"date": "2026-01-02T10:00:00Z", "mode": "Shanghai", "players": ["Alice", "Bob"], "winner": None},
    ]
    s = compute_player_stats(games)["Alice"]
    assert s["wins"] == 1
    assert s["cur_streak"] == 0, "a tie ends the current win streak"
    assert s["max_loss_streak"] == 0, "a tie is not a defeat for the winner of the previous game"


def test_real_loss_still_counts():
    games = [
        {"date": "2026-01-01T10:00:00Z", "mode": "Cricket", "players": ["Alice", "Bob"], "winner": "Alice"},
    ]
    s = compute_player_stats(games)["Bob"]
    assert s["loss_streak"] == 1
    assert s["max_loss_streak"] == 1


def _thomas_earners(games):
    from app.services.achievements import compute_achievements

    return compute_achievements(compute_player_stats(games))["thomas"]


def test_thomas_unlocked_above_1000_in_cut_throat():
    games = [
        {
            "date": "2026-01-01T10:00:00Z", "mode": "Cricket", "variant": "Cut Throat",
            "players": ["Alice", "Thomas"], "scores": [20, 1240], "winner": "Alice",
        },
    ]
    stats = compute_player_stats(games)
    assert stats["Thomas"]["max_cut_throat_score"] == 1240
    assert _thomas_earners(games) == ["Thomas"]


def test_thomas_matches_the_unspaced_variant_spelling():
    # L'historique contient les deux orthographes : 'Cut Throat' et 'CutThroat'.
    games = [
        {
            "date": "2026-01-01T10:00:00Z", "mode": "SuperCricket", "variant": "CutThroat",
            "players": ["Alice", "Thomas"], "scores": [40, 1001], "winner": "Alice",
        },
    ]
    assert _thomas_earners(games) == ["Thomas"]


def test_thomas_needs_strictly_more_than_1000():
    games = [
        {
            "date": "2026-01-01T10:00:00Z", "mode": "Cricket", "variant": "Cut Throat",
            "players": ["Alice", "Thomas"], "scores": [10, 1000], "winner": "Alice",
        },
    ]
    assert _thomas_earners(games) == []


def test_thomas_ignores_non_cut_throat_games():
    games = [
        {
            "date": "2026-01-01T10:00:00Z", "mode": "Cricket", "variant": "Normal",
            "players": ["Alice", "Thomas"], "scores": [1500, 2000], "winner": "Thomas",
        },
    ]
    assert _thomas_earners(games) == []


# ─── Nouveaux trophées « détenteur unique » (D2) ──────────────────────────────

def _mode_champ_ids(stats):
    from app.services.achievements import compute_achievements
    return compute_achievements(stats)


def test_mode_champion_and_score_records():
    """Champion de mode, record de score et score plancher : un seul détenteur
    chacun. Alice gagne le plus au Cricket ET marque le meilleur score ; Bob
    détient le plancher."""
    games = [
        {"date": "2026-01-01T10:00:00Z", "mode": "Cricket", "players": ["Alice", "Bob"],
         "scores": [120, 30], "winner": "Alice"},
        {"date": "2026-01-02T10:00:00Z", "mode": "Cricket", "players": ["Alice", "Bob"],
         "scores": [90, 40], "winner": "Alice"},
        {"date": "2026-01-03T10:00:00Z", "mode": "Cricket", "players": ["Alice", "Bob"],
         "scores": [50, 20], "winner": "Bob"},
    ]
    stats = compute_player_stats(games)
    earned = _mode_champ_ids(stats)

    # Alice : 2 victoires Cricket contre 1 → championne ; meilleur score (120).
    assert "Alice" in earned["cricket_champ"]
    assert "Bob" not in earned["cricket_champ"]
    assert "Alice" in earned["cricket_top_score"]

    # Bob : score le plus bas jamais marqué au Cricket (20).
    assert "Bob" in earned["cricket_low_score"]
    assert "Alice" not in earned["cricket_low_score"]


def test_mode_score_state_populated():
    """L'état mode_scores/mode_max_score/mode_min_score, absent du port avant
    D2, doit être renseigné."""
    games = [
        {"date": "2026-01-01T10:00:00Z", "mode": "Shanghai", "players": ["Alice", "Bob"],
         "scores": [80, 60], "winner": "Alice"},
    ]
    s = compute_player_stats(games)["Alice"]
    assert s["mode_scores"]["Shanghai"] == [80]
    assert s["mode_max_score"]["Shanghai"] == 80
    assert s["mode_min_score"]["Shanghai"] == 80
