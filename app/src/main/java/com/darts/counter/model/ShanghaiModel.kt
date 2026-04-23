package com.darts.counter.model

data class ShanghaiState(
    val playerNames: List<String>,
    val scores: Array<IntArray>,      // scores[player][round 0-6]
    val currentRound: Int = 0,        // 0-6
    val currentPlayer: Int = 0,
    val finished: Boolean = false,
    val shanghaiWinner: Int? = null   // player who achieved Shanghai instant win
) {
    val playerCount: Int get() = playerNames.size
    val totalRounds: Int get() = 7

    fun totalScore(player: Int) = scores[player].sum()

    fun leader(): Int? {
        if (!finished) return null
        if (shanghaiWinner != null) return shanghaiWinner
        val maxScore = (0 until playerCount).maxOf { totalScore(it) }
        val top = (0 until playerCount).filter { totalScore(it) == maxScore }
        return if (top.size == 1) top[0] else null
    }

    override fun equals(other: Any?) = other is ShanghaiState &&
            playerNames == other.playerNames &&
            scores.contentDeepEquals(other.scores) &&
            currentRound == other.currentRound &&
            currentPlayer == other.currentPlayer &&
            finished == other.finished &&
            shanghaiWinner == other.shanghaiWinner

    override fun hashCode(): Int {
        var result = playerNames.hashCode()
        result = 31 * result + scores.contentDeepHashCode()
        result = 31 * result + currentRound
        result = 31 * result + currentPlayer
        result = 31 * result + finished.hashCode()
        result = 31 * result + (shanghaiWinner ?: -1)
        return result
    }
}

fun initialShanghaiState(playerNames: List<String>): ShanghaiState {
    val scores = Array(playerNames.size) { IntArray(7) { 0 } }
    return ShanghaiState(playerNames = playerNames, scores = scores)
}

// darts: list of zone values thrown this turn (0=miss, 1=single, 2=double, 3=triple)
fun isShanghai(darts: List<Int>) = darts.size == 3 && darts.containsAll(listOf(1, 2, 3))

fun ShanghaiState.addScore(player: Int, round: Int, points: Int, isShanghai: Boolean = false): ShanghaiState {
    val newScores = Array(playerCount) { scores[it].copyOf() }
    newScores[player][round] = points

    if (isShanghai) {
        return copy(scores = newScores, finished = true, shanghaiWinner = player)
    }

    val nextPlayer = (player + 1) % playerCount
    val nextRound = if (nextPlayer == 0) round + 1 else round
    val done = nextRound >= 7

    return copy(
        scores = newScores,
        currentPlayer = if (!done) nextPlayer else player,
        currentRound = if (!done) nextRound else round,
        finished = done
    )
}
