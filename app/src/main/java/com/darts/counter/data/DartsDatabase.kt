package com.darts.counter.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [GameResultEntity::class], version = 1, exportSchema = false)
abstract class DartsDatabase : RoomDatabase() {
    abstract fun gameResultDao(): GameResultDao

    companion object {
        @Volatile private var INSTANCE: DartsDatabase? = null

        fun get(context: Context): DartsDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    DartsDatabase::class.java,
                    "darts.db"
                ).build().also { INSTANCE = it }
            }
    }
}
