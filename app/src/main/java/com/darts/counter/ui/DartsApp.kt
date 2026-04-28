package com.darts.counter.ui

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.darts.counter.model.CricketMode
import com.darts.counter.model.SuperCricketMode

@Composable
fun DartsApp() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(
                onStartCricket = { players, mode ->
                    navController.navigate("setup/$players/cricket_$mode")
                },
                onStartShanghai = { players ->
                    navController.navigate("setup/$players/shanghai")
                },
                onStartFiftyOne = { players ->
                    navController.navigate("setup/$players/fiftyone")
                }
            )
        }

        composable("setup/{count}/{gameMode}") { back ->
            val count = back.arguments?.getString("count")?.toInt() ?: 2
            val gameMode = back.arguments?.getString("gameMode") ?: "cricket_normal"
            PlayerSetupScreen(
                playerCount = count,
                onBack = { navController.popBackStack() },
                onConfirm = { names ->
                    val encoded = Uri.encode(names.joinToString("|"))
                    when {
                        gameMode == "cricket_super" -> {
                            navController.navigate("supercricket/$count/normal?n=$encoded") {
                                popUpTo("home") { inclusive = false }
                            }
                        }
                        gameMode == "cricket_superct" -> {
                            navController.navigate("supercricket/$count/cutthroat?n=$encoded") {
                                popUpTo("home") { inclusive = false }
                            }
                        }
                        gameMode.startsWith("cricket_") -> {
                            val mode = gameMode.removePrefix("cricket_")
                            navController.navigate("cricket/$count/$mode?n=$encoded") {
                                popUpTo("home") { inclusive = false }
                            }
                        }
                        gameMode == "fiftyone" -> {
                            navController.navigate("fiftyone/$count?n=$encoded") {
                                popUpTo("home") { inclusive = false }
                            }
                        }
                        else -> navController.navigate("shanghai/$count?n=$encoded") {
                            popUpTo("home") { inclusive = false }
                        }
                    }
                }
            )
        }

        composable(
            route = "cricket/{players}/{mode}?n={n}",
            arguments = listOf(
                navArgument("players") { type = NavType.StringType },
                navArgument("mode") { type = NavType.StringType },
                navArgument("n") { type = NavType.StringType; defaultValue = "" }
            )
        ) { back ->
            val players = back.arguments?.getString("players")?.toInt() ?: 2
            val modeStr = back.arguments?.getString("mode") ?: "normal"
            val namesStr = back.arguments?.getString("n") ?: ""
            val playerNames = if (namesStr.isBlank()) List(players) { "J${it + 1}" }
                              else Uri.decode(namesStr).split("|")
            val mode = if (modeStr == "cutthroat") CricketMode.CUT_THROAT else CricketMode.NORMAL
            CricketScreen(
                playerNames = playerNames,
                mode = mode,
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = "supercricket/{players}/{mode}?n={n}",
            arguments = listOf(
                navArgument("players") { type = NavType.StringType },
                navArgument("mode") { type = NavType.StringType },
                navArgument("n") { type = NavType.StringType; defaultValue = "" }
            )
        ) { back ->
            val players = back.arguments?.getString("players")?.toInt() ?: 2
            val modeStr = back.arguments?.getString("mode") ?: "normal"
            val namesStr = back.arguments?.getString("n") ?: ""
            val playerNames = if (namesStr.isBlank()) List(players) { "J${it + 1}" }
                              else Uri.decode(namesStr).split("|")
            val mode = if (modeStr == "cutthroat") SuperCricketMode.CUT_THROAT else SuperCricketMode.NORMAL
            SuperCricketScreen(
                playerNames = playerNames,
                mode = mode,
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = "shanghai/{players}?n={n}",
            arguments = listOf(
                navArgument("players") { type = NavType.StringType },
                navArgument("n") { type = NavType.StringType; defaultValue = "" }
            )
        ) { back ->
            val players = back.arguments?.getString("players")?.toInt() ?: 2
            val namesStr = back.arguments?.getString("n") ?: ""
            val playerNames = if (namesStr.isBlank()) List(players) { "J${it + 1}" }
                              else Uri.decode(namesStr).split("|")
            ShanghaiScreen(
                playerNames = playerNames,
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = "fiftyone/{players}?n={n}",
            arguments = listOf(
                navArgument("players") { type = NavType.StringType },
                navArgument("n") { type = NavType.StringType; defaultValue = "" }
            )
        ) { back ->
            val players = back.arguments?.getString("players")?.toInt() ?: 2
            val namesStr = back.arguments?.getString("n") ?: ""
            val playerNames = if (namesStr.isBlank()) List(players) { "J${it + 1}" }
                              else Uri.decode(namesStr).split("|")
            FiftyOneScreen(
                playerNames = playerNames,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
