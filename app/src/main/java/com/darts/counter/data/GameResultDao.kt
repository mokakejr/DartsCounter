package com.darts.counter.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface GameResultDao {
    @Insert
    suspend fun insert(game: GameResultEntity): Long

    @Query("SELECT * FROM game_results ORDER BY playedAt DESC")
    fun allGames(): Flow<List<GameResultEntity>>

    @Query("SELECT * FROM game_results ORDER BY playedAt DESC LIMIT 50")
    suspend fun recent50(): List<GameResultEntity>
}
