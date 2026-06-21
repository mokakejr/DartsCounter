import argparse
import json


def load_game_history(file):
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
    game_modes = list()
    for game in game_history:
        if game["mode"] not in game_modes:
            game_modes.append(game["mode"])
    return game_modes


def load_players_rating(game_history, game_modes, starting_elo=1000):
    players = dict()
    for game in game_history:
        for player in game["players"]:
            if player not in players:
                players[player] = {"global": {"rating": float(starting_elo), "games": 0}}
                for mode in game_modes:
                    players[player][mode] = {"rating": float(starting_elo), "games": 0}

    return players


def expected_score(player_rating, opponent_rating):
    return 1 / (1 + 10 ** ((opponent_rating - player_rating) / 400))


def calculate_elos(game_history, players_rating, k, t=0):
    k = float(k)
    if isinstance(k, list):
        raise NotImplementedError("not implemented yet")

    for game in game_history:
        mode = game["mode"]
        variant = game["variant"]
        players = game["players"]
        if variant != "CutThroat": #CutThroat, lower score is better
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

                # todo: implement a get_k when variable K will be implemented

                expected_global_winner = expected_score(winner_global_rating, loser_global_rating)
                expected_mode_winner = expected_score(winner_mode_rating, loser_mode_rating)

                expected_global_loser = expected_score(loser_global_rating, winner_global_rating)
                expected_mode_loser = expected_score(loser_mode_rating, winner_mode_rating)

                deltas_global[winner] += k * (1 - expected_global_winner) / (n - 1)
                deltas_mode[winner] += k * (1 - expected_mode_winner) / (n - 1)
                deltas_global[loser] += k * (0 - expected_global_loser) / (n - 1)
                deltas_mode[loser] += k * (0 - expected_mode_loser) / (n - 1)

        for player in players:
            players_rating[player]["global"]["rating"] += deltas_global[player]
            players_rating[player][mode]["rating"] += deltas_mode[player]
            players_rating[player]["global"]["games"] += 1
            players_rating[player][mode]["games"] += 1


def save_elos(players, output_file):
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(players, f, indent=4, ensure_ascii=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='dart-elo-calculator', usage='%(prog)s [options]')
    parser.add_argument("-f", "--file", help="filepath to the game history file (json)")
    parser.add_argument("-o", "--output", help="filepath to the output file (csv)")
    parser.add_argument("-k", help="converging factor K, can be both an int or a list(int), default is 20", default=20)
    parser.add_argument("-t",
                        help="threshold list for variable K, list length must be n-1 with n being the length of the converging factor list")
    parser.add_argument("-e", "--starting_elo", help="starting elo for calculation")
    args = parser.parse_args()
    game_history = load_game_history(file=args.file)
    game_modes = load_game_modes(game_history)
    players_rating = load_players_rating(game_history, game_modes, args.starting_elo)
    calculate_elos(game_history, players_rating, args.k, args.t)

    save_elos(players_rating, args.output)
