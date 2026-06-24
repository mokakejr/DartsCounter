import argparse
import json


def load_game_history(file):
    """
    Loads game history from a JSON file, sorts games by date, and normalizes player scores.
    Args:
        file (str): Path to the JSON file containing game history.
    Returns:
        list: A list of game dictionaries, sorted by date.
    """
    with open(file, "r", encoding="utf-8") as f:
        game_history = json.load(f)
        game_history.sort(key=lambda g: g["date"])
        for game in game_history:
            paired = sorted(zip(game["players"], game["scores"]), key=lambda x: x[1])
            game["players"], game["scores"] = zip(*paired)
            game["players"] = list(game["players"])
            game["scores"] = list(game["scores"])
        return game_history


def load_game_modes(game_history):
    """
    Extracts all unique game modes from the game history.
    Args:
        game_history (list): A list of game dictionaries.
    Returns:
        list: A list of unique game mode strings.
    """
    game_modes = list()
    for game in game_history:
        if game["mode"] not in game_modes:
            game_modes.append(game["mode"])
    return game_modes


def load_players_rating(game_history, game_modes, starting_elo=1000):
    """
    Initializes player ratings with a starting ELO for global and each game mode.
    Args:
        game_history (list): A list of game dictionaries.
        game_modes (list): A list of unique game mode strings.
        starting_elo (float): The initial ELO rating for new players. Default is 1000.
    Returns:
        dict: A dictionary where keys are player names and values are their
              initial ELO ratings and game counts for global and each mode.
    """
    players = dict()
    for game in game_history:
        for player in game["players"]:
            if player not in players:
                players[player] = {"global": {"rating": float(starting_elo), "games": 0}}
                for mode in game_modes:
                    players[player][mode] = {"rating": float(starting_elo), "games": 0}

    return players

def expected_score(player_rating, opponent_rating):
    """
    Calculates the expected score (probability of winning) for a player against an opponent.
    Args:
        player_rating (float): The ELO rating of the player.
        opponent_rating (float): The ELO rating of the opponent.
    Returns:
        float: The expected score for the player (between 0 and 1).
    """
    return 1 / (1 + 10 ** ((opponent_rating - player_rating) / 400))

def get_k_factor(player_game_count, k_factors, thresholds):
    """
    Determines the K-factor based on the player's game count and defined thresholds.
    Args:
        player_game_count (int): The number of games the player has played.
        k_factors (list): A list of K values (e.g., [40, 20, 10]).
        thresholds (list): A list of game count thresholds (e.g., [10, 30]).
                           If player_game_count < thresholds[0], use k_factors[0].
                           If thresholds[0] <= player_game_count < thresholds[1], use k_factors[1], etc.
    Returns:
        float: The appropriate K-factor for the player.
    """
    if not thresholds:
        return k_factors[0]

    for i, threshold in enumerate(thresholds):
        if player_game_count < threshold:
            return k_factors[i]
    return k_factors[-1]


def calculate_elos(game_history, players_rating, k_factors, thresholds=None):
    """
    Calculates and updates ELO ratings for all players based on game history.
    Args:
        game_history (list): A list of game dictionaries.
        players_rating (dict): A dictionary of current player ratings.
        k_factors (list): A list of K values for ELO calculation.
        thresholds (list, optional): Thresholds for variable K-factor based on game count.
                                     Defaults to None (fixed K).
    Raises:
        ValueError: If the length of thresholds is not one less than k_factors
                    when using variable K.
    """
    if not isinstance(k_factors, list):
        k_factors = [float(k_factors)]

    if thresholds is None:
        thresholds = []

    if len(k_factors) > 1 and len(thresholds) != len(k_factors) - 1:
        raise ValueError("Length of thresholds must be one less than the length of k_factors when using variable K.")

    for game in game_history:
        mode = game["mode"]
        variant = game["variant"]
        players = game["players"]
        # For CutThroat, lower score is better
        if variant != "CutThroat":
            players = players[::-1]

        deltas_global = {player: 0 for player in players}
        deltas_mode = {player: 0 for player in players}
        n = len(players)
        for i in range(n):
            for j in range(i + 1, n):
                winner = players[i]
                loser = players[j]

                winner_global_rating = players_rating[winner]["global"]["rating"]
                winner_mode_rating = players_rating[winner][mode]["rating"]

                loser_global_rating = players_rating[loser]["global"]["rating"]
                loser_mode_rating = players_rating[loser][mode]["rating"]

                k_winner_global = get_k_factor(players_rating[winner]["global"]["games"], k_factors, thresholds)
                k_loser_global = get_k_factor(players_rating[loser]["global"]["games"], k_factors, thresholds)

                k_winner_mode = get_k_factor(players_rating[winner][mode]["games"], k_factors, thresholds)
                k_loser_mode = get_k_factor(players_rating[loser][mode]["games"], k_factors, thresholds)

                expected_global_winner = expected_score(winner_global_rating, loser_global_rating)
                expected_mode_winner = expected_score(winner_mode_rating, loser_mode_rating)

                expected_global_loser = expected_score(loser_global_rating, winner_global_rating)
                expected_mode_loser = expected_score(loser_mode_rating, winner_mode_rating)

                deltas_global[winner] += k_winner_global * (1 - expected_global_winner) / (n - 1)
                deltas_mode[winner] += k_winner_mode * (1 - expected_mode_winner) / (n - 1)
                deltas_global[loser] += k_loser_global * (0 - expected_global_loser) / (n - 1)
                deltas_mode[loser] += k_loser_mode * (0 - expected_mode_loser) / (n - 1)

        for player in players:
            players_rating[player]["global"]["rating"] += deltas_global[player]
            players_rating[player][mode]["rating"] += deltas_mode[player]
            players_rating[player]["global"]["games"] += 1
            players_rating[player][mode]["games"] += 1


def save_elos(players, output_file):
    """
    Saves the calculated ELO ratings to a JSON file.
    Args:
        players (dict): A dictionary of player ratings.
        output_file (str): Path to the output JSON file.
    """
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(players, f, indent=4, ensure_ascii=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='dart-elo-calculator', usage='%(prog)s [options]')
    parser.add_argument("-f", "--file", help="filepath to the game history file (json)", required=True)
    parser.add_argument("-o", "--output", help="filepath to the output file (json)", required=True)
    parser.add_argument("-k", help="converging factor K, can be a single int/float or a comma-separated list of ints/floats (e.g., '40,20,10'). Default is 20.", default="20")
    parser.add_argument("-t", help="comma-separated list of thresholds for variable K based on game count (e.g., '10,30'). List length must be n-1 with n being the length of the K-factor list. Default is no thresholds (fixed K).", default="")
    parser.add_argument("-e", "--starting_elo", help="starting elo for calculation. Default is 1000.", default=1000)
    args = parser.parse_args()

    k_factors_str = args.k.split(',')
    k_factors = [float(k_val.strip()) for k_val in k_factors_str]

    thresholds_str = args.t.split(',')
    thresholds = [int(t_val.strip()) for t_val in thresholds_str if t_val.strip()]

    starting_elo = float(args.starting_elo)

    game_history = load_game_history(file=args.file)
    game_modes = load_game_modes(game_history)
    players_rating = load_players_rating(game_history, game_modes, starting_elo)
    calculate_elos(game_history, players_rating, k_factors, thresholds)

    save_elos(players_rating, args.output)
