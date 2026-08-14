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
