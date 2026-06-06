package com.darts.counter.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "game_results")
data class GameResultEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val mode: String,
    val variant: String,
    val playerNames: String,   // JSON: ["Alice","Bob"]
    val scores: String,        // JSON: [120, 85]
    val winnerName: String,
    val durationSeconds: Long,
    val playedAt: Long         // epoch ms
)
