package com.darts.counter.ui

import android.media.MediaPlayer
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
import androidx.compose.ui.window.DialogProperties
import com.darts.counter.R
import com.darts.counter.model.*

private val STANDARD_LABELS = listOf("20", "19", "18", "17", "16", "15", "BULL")
private val SPECIAL_LABELS = listOf("DBL", "TPL", "BED")
private val NUMBER_GRID = (1..20).chunked(5)
private val MULTIPLIER_ROWS = listOf(3..6, 7..9)

private sealed class ScoringDialogType {
    data class ForDouble(val player: Int) : ScoringDialogType()
    data class ForTriple(val player: Int) : ScoringDialogType()
    data class BedPickNumber(val player: Int) : ScoringDialogType()
    data class BedPickMultiplier(val player: Int, val number: Int) : ScoringDialogType()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SuperCricketScreen(playerNames: List<String>, mode: SuperCricketMode = SuperCricketMode.NORMAL, onBack: () -> Unit) {
    var state by remember { mutableStateOf(initialSuperCricketState(playerNames, mode)) }
    var history by remember { mutableStateOf(listOf<SuperCricketState>()) }
    var showBackConfirm by remember { mutableStateOf(false) }
    var scoringDialog by remember { mutableStateOf<ScoringDialogType?>(null) }

    val context = LocalContext.current
    val mexicainePlayers = remember {
        listOf(R.raw.mexicaine1, R.raw.mexicaine2).mapNotNull { res ->
            try { MediaPlayer.create(context, res) } catch (e: Exception) { null }
        }
    }

    val missPlayer = remember {
        try { MediaPlayer.create(context, R.raw.miss) } catch (e: Exception) { null }
    }

    val gaufrePlayer = remember {
        try { MediaPlayer.create(context, R.raw.gaufre) } catch (e: Exception) { null }
    }

    DisposableEffect(Unit) {
        onDispose {
            mexicainePlayers.forEach { it.release() }
            missPlayer?.release()
            gaufrePlayer?.release()
        }
    }

    BackHandler { showBackConfirm = true }

    state.winner?.let { winnerIdx ->
        WinnerDialog(
            playerName = state.playerNames[winnerIdx],
            onRematch = {
                state = initialSuperCricketState(playerNames, mode)
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

    when (val dialog = scoringDialog) {
        is ScoringDialogType.ForDouble -> {
            NumberPickerDialog(
                title = "Double : quel nombre ?",
                includeBull = true,
                onSelect = { number ->
                    val pts = if (number == 25) 50 else 2 * number
                    history = history + state
                    state = state.addSpecialScoring(dialog.player, SC_IDX_DOUBLE, pts)
                    scoringDialog = null
                },
                onDismiss = { scoringDialog = null }
            )
        }
        is ScoringDialogType.ForTriple -> {
            NumberPickerDialog(
                title = "Triple : quel nombre ?",
                includeBull = false,
                onSelect = { number ->
                    history = history + state
                    state = state.addSpecialScoring(dialog.player, SC_IDX_TRIPLE, 3 * number)
                    scoringDialog = null
                },
                onDismiss = { scoringDialog = null }
            )
        }
        is ScoringDialogType.BedPickNumber -> {
            NumberPickerDialog(
                title = "BED : quel nombre ?",
                includeBull = false,
                onSelect = { number ->
                    scoringDialog = ScoringDialogType.BedPickMultiplier(dialog.player, number)
                },
                onDismiss = { scoringDialog = null }
            )
        }
        is ScoringDialogType.BedPickMultiplier -> {
            MultiplierPickerDialog(
                title = "BED : combien de fois ?",
                number = dialog.number,
                onSelect = { multiplier ->
                    history = history + state
                    state = state.addSpecialScoring(dialog.player, SC_IDX_BED, multiplier * dialog.number)
                    scoringDialog = null
                },
                onBack = { scoringDialog = ScoringDialogType.BedPickNumber(dialog.player) },
                onDismiss = { scoringDialog = null }
            )
        }
        null -> {}
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "CRICKET", fontSize = 14.sp, fontWeight = FontWeight.Bold,
                            letterSpacing = 3.sp, color = MaterialTheme.colorScheme.onBackground
                        )
                        if (mode == SuperCricketMode.CUT_THROAT) {
                            Text("SUPER · CUT THROAT", fontSize = 10.sp, letterSpacing = 1.sp, color = Color(0xFFE57373))
                        } else {
                            Text("SUPER", fontSize = 10.sp, letterSpacing = 2.sp, color = Color(0xFFFFD700))
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
            SuperCricketGrid(
                modifier = Modifier.weight(1f),
                state = state,
                onHit = { player, targetIdx ->
                    when {
                        targetIdx >= SC_IDX_DOUBLE
                                && state.isClosed(player, targetIdx)
                                && !state.isGloballyClosed(targetIdx) -> {
                            scoringDialog = when (targetIdx) {
                                SC_IDX_DOUBLE -> ScoringDialogType.ForDouble(player)
                                SC_IDX_TRIPLE -> ScoringDialogType.ForTriple(player)
                                else -> ScoringDialogType.BedPickNumber(player)
                            }
                        }
                        !state.isGloballyClosed(targetIdx) -> {
                            history = history + state
                            state = if (targetIdx < SC_IDX_DOUBLE) {
                                state.addStandardHit(player, targetIdx)
                            } else {
                                state.addSpecialMark(player, targetIdx)
                            }
                        }
                    }
                }
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(54.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF2A0A0A))
                        .border(1.dp, Color(0xFFCC2222), RoundedCornerShape(10.dp))
                        .clickable {
                            missPlayer?.let {
                                if (it.isPlaying) { it.pause(); it.seekTo(0) }
                                it.start()
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text("MISS", fontSize = 15.sp, fontWeight = FontWeight.Bold,
                        color = Color(0xFFFF4444), letterSpacing = 3.sp)
                }

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

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(54.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF1A1200))
                        .border(1.dp, Color(0xFF997700), RoundedCornerShape(10.dp))
                        .clickable {
                            gaufrePlayer?.let {
                                if (it.isPlaying) { it.pause(); it.seekTo(0) }
                                it.start()
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text("GAUFRE", fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        color = Color(0xFFFFCC00), letterSpacing = 2.sp)
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .padding(bottom = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (history.isNotEmpty()) Color(0xFF1E1E1E) else Color(0xFF141414))
                    .border(
                        1.dp,
                        if (history.isNotEmpty()) Color(0xFF333333) else Color(0xFF1A1A1A),
                        RoundedCornerShape(8.dp)
                    )
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
fun SuperCricketGrid(
    modifier: Modifier = Modifier,
    state: SuperCricketState,
    onHit: (player: Int, targetIdx: Int) -> Unit
) {
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
                        Text(
                            state.playerNames[p], fontSize = 12.sp, fontWeight = FontWeight.Bold,
                            color = Color(0xFFAAAAAA), letterSpacing = 1.sp
                        )
                        Text(
                            "${state.points[p]}", fontSize = 24.sp, fontWeight = FontWeight.Bold,
                            color = if (state.mode == SuperCricketMode.CUT_THROAT) Color(0xFFE57373) else Color(0xFFFFD700)
                        )
                    }
                }
            }
        }

        Divider(color = Color(0xFF252525), thickness = 1.dp)

        Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
            STANDARD_LABELS.forEachIndexed { idx, label ->
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
                            label, fontSize = 14.sp, fontWeight = FontWeight.Bold,
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
                if (idx < STANDARD_LABELS.lastIndex) {
                    Divider(color = Color(0xFF1A1A1A), thickness = 1.dp)
                }
            }

            // Thicker gold divider separates standard targets from the special Super Cricket categories
            Divider(color = Color(0xFF3A3010), thickness = 2.dp)

            SPECIAL_LABELS.forEachIndexed { si, label ->
                val idx = SC_IDX_DOUBLE + si
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
                            label, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                            color = if (globallyClosed) Color(0xFF2C2C2C) else Color(0xFFFFD700),
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
                                    isClosed -> Color(0xFF1E1A06)
                                    else -> Color(0xFF1C1C1C)
                                })
                                .then(
                                    if (isClosed && !globallyClosed) Modifier.border(
                                        1.dp, Color(0xFF7A6010), RoundedCornerShape(6.dp)
                                    ) else Modifier
                                )
                                .clickable(enabled = !globallyClosed) { onHit(p, idx) },
                            contentAlignment = Alignment.Center
                        ) {
                            MarkDisplay(count = markCount, closed = isClosed, globalClosed = globallyClosed)
                        }
                    }
                }
                if (si < SPECIAL_LABELS.lastIndex) {
                    Divider(color = Color(0xFF1A1A1A), thickness = 1.dp)
                }
            }
        }
    }
}

@Composable
private fun NumberPickerDialog(
    title: String,
    includeBull: Boolean,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF1E1E1E))
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                title, fontSize = 16.sp, fontWeight = FontWeight.Bold,
                color = Color(0xFFFFD700), letterSpacing = 2.sp, textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(16.dp))

            NUMBER_GRID.forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    row.forEach { n ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(58.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFF2A2A2A))
                                .clickable { onSelect(n) },
                            contentAlignment = Alignment.Center
                        ) {
                            Text("$n", fontSize = 20.sp, color = Color(0xFFE0E0E0), fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            if (includeBull) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(58.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF2A2A2A))
                        .clickable { onSelect(25) },
                    contentAlignment = Alignment.Center
                ) {
                    Text("BULL  —  50 pts", fontSize = 18.sp, color = Color(0xFFE0E0E0), fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            Spacer(modifier = Modifier.height(4.dp))
            TextButton(onClick = onDismiss) {
                Text("Annuler", color = Color(0xFF666666), fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun MultiplierPickerDialog(
    title: String,
    number: Int,
    onSelect: (Int) -> Unit,
    onBack: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF1E1E1E))
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                title, fontSize = 16.sp, fontWeight = FontWeight.Bold,
                color = Color(0xFFFFD700), letterSpacing = 2.sp
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text("Nombre : $number", fontSize = 14.sp, color = Color(0xFF888888))
            Spacer(modifier = Modifier.height(20.dp))

            MULTIPLIER_ROWS.forEach { range ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    range.forEach { mult ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(80.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFF2A2A2A))
                                .clickable { onSelect(mult) },
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    "×$mult", fontSize = 24.sp, color = Color(0xFFE0E0E0),
                                    fontWeight = FontWeight.Bold
                                )
                                Text("${mult * number} pts", fontSize = 13.sp, color = Color(0xFF888888))
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
            }

            Spacer(modifier = Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onBack) { Text("↩ Retour", color = Color(0xFF888888), fontSize = 14.sp) }
                TextButton(onClick = onDismiss) { Text("Annuler", color = Color(0xFF666666), fontSize = 14.sp) }
            }
        }
    }
}
