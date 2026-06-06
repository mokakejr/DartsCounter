package com.darts.counter.data

import android.content.Context

class GameRepository(context: Context) {
    private val dao = DartsDatabase.get(context).gameResultDao()

    suspend fun saveGame(
        mode: String,
        variant: String,
        playerNames: List<String>,
        scores: List<Int>,
        winnerName: String,
        durationSeconds: Long
    ): GameResultEntity {
        val entity = GameResultEntity(
            mode = mode,
            variant = variant,
            playerNames = playerNames.joinToString(",", "[", "]") { "\"$it\"" },
            scores = scores.joinToString(",", "[", "]"),
            winnerName = winnerName,
            durationSeconds = durationSeconds,
            playedAt = System.currentTimeMillis()
        )
        val id = dao.insert(entity)
        return entity.copy(id = id.toInt())
    }

    suspend fun recent50(): List<GameResultEntity> = dao.recent50()
}
