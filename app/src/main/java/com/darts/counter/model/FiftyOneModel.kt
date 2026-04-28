package com.darts.counter.model

const val FIFTY_ONE_TARGET = 51

data class FiftyOneState(
    val playerNames: List<String>,
    val fives: IntArray,
    val currentPlayer: Int = 0,
    val winner: Int? = null
) {
    val playerCount: Int get() = playerNames.size

    override fun equals(other: Any?) = other is FiftyOneState &&
            playerNames == other.playerNames &&
            fives.contentEquals(other.fives) &&
            currentPlayer == other.currentPlayer &&
            winner == other.winner

    override fun hashCode(): Int {
        var result = playerNames.hashCode()
        result = 31 * result + fives.contentHashCode()
        result = 31 * result + currentPlayer
        result = 31 * result + (winner ?: -1)
        return result
    }
}

fun initialFiftyOneState(playerNames: List<String>) = FiftyOneState(
    playerNames = playerNames,
    fives = IntArray(playerNames.size) { 0 }
)

// turnTotal: somme des 3 fléchettes. Doit être divisible par 5 pour marquer.
// Le joueur ne peut pas dépasser 51. S'il fait plus, il ne marque rien.
fun FiftyOneState.scoreTurn(player: Int, turnTotal: Int): FiftyOneState {
    val newFives = fives.copyOf()
    if (turnTotal > 0 && turnTotal % 5 == 0) {
        val fivesScored = turnTotal / 5
        val newTotal = newFives[player] + fivesScored
        // Le joueur ne marque que s'il ne dépasse pas 51
        if (newTotal <= FIFTY_ONE_TARGET) {
            newFives[player] = newTotal
        }
    }
    val newState = copy(fives = newFives)
    return newState.copy(winner = newState.checkWinner())
}

fun FiftyOneState.checkWinner(): Int? =
    (0 until playerCount).firstOrNull { fives[it] == FIFTY_ONE_TARGET }

fun FiftyOneState.nextPlayer(): FiftyOneState =
    copy(currentPlayer = (currentPlayer + 1) % playerCount)
