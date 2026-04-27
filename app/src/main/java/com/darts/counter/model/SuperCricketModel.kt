package com.darts.counter.model

const val SC_IDX_DOUBLE = 7
const val SC_IDX_TRIPLE = 8
const val SC_IDX_BED = 9
const val SC_TARGET_COUNT = 10

enum class SuperCricketMode { NORMAL, CUT_THROAT }

data class SuperCricketState(
    val playerNames: List<String>,
    val marks: Array<IntArray>,
    val points: IntArray,
    val mode: SuperCricketMode = SuperCricketMode.NORMAL,
    val winner: Int? = null
) {
    val playerCount: Int get() = playerNames.size
    fun isClosed(player: Int, targetIdx: Int) = marks[player][targetIdx] >= 3
    fun isGloballyClosed(targetIdx: Int) = (0 until playerCount).all { isClosed(it, targetIdx) }
    fun standardValue(targetIdx: Int): Int = CRICKET_TARGETS[targetIdx].let { if (it == 25) 25 else it }

    override fun equals(other: Any?) = other is SuperCricketState &&
            playerNames == other.playerNames &&
            marks.contentDeepEquals(other.marks) &&
            points.contentEquals(other.points) &&
            mode == other.mode &&
            winner == other.winner

    override fun hashCode(): Int {
        var result = playerNames.hashCode()
        result = 31 * result + marks.contentDeepHashCode()
        result = 31 * result + points.contentHashCode()
        result = 31 * result + mode.hashCode()
        result = 31 * result + (winner ?: -1)
        return result
    }
}

fun initialSuperCricketState(playerNames: List<String>, mode: SuperCricketMode = SuperCricketMode.NORMAL): SuperCricketState =
    SuperCricketState(
        playerNames = playerNames,
        marks = Array(playerNames.size) { IntArray(SC_TARGET_COUNT) { 0 } },
        points = IntArray(playerNames.size) { 0 },
        mode = mode
    )

private fun SuperCricketState.resolveWinner(newMarks: Array<IntArray>, newPoints: IntArray): Int? {
    for (p in 0 until playerCount) {
        if ((0 until SC_TARGET_COUNT).all { newMarks[p][it] >= 3 }) {
            val myPoints = newPoints[p]
            val wins = when (mode) {
                SuperCricketMode.NORMAL    -> (0 until playerCount).none { it != p && newPoints[it] > myPoints }
                SuperCricketMode.CUT_THROAT -> (0 until playerCount).none { it != p && newPoints[it] < myPoints }
            }
            if (wins) return p
        }
    }
    return null
}

fun SuperCricketState.addStandardHit(player: Int, targetIdx: Int): SuperCricketState {
    val newMarks = Array(playerCount) { i -> if (i == player) marks[i].copyOf() else marks[i] }
    val newPoints = points.copyOf()
    val current = marks[player][targetIdx]
    val newTotal = (current + 1).coerceAtMost(99)
    newMarks[player][targetIdx] = newTotal
    val scoringHits = (newTotal - 3).coerceAtLeast(0) - (current - 3).coerceAtLeast(0)
    if (scoringHits > 0 && !isGloballyClosed(targetIdx)) {
        val value = scoringHits * standardValue(targetIdx)
        when (mode) {
            SuperCricketMode.NORMAL -> {
                val allOthersClosed = (0 until playerCount).none { it != player && !isClosed(it, targetIdx) }
                if (!allOthersClosed) newPoints[player] += value
            }
            SuperCricketMode.CUT_THROAT -> {
                for (opponent in 0 until playerCount) {
                    if (opponent != player && !isClosed(opponent, targetIdx)) newPoints[opponent] += value
                }
            }
        }
    }
    return copy(marks = newMarks, points = newPoints, winner = resolveWinner(newMarks, newPoints))
}

fun SuperCricketState.addSpecialMark(player: Int, targetIdx: Int): SuperCricketState {
    val newMarks = Array(playerCount) { i -> if (i == player) marks[i].copyOf() else marks[i] }
    newMarks[player][targetIdx] = (marks[player][targetIdx] + 1).coerceAtMost(99)
    return copy(marks = newMarks, winner = resolveWinner(newMarks, points))
}

fun SuperCricketState.addSpecialScoring(player: Int, targetIdx: Int, pts: Int): SuperCricketState {
    val newPoints = points.copyOf()
    when (mode) {
        SuperCricketMode.NORMAL -> {
            val allOthersClosed = (0 until playerCount).none { it != player && !isClosed(it, targetIdx) }
            if (allOthersClosed) return this
            newPoints[player] += pts
        }
        SuperCricketMode.CUT_THROAT -> {
            val anyOpponentOpen = (0 until playerCount).any { it != player && !isClosed(it, targetIdx) }
            if (!anyOpponentOpen) return this
            for (opponent in 0 until playerCount) {
                if (opponent != player && !isClosed(opponent, targetIdx)) newPoints[opponent] += pts
            }
        }
    }
    return copy(points = newPoints, winner = resolveWinner(marks, newPoints))
}
