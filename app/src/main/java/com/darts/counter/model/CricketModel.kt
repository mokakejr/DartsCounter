package com.darts.counter.model

val CRICKET_TARGETS = listOf(20, 19, 18, 17, 16, 15, 25)

enum class CricketMode { NORMAL, CUT_THROAT }

data class CricketState(
    val playerNames: List<String>,
    val marks: Array<IntArray>,
    val points: IntArray,
    val currentPlayer: Int = 0,
    val winner: Int? = null,
    val mode: CricketMode = CricketMode.NORMAL
) {
    val playerCount: Int get() = playerNames.size

    fun isClosed(player: Int, targetIdx: Int) = marks[player][targetIdx] >= 3
    fun isGloballyClosed(targetIdx: Int) = (0 until playerCount).all { isClosed(it, targetIdx) }
    fun targetValue(targetIdx: Int): Int = if (CRICKET_TARGETS[targetIdx] == 25) 25 else CRICKET_TARGETS[targetIdx]

    override fun equals(other: Any?) = other is CricketState &&
            playerNames == other.playerNames &&
            marks.contentDeepEquals(other.marks) &&
            points.contentEquals(other.points) &&
            currentPlayer == other.currentPlayer &&
            winner == other.winner &&
            mode == other.mode

    override fun hashCode(): Int {
        var result = playerNames.hashCode()
        result = 31 * result + marks.contentDeepHashCode()
        result = 31 * result + points.contentHashCode()
        result = 31 * result + currentPlayer
        result = 31 * result + (winner ?: -1)
        result = 31 * result + mode.hashCode()
        return result
    }
}

fun initialCricketState(playerNames: List<String>, mode: CricketMode = CricketMode.NORMAL): CricketState {
    val marks = Array(playerNames.size) { IntArray(CRICKET_TARGETS.size) { 0 } }
    val points = IntArray(playerNames.size) { 0 }
    return CricketState(playerNames = playerNames, marks = marks, points = points, mode = mode)
}

fun CricketState.addHit(player: Int, targetIdx: Int, count: Int): CricketState {
    val newMarks = Array(playerCount) { marks[it].copyOf() }
    val newPoints = points.copyOf()

    val current = newMarks[player][targetIdx]
    val newTotal = (current + count).coerceAtMost(99)
    newMarks[player][targetIdx] = newTotal

    // Marks beyond 3 score points; correct for already-overflowed state
    val scoringHits = (newTotal - 3).coerceAtLeast(0) - (current - 3).coerceAtLeast(0)

    if (scoringHits > 0 && !isGloballyClosed(targetIdx)) {
        when (mode) {
            CricketMode.CUT_THROAT -> {
                // Points go to each opponent who hasn't closed this target yet
                for (opponent in 0 until playerCount) {
                    if (opponent != player && !isClosed(opponent, targetIdx)) {
                        newPoints[opponent] += scoringHits * targetValue(targetIdx)
                    }
                }
            }
            CricketMode.NORMAL -> {
                // Points go to the player if at least one opponent hasn't closed
                val allOthersClosed = (0 until playerCount).filter { it != player }.all { isClosed(it, targetIdx) }
                if (!allOthersClosed) {
                    newPoints[player] += scoringHits * targetValue(targetIdx)
                }
            }
        }
    }

    val newState = copy(marks = newMarks, points = newPoints)
    return newState.copy(winner = newState.checkWinner())
}

fun CricketState.checkWinner(): Int? {
    for (p in 0 until playerCount) {
        val closedAll = (0 until CRICKET_TARGETS.size).all { marks[p][it] >= 3 }
        if (closedAll) {
            val myPoints = points[p]
            val wins = when (mode) {
                // Normal: win if score >= all others (highest wins)
                CricketMode.NORMAL -> (0 until playerCount).filter { it != p }.all { points[it] <= myPoints }
                // Cut Throat: win if score <= all others (lowest wins)
                CricketMode.CUT_THROAT -> (0 until playerCount).filter { it != p }.all { points[it] >= myPoints }
            }
            if (wins) return p
        }
    }
    return null
}

fun CricketState.nextPlayer(): CricketState {
    return copy(currentPlayer = (currentPlayer + 1) % playerCount)
}
