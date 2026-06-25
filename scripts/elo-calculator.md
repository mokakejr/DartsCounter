# ELO Rating Calculator

This script calculates ELO ratings for players based on a history of dart games. It supports different game modes and handles multiple players in a single game.

## How to Run

The script is a Python script and can be run from the command line.

```bash
python elo-calculator.py -f <input_game_history_file.json> -o <output_elo_ratings_file.json> [options]
```

### Example :
```bash
uv run .\scripts\elo-calculator.py -f .\docs\data\games.json -k 40,30,20 -t 5,15 -e 1000 -o elo_k_40_30_20.json
```

## Arguments

*   `-f`, `--file` (required): Path to the JSON file containing the game history.
*   `-o`, `--output` (required): Path to the JSON file where the calculated ELO ratings will be saved.
*   `-k` (optional): The converging factor K. This can be an integer or a list of integers (though variable K is not yet implemented). Default is `20`.
*   `-t` (optional): Threshold list for variable K. This is not yet implemented.
*   `-e`, `--starting_elo` (optional): The initial ELO rating for new players. Default is `1000`.

## Input Game History File Format

The input file should be a JSON array of game objects. Each game object must have the following structure:

```json
[
  {
    "date": "YYYY-MM-DDTHH:MM:SS",
    "mode": "GameModeName",
    "variant": "GameVariantName",
    "players": ["Player1Name", "Player2Name", ...],
    "scores": [score1, score2, ...]
  },
  // ... more game objects
]
```

**Important Notes:**
*   `date`: Used for sorting games chronologically.
*   `mode`: The game mode (e.g., "501", "Cricket"). ELO ratings are calculated globally and per game mode.
*   `variant`: The game variant (e.g., "Standard", "CutThroat"). For "CutThroat", lower scores are considered better. For other variants, higher scores are considered better.
*   `players`: A list of player names participating in the game.
*   `scores`: A list of scores corresponding to the players in the `players` list. The script expects scores to be in the same order as players. The script will sort players and scores internally based on scores to determine winners/losers.

**Example Input:**

```json
[
  {
    "date": "2023-01-01T10:00:00",
    "mode": "501",
    "variant": "Standard",
    "players": ["Alice", "Bob"],
    "scores": [501, 450]
  },
  {
    "date": "2023-01-01T11:00:00",
    "mode": "Cricket",
    "variant": "Standard",
    "players": ["Charlie", "Alice", "Bob"],
    "scores": [200, 150, 100]
  },
  {
    "date": "2023-01-02T14:30:00",
    "mode": "301",
    "variant": "CutThroat",
    "players": ["Bob", "Charlie"],
    "scores": [100, 120]
  }
]
```

## Output ELO Ratings File Format

The output file will be a JSON object where keys are player names and values are objects containing their global and mode-specific ELO ratings and game counts.

```json
{
  "Player1Name": {
    "global": {
      "rating": 1020.5,
      "games": 10
    },
    "GameModeName1": {
      "rating": 1010.2,
      "games": 5
    },
    "GameModeName2": {
      "rating": 1030.8,
      "games": 5
    }
  },
  "Player2Name": {
    // ...
  }
}
```

**Example Output:**

```json
{
  "Alice": {
    "global": {
      "rating": 1015.75,
      "games": 2
    },
    "501": {
      "rating": 1010.0,
      "games": 1
    },
    "Cricket": {
      "rating": 1021.5,
      "games": 1
    }
  },
  "Bob": {
    "global": {
      "rating": 990.25,
      "games": 3
    },
    "501": {
      "rating": 990.0,
      "games": 1
    },
    "Cricket": {
      "rating": 980.5,
      "games": 1
    },
    "301": {
      "rating": 1000.0,
      "games": 1
    }
  },
  "Charlie": {
    "global": {
      "rating": 1000.0,
      "games": 2
    },
    "Cricket": {
      "rating": 1000.0,
      "games": 1
    },
    "301": {
      "rating": 1000.0,
      "games": 1
    }
  }
}
```