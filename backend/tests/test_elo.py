from app.models.elo import GLOBAL_SCOPE
from app.services.elo import (
    EloConfig,
    expected_score,
    get_k_factor,
    performance_multiplier,
    rank_for_rating,
    recompute_elo,
)

CONFIG = EloConfig()  # defaults: starting 10000, convergence 4000, k=[800,400,300,200]/[5,10,15]


def test_expected_score_is_symmetric():
    a = expected_score(11000, 9000, 4000)
    b = expected_score(9000, 11000, 4000)
    assert round(a + b, 9) == 1.0
    assert a > 0.5  # higher-rated player is favored


def test_expected_score_equal_ratings_is_half():
    assert expected_score(10000, 10000, 4000) == 0.5


def test_get_k_factor_schedule():
    k_factors = (800.0, 400.0, 300.0, 200.0)
    thresholds = (5, 10, 15)
    assert get_k_factor(0, k_factors, thresholds) == 800
    assert get_k_factor(4, k_factors, thresholds) == 800
    assert get_k_factor(5, k_factors, thresholds) == 400
    assert get_k_factor(9, k_factors, thresholds) == 400
    assert get_k_factor(10, k_factors, thresholds) == 300
    assert get_k_factor(14, k_factors, thresholds) == 300
    assert get_k_factor(15, k_factors, thresholds) == 200
    assert get_k_factor(1000, k_factors, thresholds) == 200


def test_performance_multiplier_clamps_dominant_win():
    # Scored 4x the average — clamped to the max, not left to blow out further.
    mult = performance_multiplier(40, [40, 10, 10, 10], lower_is_better=False, clamp_min=0.5, clamp_max=2.0)
    assert mult == 2.0


def test_performance_multiplier_clamps_poor_result():
    mult = performance_multiplier(1, [1, 40, 40, 40], lower_is_better=False, clamp_min=0.5, clamp_max=2.0)
    assert mult == 0.5


def test_performance_multiplier_zero_average_is_neutral():
    mult = performance_multiplier(0, [0, 0, 0], lower_is_better=False, clamp_min=0.5, clamp_max=2.0)
    assert mult == 1.0


def test_performance_multiplier_lower_is_better_zero_score_is_max():
    # Scoring 0 in a Cut Throat game is the best possible outcome.
    mult = performance_multiplier(0, [0, 5, 10], lower_is_better=True, clamp_min=0.5, clamp_max=2.0)
    assert mult == 2.0


def test_performance_multiplier_lower_is_better_dominant_loss_clamps_min():
    mult = performance_multiplier(40, [40, 5, 5], lower_is_better=True, clamp_min=0.5, clamp_max=2.0)
    assert mult == 0.5


def test_recompute_elo_three_player_round_robin_preserves_rank_order():
    games = [{"id": "g1", "mode": "Cricket", "variant": None, "players": ["A", "B", "C"], "scores": [30, 20, 10]}]
    updates = recompute_elo(games, CONFIG)
    after = {u.player_name: u.elo_after for u in updates if u.scope == GLOBAL_SCOPE}
    assert after["A"] > after["B"] > after["C"]
    # round-robin: A beat 2 players, C lost to 2 — biggest mover each way.
    before = CONFIG.starting_rating
    assert after["A"] - before > after["B"] - before > after["C"] - before


def test_recompute_elo_emits_global_and_mode_scope_per_player():
    games = [{"id": "g1", "mode": "Cricket", "variant": None, "players": ["A", "B"], "scores": [20, 10]}]
    updates = recompute_elo(games, CONFIG)
    scopes_for_a = {u.scope for u in updates if u.player_name == "A"}
    assert scopes_for_a == {GLOBAL_SCOPE, "Cricket"}


def test_recompute_elo_tie_moves_nothing_when_ratings_equal():
    games = [{"id": "g1", "mode": "Shanghai", "variant": None, "players": ["A", "B"], "scores": [10, 10]}]
    updates = recompute_elo(games, CONFIG)
    for u in updates:
        assert u.delta == 0
        assert u.elo_after == u.elo_before


def test_recompute_elo_lower_is_better_variant_flips_winner():
    games = [{"id": "g1", "mode": "Cricket", "variant": "Cut Throat", "players": ["A", "B"], "scores": [5, 20]}]
    score_direction = {("cricket", "cutthroat"): True}
    updates = recompute_elo(games, CONFIG, score_direction)
    by_player = {u.player_name: u for u in updates if u.scope == GLOBAL_SCOPE}
    assert by_player["A"].delta > 0  # lower score (5) wins under Cut Throat
    assert by_player["B"].delta < 0


def test_recompute_elo_mode_without_direction_override_defaults_higher_is_better():
    games = [{"id": "g1", "mode": "Shanghai", "variant": None, "players": ["A", "B"], "scores": [5, 20]}]
    updates = recompute_elo(games, CONFIG, score_direction={("cricket", "cutthroat"): True})
    by_player = {u.player_name: u for u in updates if u.scope == GLOBAL_SCOPE}
    assert by_player["B"].delta > 0  # higher score (20) wins, no override for Shanghai


def test_recompute_elo_k_factor_decays_with_games_played():
    games = [{"id": "g1", "mode": "Cricket", "variant": None, "players": ["veteran", "rookie"], "scores": [20, 10]}]
    updates = recompute_elo(
        games,
        CONFIG,
        initial_games_played={"veteran": {GLOBAL_SCOPE: 15, "Cricket": 15}, "rookie": {GLOBAL_SCOPE: 0, "Cricket": 0}},
    )
    veteran_delta = next(u.delta for u in updates if u.player_name == "veteran" and u.scope == GLOBAL_SCOPE)
    rookie_delta = next(u.delta for u in updates if u.player_name == "rookie" and u.scope == GLOBAL_SCOPE)
    assert veteran_delta > 0  # veteran won
    assert abs(veteran_delta) < abs(rookie_delta)  # but K=200 vs K=800 moves them less


def test_recompute_elo_incremental_seed_matches_from_scratch():
    games = [
        {"id": "g1", "mode": "Cricket", "variant": None, "players": ["A", "B"], "scores": [20, 10]},
        {"id": "g2", "mode": "Cricket", "variant": None, "players": ["A", "B"], "scores": [20, 10]},
    ]
    from_scratch = recompute_elo(games, CONFIG)
    after_g1 = [u for u in from_scratch if u.game_id == "g1" and u.scope == GLOBAL_SCOPE]
    seed_ratings = {u.player_name: {GLOBAL_SCOPE: u.elo_after} for u in after_g1}
    seed_games_played = {u.player_name: {GLOBAL_SCOPE: 1} for u in after_g1}

    incremental = recompute_elo(
        [games[1]], CONFIG, initial_ratings=seed_ratings, initial_games_played=seed_games_played
    )
    expected = {u.player_name: u.elo_after for u in from_scratch if u.game_id == "g2" and u.scope == GLOBAL_SCOPE}
    actual = {u.player_name: u.elo_after for u in incremental if u.scope == GLOBAL_SCOPE}
    assert actual == expected


def test_rank_for_rating_bronze_and_silver_subranks():
    assert rank_for_rating(8999, CONFIG) == "Bronze"
    assert rank_for_rating(9000, CONFIG) == "Silver I"
    assert rank_for_rating(9399, CONFIG) == "Silver I"
    assert rank_for_rating(9400, CONFIG) == "Silver II"
    assert rank_for_rating(9800, CONFIG) == "Silver III"
    assert rank_for_rating(10199, CONFIG) == "Silver III"
    assert rank_for_rating(10200, CONFIG) == "Gold I"


def test_rank_for_rating_higher_tiers_and_champion_span():
    assert rank_for_rating(11400, CONFIG) == "Platinum I"
    assert rank_for_rating(12600, CONFIG) == "Diamond I"
    assert rank_for_rating(13800, CONFIG) == "Champion"  # 4*1200 above bronze_ceiling
    assert rank_for_rating(16799, CONFIG) == "Champion"  # champion span = 2.5*1200 = 3000
    assert rank_for_rating(16800, CONFIG) == "Grand Champion"
    assert rank_for_rating(99999, CONFIG) == "Grand Champion"  # uncapped


def test_rank_tiers_scale_with_admin_configured_values():
    custom = EloConfig(bronze_ceiling=1000, rank_tier_value=300, champion_multiplier=2.0)
    assert rank_for_rating(999, custom) == "Bronze"
    assert rank_for_rating(1000, custom) == "Silver I"
    assert rank_for_rating(1100, custom) == "Silver II"  # 300/3 = 100 per sub-rank
    assert rank_for_rating(1000 + 4 * 300, custom) == "Champion"
    assert rank_for_rating(1000 + 4 * 300 + 2 * 300, custom) == "Grand Champion"
