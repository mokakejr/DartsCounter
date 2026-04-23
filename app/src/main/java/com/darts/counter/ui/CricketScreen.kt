package com.darts.counter.ui

import android.media.AudioManager
import android.media.MediaPlayer
import android.media.ToneGenerator
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.darts.counter.model.*
import com.darts.counter.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CricketScreen(playerNames: List<String>, mode: CricketMode = CricketMode.NORMAL, onBack: () -> Unit) {
    var state by remember { mutableStateOf(initialCricketState(playerNames, mode)) }
    var history by remember { mutableStateOf(listOf<CricketState>()) }
    var showBackConfirm by remember { mutableStateOf(false) }

    val context = LocalContext.current

    val toneGen = remember { ToneGenerator(AudioManager.STREAM_MUSIC, ToneGenerator.MAX_VOLUME) }

    val mexicainePlayers = remember {
        listOf(R.raw.mexicaine1, R.raw.mexicaine2).mapNotNull { res ->
            try { MediaPlayer.create(context, res) } catch (e: Exception) { null }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            toneGen.release()
            mexicainePlayers.forEach { it.release() }
        }
    }

    BackHandler { showBackConfirm = true }

    if (state.winner != null) {
        WinnerDialog(
            playerName = state.playerNames[state.winner!!],
            isCutThroat = mode == CricketMode.CUT_THROAT,
            onRematch = {
                state = initialCricketState(playerNames, mode)
                history = listOf()
            },
            onQuit = onBack
        )
    }

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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("CRICKET", fontSize = 14.sp, fontWeight = FontWeight.Bold,
                            letterSpacing = 3.sp, color = MaterialTheme.colorScheme.onBackground)
                        if (mode == CricketMode.CUT_THROAT) {
                            Text("CUT THROAT", fontSize = 10.sp, letterSpacing = 2.sp,
                                color = Color(0xFFE57373))
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { showBackConfirm = true }) {
                        Icon(Icons.Default.ArrowBack, null, tint = MaterialTheme.colorScheme.onBackground)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp)
        ) {
            CricketGrid(
                modifier = Modifier.weight(1f),
                state = state,
                mode = mode,
                onHit = { player, targetIdx ->
                    history = history + state
                    state = state.addHit(player, targetIdx, 1)
                }
            )

            // Boutons sons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // MISS
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(54.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF2A0A0A))
                        .border(1.dp, Color(0xFFCC2222), RoundedCornerShape(10.dp))
                        .clickable { toneGen.startTone(ToneGenerator.TONE_PROP_NACK, 250) },
                    contentAlignment = Alignment.Center
                ) {
                    Text("MISS", fontSize = 15.sp, fontWeight = FontWeight.Bold,
                        color = Color(0xFFFF4444), letterSpacing = 3.sp)
                }

                // MEXICAINE
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(54.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF061428))
                        .border(1.dp, Color(0xFF1565C0), RoundedCornerShape(10.dp))
                        .clickable {
                            if (mexicainePlayers.isNotEmpty()) {
                                val player = mexicainePlayers.random()
                                if (player.isPlaying) player.pause()
                                player.seekTo(0)
                                player.start()
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text("MEXICAINE", fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        color = Color(0xFF42A5F5), letterSpacing = 2.sp)
                }

                // GAUFRE
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(54.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF1A1200))
                        .border(1.dp, Color(0xFF997700), RoundedCornerShape(10.dp))
                        .clickable { toneGen.startTone(ToneGenerator.TONE_PROP_BEEP2, 400) },
                    contentAlignment = Alignment.Center
                ) {
                    Text("GAUFRE", fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        color = Color(0xFFFFCC00), letterSpacing = 2.sp)
                }
            }

            // Annuler
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .padding(bottom = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (history.isNotEmpty()) Color(0xFF1E1E1E) else Color(0xFF141414))
                    .border(1.dp,
                        if (history.isNotEmpty()) Color(0xFF333333) else Color(0xFF1A1A1A),
                        RoundedCornerShape(8.dp))
                    .clickable(enabled = history.isNotEmpty()) {
                        state = history.last()
                        history = history.dropLast(1)
                    },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "↩  Annuler",
                    fontSize = 12.sp,
                    color = if (history.isNotEmpty()) Color(0xFF888888) else Color(0xFF333333),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun CricketGrid(
    modifier: Modifier = Modifier,
    state: CricketState,
    mode: CricketMode = CricketMode.NORMAL,
    onHit: (player: Int, targetIdx: Int) -> Unit
) {
    val targets = CRICKET_TARGETS
    val isCutThroat = mode == CricketMode.CUT_THROAT

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(modifier = Modifier.width(52.dp))
            repeat(state.playerCount) { p ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 2.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFF1E1E1E))
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.playerNames[p], fontSize = 12.sp, fontWeight = FontWeight.Bold,
                            color = Color(0xFFAAAAAA), letterSpacing = 1.sp)
                        Text("${state.points[p]}", fontSize = 24.sp, fontWeight = FontWeight.Bold,
                            color = if (isCutThroat) Color(0xFFE57373) else Color(0xFFE0E0E0))
                    }
                }
            }
        }

        Divider(color = Color(0xFF252525), thickness = 1.dp)

        Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
            targets.forEachIndexed { idx, target ->
                val label = if (target == 25) "BULL" else "$target"
                val globallyClosed = state.isGloballyClosed(idx)

                Row(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(modifier = Modifier.width(52.dp), contentAlignment = Alignment.Center) {
                        Text(
                            label,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (globallyClosed) Color(0xFF2C2C2C) else Color(0xFF777777),
                            textAlign = TextAlign.Center
                        )
                    }

                    repeat(state.playerCount) { p ->
                        val markCount = state.marks[p][idx].coerceAtMost(3)
                        val isClosed = state.isClosed(p, idx)

                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .padding(horizontal = 2.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(when {
                                    globallyClosed -> Color(0xFF111111)
                                    isClosed -> Color(0xFF182818)
                                    else -> Color(0xFF1C1C1C)
                                })
                                .clickable(enabled = !globallyClosed) { onHit(p, idx) },
                            contentAlignment = Alignment.Center
                        ) {
                            MarkDisplay(count = markCount, closed = isClosed, globalClosed = globallyClosed)
                        }
                    }
                }

                if (idx < targets.lastIndex) {
                    Divider(color = Color(0xFF1A1A1A), thickness = 1.dp)
                }
            }
        }
    }
}

@Composable
fun MarkDisplay(count: Int, closed: Boolean, globalClosed: Boolean) {
    val activeColor = if (globalClosed) Color(0xFF252525) else Color(0xFFD0D0D0)
    val closedColor = if (globalClosed) Color(0xFF252525) else Color(0xFF4CAF50)

    when {
        closed -> Text("●", fontSize = 22.sp, color = closedColor, fontWeight = FontWeight.Bold)
        count == 1 -> Text("/", fontSize = 24.sp, color = activeColor, fontWeight = FontWeight.Bold)
        count == 2 -> Text("✕", fontSize = 22.sp, color = activeColor, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun WinnerDialog(
    playerName: String,
    isCutThroat: Boolean = false,
    isShanghaiWin: Boolean = false,
    onRematch: () -> Unit,
    onQuit: () -> Unit
) {
    Dialog(onDismissRequest = {}) {
        Column(
            modifier = Modifier.clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF1E1E1E)).padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(if (isShanghaiWin) "🎯" else "🎯", fontSize = 48.sp)
            Spacer(modifier = Modifier.height(16.dp))
            if (isShanghaiWin) {
                Text("SHANGHAI !", fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    color = Color(0xFFFFD700), letterSpacing = 3.sp, textAlign = TextAlign.Center)
                Spacer(modifier = Modifier.height(6.dp))
            }
            Text(text = "$playerName gagne !", fontSize = 20.sp, fontWeight = FontWeight.Bold,
                color = Color(0xFFE8E8E8), textAlign = TextAlign.Center)
            if (isCutThroat) {
                Spacer(modifier = Modifier.height(6.dp))
                Text("avec le moins de points", fontSize = 13.sp, color = Color(0xFF888888),
                    textAlign = TextAlign.Center)
            }
            Spacer(modifier = Modifier.height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = onQuit) { Text("Quitter", color = Color(0xFF888888)) }
                Box(
                    modifier = Modifier.clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFE8E8E8))
                        .clickable(onClick = onRematch)
                        .padding(horizontal = 20.dp, vertical = 10.dp)
                ) {
                    Text("Revanche", color = Color(0xFF121212), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }
}
