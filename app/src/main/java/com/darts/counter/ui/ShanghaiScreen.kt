package com.darts.counter.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.ui.platform.LocalContext
import com.darts.counter.data.GameRepository
import com.darts.counter.data.GameSyncService
import kotlinx.coroutines.delay
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.darts.counter.model.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShanghaiScreen(playerNames: List<String>, onBack: () -> Unit) {
    var state by remember { mutableStateOf(initialShanghaiState(playerNames)) }
    var pendingDarts by remember { mutableStateOf(listOf<Int>()) }
    var showReset by remember { mutableStateOf(false) }
    var showBackConfirm by remember { mutableStateOf(false) }
    var elapsedSeconds by remember { mutableStateOf(0L) }
    var gameKey by remember { mutableStateOf(0) }

    val context = LocalContext.current

    LaunchedEffect(gameKey) {
        elapsedSeconds = 0L
        while (true) { delay(1000L); elapsedSeconds++ }
    }

    LaunchedEffect(state.finished) {
        if (!state.finished) return@LaunchedEffect
        val leader = state.leader()
        val winnerName = if (leader != null) state.playerNames[leader] else "Égalité"
        val repo = GameRepository(context)
        val saved = repo.saveGame(
            mode = "Shanghai",
            variant = if (state.shanghaiWinner != null) "Shanghai Kill" else "Normal",
            playerNames = playerNames,
            scores = (0 until state.playerCount).map { state.totalScore(it) },
            winnerName = winnerName,
            durationSeconds = elapsedSeconds
        )
        GameSyncService.sync(saved)
    }

    BackHandler { showBackConfirm = true }

    if (showBackConfirm) {
        AlertDialog(
            onDismissRequest = { showBackConfirm = false },
            title = { Text("Quitter la partie ?") },
            text = { Text("La partie en cours sera perdue.", color = Color(0xFF888888), fontSize = 13.sp) },
            confirmButton = {
                TextButton(onClick = onBack) { Text("Quitter", color = Color(0xFFE57373)) }
            },
            dismissButton = {
                TextButton(onClick = { showBackConfirm = false }) { Text("Continuer") }
            }
        )
    }

    if (showReset) {
        AlertDialog(
            onDismissRequest = { showReset = false },
            title = { Text("Recommencer ?") },
            confirmButton = {
                TextButton(onClick = {
                    state = initialShanghaiState(playerNames)
                    pendingDarts = listOf()
                    showReset = false
                }) { Text("Oui") }
            },
            dismissButton = {
                TextButton(onClick = { showReset = false }) { Text("Non") }
            }
        )
    }

    if (state.finished) {
        val winner = state.leader()
        WinnerDialog(
            playerName = if (winner != null) state.playerNames[winner] else "Égalité",
            isShanghaiWin = state.shanghaiWinner != null,
            onRematch = {
                state = initialShanghaiState(playerNames)
                pendingDarts = listOf()
                gameKey++
            },
            onQuit = onBack
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("SHANGHAI", fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        letterSpacing = 3.sp, color = MaterialTheme.colorScheme.onBackground)
                },
                navigationIcon = {
                    IconButton(onClick = { showBackConfirm = true }) {
                        Icon(Icons.Default.ArrowBack, null, tint = MaterialTheme.colorScheme.onBackground)
                    }
                },
                actions = {
                    Text(
                        formatElapsed(elapsedSeconds),
                        fontSize = 12.sp,
                        color = Color(0xFF8B949E),
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    TextButton(onClick = { showReset = true }) {
                        Text("↺", fontSize = 20.sp, color = Color(0xFF888888))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        val round = state.currentRound + 1
        val player = state.playerNames[state.currentPlayer]
        val shanghai = isShanghai(pendingDarts)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp)
        ) {
            // Current turn info
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (shanghai) Color(0xFF1A1800) else Color(0xFF1A1A1A))
                    .border(1.dp, if (shanghai) Color(0xFFFFD700) else Color.Transparent, RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "ROUND $round / ${state.totalRounds}  ·  CIBLE : $round",
                        fontSize = 11.sp, color = Color(0xFF666666), letterSpacing = 2.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = player, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.height(10.dp))

                    // Dart slots
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        repeat(3) { i ->
                            val zone = pendingDarts.getOrNull(i)
                            Text(
                                text = dartSlotSymbol(zone),
                                fontSize = 30.sp,
                                fontWeight = FontWeight.Bold,
                                color = dartSlotColor(zone, shanghai)
                            )
                        }
                    }

                    if (shanghai) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            "SHANGHAI !",
                            fontSize = 14.sp, fontWeight = FontWeight.Bold,
                            color = Color(0xFFFFD700), letterSpacing = 3.sp
                        )
                    }
                }
            }

            // Scores table
            ScoreTable(state = state, modifier = Modifier.weight(1f))

            // Dart buttons
            ShanghaiDartButtons(
                round = round,
                dartCount = pendingDarts.size,
                pendingSum = pendingDarts.sum(),
                isShanghai = shanghai,
                onDart = { zone ->
                    if (pendingDarts.size < 3) pendingDarts = pendingDarts + zone
                },
                onUndoLast = {
                    if (pendingDarts.isNotEmpty()) pendingDarts = pendingDarts.dropLast(1)
                },
                onConfirm = {
                    val pts = pendingDarts.sum() * round
                    state = state.addScore(state.currentPlayer, state.currentRound, pts, isShanghai = shanghai)
                    pendingDarts = listOf()
                }
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

private fun dartSlotSymbol(zone: Int?) = when (zone) {
    0 -> "✗"
    1 -> "/"
    2 -> "✕"
    3 -> "●"
    else -> "○"
}

private fun dartSlotColor(zone: Int?, shanghai: Boolean) = when {
    zone == null -> Color(0xFF2A2A2A)
    zone == 0 -> Color(0xFF444444)
    shanghai -> Color(0xFFFFD700)
    else -> Color(0xFFD0D0D0)
}

@Composable
fun ScoreTable(state: ShanghaiState, modifier: Modifier = Modifier) {
    LazyColumn(modifier = modifier.padding(vertical = 4.dp)) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("R", modifier = Modifier.width(28.dp), fontSize = 11.sp,
                    color = Color(0xFF555555), textAlign = TextAlign.Center)
                repeat(state.playerCount) { p ->
                    Text(
                        text = state.playerNames[p],
                        modifier = Modifier.weight(1f),
                        fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        color = if (p == state.currentPlayer) MaterialTheme.colorScheme.primary else Color(0xFF888888),
                        textAlign = TextAlign.Center
                    )
                }
                Text("MAX", modifier = Modifier.width(44.dp), fontSize = 11.sp,
                    color = Color(0xFF555555), textAlign = TextAlign.Center)
            }
            Divider(color = Color(0xFF2A2A2A))
        }

        // Totals
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
                    .clip(RoundedCornerShape(4.dp)).background(Color(0xFF1E1E1E)).padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("∑", modifier = Modifier.width(28.dp), fontSize = 13.sp,
                    color = Color(0xFF666666), textAlign = TextAlign.Center)
                repeat(state.playerCount) { p ->
                    Text(
                        text = "${state.totalScore(p)}",
                        modifier = Modifier.weight(1f),
                        fontSize = 16.sp, fontWeight = FontWeight.Bold,
                        color = if (p == state.currentPlayer) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.Center
                    )
                }
                Spacer(modifier = Modifier.width(44.dp))
            }
        }

        // Per-round rows (all 7 rounds, greyed if not yet reached)
        items(state.totalRounds) { r ->
            val isCurrent = r == state.currentRound
            val isPast = r < state.currentRound
            val isFuture = r > state.currentRound
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${r + 1}",
                    modifier = Modifier.width(28.dp),
                    fontSize = 12.sp,
                    color = if (isCurrent) Color(0xFF888888) else if (isPast) Color(0xFF555555) else Color(0xFF2A2A2A),
                    textAlign = TextAlign.Center
                )
                repeat(state.playerCount) { p ->
                    val score = state.scores[p][r]
                    val hasPlayed = isPast || (isCurrent && p < state.currentPlayer)
                    Text(
                        text = when {
                            isFuture -> "·"
                            hasPlayed -> "$score"
                            else -> "·"
                        },
                        modifier = Modifier.weight(1f),
                        fontSize = 13.sp,
                        color = when {
                            isFuture -> Color(0xFF252525)
                            !hasPlayed -> Color(0xFF333333)
                            score == 0 -> Color(0xFF3A3A3A)
                            else -> Color(0xFFCCCCCC)
                        },
                        textAlign = TextAlign.Center
                    )
                }
                Text(
                    text = "${9 * (r + 1)}",
                    modifier = Modifier.width(44.dp),
                    fontSize = 10.sp,
                    color = if (isFuture) Color(0xFF222222) else Color(0xFF333333),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
fun ShanghaiDartButtons(
    round: Int,
    dartCount: Int,
    pendingSum: Int,
    isShanghai: Boolean,
    onDart: (Int) -> Unit,
    onUndoLast: () -> Unit,
    onConfirm: () -> Unit
) {
    val canThrow = dartCount < 3

    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        // Zone buttons: SIMPLE / DOUBLE / TRIPLE
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                Triple(1, "SIMPLE", "${1 * round} pt"),
                Triple(2, "DOUBLE", "${2 * round} pts"),
                Triple(3, "TRIPLE", "${3 * round} pts")
            ).forEach { (zone, label, pts) ->
                Box(
                    modifier = Modifier
                        .weight(1f).height(68.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (canThrow) Color(0xFF1E1E1E) else Color(0xFF141414))
                        .border(1.dp,
                            if (canThrow) Color(0xFF333333) else Color(0xFF1A1A1A),
                            RoundedCornerShape(10.dp))
                        .clickable(enabled = canThrow) { onDart(zone) },
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(label, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                            color = if (canThrow) Color(0xFFD0D0D0) else Color(0xFF2A2A2A),
                            letterSpacing = 1.sp)
                        Text(pts, fontSize = 11.sp,
                            color = if (canThrow) Color(0xFF666666) else Color(0xFF242424))
                    }
                }
            }
        }

        // MISS / ↩ / VALIDER
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // MISS
            Box(
                modifier = Modifier
                    .weight(1f).height(52.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (canThrow) Color(0xFF200E0E) else Color(0xFF141414))
                    .border(1.dp,
                        if (canThrow) Color(0xFF553333) else Color(0xFF1A1A1A),
                        RoundedCornerShape(8.dp))
                    .clickable(enabled = canThrow) { onDart(0) },
                contentAlignment = Alignment.Center
            ) {
                Text("MISS", fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    color = if (canThrow) Color(0xFF884444) else Color(0xFF2A2A2A))
            }

            // Undo last dart
            Box(
                modifier = Modifier
                    .weight(1f).height(52.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF1A1A1A))
                    .border(1.dp,
                        if (dartCount > 0) Color(0xFF333333) else Color(0xFF1A1A1A),
                        RoundedCornerShape(8.dp))
                    .clickable(enabled = dartCount > 0) { onUndoLast() },
                contentAlignment = Alignment.Center
            ) {
                Text("↩", fontSize = 18.sp,
                    color = if (dartCount > 0) Color(0xFF666666) else Color(0xFF252525))
            }

            // Confirm
            Box(
                modifier = Modifier
                    .weight(2f).height(52.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isShanghai) Color(0xFF1A1600) else Color(0xFF1A2E1A))
                    .border(1.dp,
                        if (isShanghai) Color(0xFFFFD700) else Color(0xFF4CAF50),
                        RoundedCornerShape(8.dp))
                    .clickable { onConfirm() },
                contentAlignment = Alignment.Center
            ) {
                if (isShanghai) {
                    Text("🎯 SHANGHAI!  ✓", fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        color = Color(0xFFFFD700))
                } else {
                    val totalPts = pendingSum * round
                    Text(
                        if (totalPts > 0) "$totalPts pts  ✓" else "✓",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF4CAF50)
                    )
                }
            }
        }
    }
}
