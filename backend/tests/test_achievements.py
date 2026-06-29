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
