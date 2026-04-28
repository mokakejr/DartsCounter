package com.darts.counter.ui

import android.media.MediaPlayer
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import com.darts.counter.R
import com.darts.counter.model.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FiftyOneScreen(
    playerNames: List<String>,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var state by remember { mutableStateOf(initialFiftyOneState(playerNames)) }
    val history = remember { mutableStateListOf<FiftyOneState>() }
    var input by remember { mutableStateOf("") }
    var showExitDialog by remember { mutableStateOf(false) }

    BackHandler { showExitDialog = true }

    fun appendDigit(d: String) {
        if (input == "0") return
        val candidate = input + d
        if ((candidate.toIntOrNull() ?: Int.MAX_VALUE) <= 180) input = candidate
    }

    fun deleteDigit() { if (input.isNotEmpty()) input = input.dropLast(1) }

    fun confirmTurn() {
        val total = input.toIntOrNull() ?: 0
        history.add(state)
        val scored = state.scoreTurn(state.currentPlayer, total)
        state = if (scored.winner == null) scored.nextPlayer() else scored
        input = ""
    }

    fun undo() {
        if (history.isNotEmpty()) { state = history.removeLast(); input = "" }
    }

    fun playSound(resId: Int) {
        MediaPlayer.create(context, resId)?.apply {
            setOnCompletionListener { release() }
            start()
        }
    }

    val totalValue = input.toIntOrNull() ?: 0
    val isDivisible = totalValue > 0 && totalValue % 5 == 0
    val fivesPreview = if (isDivisible) totalValue / 5 else 0
    val currentFives = state.fives[state.currentPlayer]
    val wouldWin = isDivisible && currentFives + fivesPreview >= FIFTY_ONE_TARGET

    val inputColor = when {
        input.isEmpty() -> Color(0xFF444444)
        isDivisible     -> MaterialTheme.colorScheme.secondary
        else            -> MaterialTheme.colorScheme.tertiary
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "51",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 3.sp,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { showExitDialog = true }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour",
                            tint = MaterialTheme.colorScheme.onBackground)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 12.dp)
        ) {

            // ── Score input display (turn info) ───────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF1A1A2E))
                    .border(1.dp, Color(0xFF2A3A3E), RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "TOUR — ${state.playerNames[state.currentPlayer].uppercase()}",
                        fontSize = 11.sp,
                        letterSpacing = 2.sp,
                        color = Color(0xFF666666)
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = input.ifEmpty { "—" },
                        fontSize = 56.sp,
                        fontWeight = FontWeight.Bold,
                        color = inputColor
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = when {
                            input.isEmpty()        -> "entrez le total (0–180)"
                            wouldWin               -> "→ $fivesPreview cinqs — VICTOIRE · 3 fléchettes obligatoires !"
                            isDivisible            -> "→ $fivesPreview cinq${if (fivesPreview > 1) "s" else ""}"
                            totalValue == 0        -> "0 point"
                            else                   -> "invalide — 0 cinq"
                        },
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        color = when {
                            input.isEmpty()  -> Color(0xFF444444)
                            wouldWin         -> Color(0xFFFFD700)
                            isDivisible      -> MaterialTheme.colorScheme.secondary
                            else             -> MaterialTheme.colorScheme.tertiary
                        }
                    )
                }
            }

            // ── Scoreboard (scrollable) ───────────────────────────────────────
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(vertical = 8.dp)
            ) {
                itemsIndexed(state.playerNames) { i, name ->
                    val isCurrent = i == state.currentPlayer
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(
                                if (isCurrent) Color(0xFF2A2A3E)
                                else Color(0xFF1E1E1E)
                            )
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isCurrent) "▶" else " ",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.width(14.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = name,
                            fontSize = 13.sp,
                            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                            color = if (isCurrent) MaterialTheme.colorScheme.onBackground
                                    else Color(0xFF777777),
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(Modifier.width(12.dp))
                        LinearProgressIndicator(
                            progress = state.fives[i].toFloat() / FIFTY_ONE_TARGET,
                            modifier = Modifier
                                .weight(1f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = if (isCurrent) MaterialTheme.colorScheme.secondary
                                    else Color(0xFF444444),
                            trackColor = Color(0xFF252525)
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = "${state.fives[i]}/51",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isCurrent) MaterialTheme.colorScheme.onBackground
                                    else Color(0xFF666666),
                            textAlign = TextAlign.End,
                            modifier = Modifier.width(48.dp)
                        )
                    }
                }
            }

            // ── Sound buttons ─────────────────────────────────────────────────
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
                        .clickable { playSound(R.raw.miss) },
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
                            val r = if (Math.random() < 0.5) R.raw.mexicaine1 else R.raw.mexicaine2
                            playSound(r)
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
                        .clickable { playSound(R.raw.gaufre) },
                    contentAlignment = Alignment.Center
                ) {
                    Text("GAUFRE", fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        color = Color(0xFFFFCC00), letterSpacing = 2.sp)
                }
            }

            // ── Numpad ────────────────────────────────────────────────────────
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    listOf("7", "8", "9"),
                    listOf("4", "5", "6"),
                    listOf("1", "2", "3"),
                    listOf("⌫", "0", "✓")
                ).forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        row.forEach { key ->
                            val isOk  = key == "✓"
                            val isDel = key == "⌫"
                            val bgColor = when {
                                isOk && isDivisible -> MaterialTheme.colorScheme.secondary
                                isOk                -> Color(0xFF1E1E1E)
                                isDel               -> Color(0xFF1E1E1E)
                                else                -> Color(0xFF1E1E1E)
                            }
                            val borderColor = when {
                                isOk && isDivisible -> MaterialTheme.colorScheme.secondary
                                isOk                -> Color(0xFF333333)
                                isDel               -> Color(0xFF333333)
                                else                -> Color(0xFF333333)
                            }
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .height(52.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(bgColor)
                                    .border(1.dp, borderColor, RoundedCornerShape(8.dp))
                                    .clickable {
                                        when {
                                            isOk  -> confirmTurn()
                                            isDel -> deleteDigit()
                                            else  -> appendDigit(key)
                                        }
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = key,
                                    fontSize = if (isOk || isDel) 20.sp else 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = when {
                                        isOk && isDivisible -> MaterialTheme.colorScheme.onPrimary
                                        isOk                -> Color(0xFF555555)
                                        isDel               -> Color(0xFF777777)
                                        else                -> MaterialTheme.colorScheme.onBackground
                                    }
                                )
                            }
                        }
                    }
                }
            }

            // ── Undo button ───────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .padding(bottom = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        if (history.isNotEmpty()) Color(0xFF1E1E1E)
                        else Color(0xFF141414)
                    )
                    .border(
                        1.dp,
                        if (history.isNotEmpty()) Color(0xFF333333)
                        else Color(0xFF1A1A1A),
                        RoundedCornerShape(8.dp)
                    )
                    .clickable(enabled = history.isNotEmpty(), onClick = ::undo),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "↩  Annuler",
                    fontSize = 12.sp,
                    color = if (history.isNotEmpty()) Color(0xFF888888) else Color(0xFF333333),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }

    // ── Winner dialog ────────────────────────────────────────────────────────
    if (state.winner != null) {
        AlertDialog(
            onDismissRequest = {},
            title = {
                Text(
                    "🎯  ${state.playerNames[state.winner!!]}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp
                )
            },
            text = {
                Text(
                    "51 cinqs atteints — victoire !",
                    fontSize = 15.sp,
                    color = MaterialTheme.colorScheme.onSurface
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    state = initialFiftyOneState(playerNames)
                    history.clear()
                    input = ""
                }) { Text("REVANCHE") }
            },
            dismissButton = {
                TextButton(onClick = onBack) { Text("QUITTER") }
            },
            containerColor = MaterialTheme.colorScheme.surface
        )
    }

    // ── Exit confirmation ────────────────────────────────────────────────────
    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            title = { Text("Quitter la partie ?") },
            confirmButton = {
                TextButton(onClick = onBack) { Text("QUITTER") }
            },
            dismissButton = {
                TextButton(onClick = { showExitDialog = false }) { Text("CONTINUER") }
            },
            containerColor = MaterialTheme.colorScheme.surface
        )
    }
}

