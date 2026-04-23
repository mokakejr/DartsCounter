package com.darts.counter.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PlayerSetupScreen(
    playerCount: Int,
    onBack: () -> Unit,
    onConfirm: (List<String>) -> Unit
) {
    val context = LocalContext.current
    var names by remember { mutableStateOf(List(playerCount) { "J${it + 1}" }) }
    var focusedIndex by remember { mutableStateOf(0) }
    val knownPlayers = remember { loadKnownPlayers(context) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("JOUEURS", fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        letterSpacing = 3.sp, color = MaterialTheme.colorScheme.onBackground)
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, null, tint = MaterialTheme.colorScheme.onBackground)
                    }
                },
                actions = {
                    // Shuffle button
                    Box(
                        modifier = Modifier
                            .padding(end = 8.dp)
                            .size(40.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF1E1E1E))
                            .clickable { names = names.shuffled() },
                        contentAlignment = Alignment.Center
                    ) {
                        Text("⇄", fontSize = 20.sp, color = Color(0xFF666666))
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
                .padding(horizontal = 20.dp),
        ) {
            Spacer(Modifier.height(12.dp))

            // Player name fields
            names.forEachIndexed { i, name ->
                val isSelected = focusedIndex == i
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(if (isSelected) MaterialTheme.colorScheme.primary else Color(0xFF252525))
                            .border(1.dp,
                                if (isSelected) MaterialTheme.colorScheme.primary else Color(0xFF333333),
                                CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "${i + 1}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else Color(0xFF555555)
                        )
                    }

                    OutlinedTextField(
                        value = name,
                        onValueChange = { new -> names = names.toMutableList().also { it[i] = new } },
                        singleLine = true,
                        modifier = Modifier
                            .weight(1f)
                            .onFocusChanged { fs -> if (fs.isFocused) focusedIndex = i },
                        trailingIcon = {
                            if (name.isNotEmpty()) {
                                IconButton(
                                    onClick = { names = names.toMutableList().also { it[i] = "" } },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.Close, null, tint = Color(0xFF444444),
                                        modifier = Modifier.size(14.dp))
                                }
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            imeAction = if (i < playerCount - 1) ImeAction.Next else ImeAction.Done
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color(0xFFE0E0E0),
                            unfocusedTextColor = Color(0xFFAAAAAA),
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = Color(0xFF2A2A2A),
                            cursorColor = MaterialTheme.colorScheme.primary,
                            focusedContainerColor = Color(0xFF1A1A1A),
                            unfocusedContainerColor = Color(0xFF141414)
                        )
                    )
                }
            }

            // Known players section
            if (knownPlayers.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                Text("RÉCENTS", fontSize = 10.sp, color = Color(0xFF444444), letterSpacing = 2.sp)
                Spacer(Modifier.height(10.dp))
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    knownPlayers.forEach { known ->
                        val alreadyUsed = names.any { it.trim().equals(known.trim(), ignoreCase = true) }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(if (alreadyUsed) Color(0xFF151515) else Color(0xFF1E1E1E))
                                .border(
                                    1.dp,
                                    if (alreadyUsed) Color(0xFF1E1E1E) else Color(0xFF333333),
                                    RoundedCornerShape(20.dp)
                                )
                                .clickable(enabled = !alreadyUsed) {
                                    names = names.toMutableList().also { it[focusedIndex] = known }
                                    focusedIndex = (focusedIndex + 1) % playerCount
                                }
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                known,
                                fontSize = 13.sp,
                                color = if (alreadyUsed) Color(0xFF2A2A2A) else Color(0xFF999999),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable {
                        val finalNames = names.mapIndexed { i, n -> n.trim().ifBlank { "J${i + 1}" } }
                        addToKnownPlayers(context, finalNames)
                        onConfirm(finalNames)
                    },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "COMMENCER",
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    letterSpacing = 3.sp
                )
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

private fun loadKnownPlayers(context: Context): List<String> {
    val prefs = context.getSharedPreferences("darts_prefs", Context.MODE_PRIVATE)
    val str = prefs.getString("known_players", "") ?: ""
    return if (str.isBlank()) emptyList() else str.split("|").filter { it.isNotBlank() }
}

private fun addToKnownPlayers(context: Context, newNames: List<String>) {
    val prefs = context.getSharedPreferences("darts_prefs", Context.MODE_PRIVATE)
    val existing = loadKnownPlayers(context).toMutableList()
    // Only save real names, not default "J1", "J2"...
    val toSave = newNames.filter { it.isNotBlank() && !it.matches(Regex("J\\d+")) }
    for (name in toSave.reversed()) {
        existing.remove(name)
        existing.add(0, name)
    }
    prefs.edit().putString("known_players", existing.take(20).joinToString("|")).apply()
}
