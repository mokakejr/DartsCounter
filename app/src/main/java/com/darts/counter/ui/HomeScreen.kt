package com.darts.counter.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import android.view.HapticFeedbackConstants
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlinx.coroutines.delay

@Composable
fun HomeScreen(
    onStartCricket: (players: Int, mode: String) -> Unit,
    onStartShanghai: (Int) -> Unit
) {
    var selectedMode by remember { mutableStateOf<String?>(null) }
    var selectedCricketVariant by remember { mutableStateOf("normal") }
    var selectedPlayers by remember { mutableStateOf(2) }

    var isDart by remember { mutableStateOf(false) }
    var rotation by remember { mutableStateOf(0f) }
    var angularVelocity by remember { mutableStateOf(0f) }
    val view = LocalView.current
    val lastHapticAt = remember { floatArrayOf(0f) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(16)
            if (abs(angularVelocity) > 0.15f) {
                rotation += angularVelocity
                angularVelocity *= 0.97f
                if (abs(rotation - lastHapticAt[0]) >= 25f) {
                    view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    lastHapticAt[0] = rotation
                }
            } else {
                angularVelocity = 0f
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Icon — tap 🎯 to get dart, tap/barely-drag dart to return
        Box(
            modifier = Modifier.size(72.dp),
            contentAlignment = Alignment.Center
        ) {
            if (!isDart) {
                Text(
                    text = "🎯",
                    fontSize = 56.sp,
                    modifier = Modifier.clickable { isDart = true }
                )
            } else {
                Canvas(
                    modifier = Modifier
                        .size(64.dp)
                        .rotate(rotation)
                        .pointerInput(Unit) {
                            var totalDrag = 0f
                            detectDragGestures(
                                onDragStart = { totalDrag = 0f; lastHapticAt[0] = rotation },
                                onDragEnd = { if (totalDrag < 14f) isDart = false },
                                onDrag = { change, delta ->
                                    change.consume()
                                    totalDrag += abs(delta.x) + abs(delta.y)
                                    angularVelocity = delta.x * 0.9f
                                    rotation += delta.x * 0.5f
                                    if (abs(rotation - lastHapticAt[0]) >= 25f) {
                                        view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                                        lastHapticAt[0] = rotation
                                    }
                                }
                            )
                        }
                ) { drawDart() }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "FLÉCHETTES",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            letterSpacing = 4.sp
        )

        Spacer(modifier = Modifier.height(40.dp))

        Text(text = "MODE DE JEU", fontSize = 11.sp, color = Color(0xFF666666),
            letterSpacing = 2.sp, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ModeButton("CRICKET", selectedMode == "cricket", Modifier.weight(1f)) { selectedMode = "cricket" }
            ModeButton("SHANGHAI", selectedMode == "shanghai", Modifier.weight(1f)) { selectedMode = "shanghai" }
        }

        // Fixed-height box: always occupies the same space, no layout shift
        Box(
            modifier = Modifier.fillMaxWidth().height(152.dp),
            contentAlignment = Alignment.TopStart
        ) {
            if (selectedMode == "cricket") {
                Column(modifier = Modifier.padding(top = 14.dp).fillMaxWidth()) {
                    Text(text = "VARIANTE", fontSize = 11.sp, color = Color(0xFF666666),
                        letterSpacing = 2.sp, modifier = Modifier.fillMaxWidth())
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        ModeButton("NORMAL", selectedCricketVariant == "normal", Modifier.weight(1f)) { selectedCricketVariant = "normal" }
                        ModeButton("CUT THROAT", selectedCricketVariant == "cutthroat", Modifier.weight(1f)) { selectedCricketVariant = "cutthroat" }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        ModeButton("SUPER", selectedCricketVariant == "super", Modifier.weight(1f)) { selectedCricketVariant = "super" }
                        ModeButton("SUPER CUT", selectedCricketVariant == "superct", Modifier.weight(1f)) { selectedCricketVariant = "superct" }
                    }
                }
            }
        }

        Text(text = "JOUEURS", fontSize = 11.sp, color = Color(0xFF666666),
            letterSpacing = 2.sp, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(2, 3, 4, 5).forEach { count ->
                PlayerButton(count, selectedPlayers == count, Modifier.weight(1f)) { selectedPlayers = count }
            }
        }

        Spacer(modifier = Modifier.height(40.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (selectedMode != null) MaterialTheme.colorScheme.primary else Color(0xFF2A2A2A))
                .clickable(enabled = selectedMode != null) {
                    when (selectedMode) {
                        "cricket" -> onStartCricket(selectedPlayers, selectedCricketVariant)
                        "shanghai" -> onStartShanghai(selectedPlayers)
                    }
                },
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "COMMENCER",
                color = if (selectedMode != null) MaterialTheme.colorScheme.onPrimary else Color(0xFF444444),
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                letterSpacing = 3.sp
            )
        }
    }
}

private fun DrawScope.drawDart() {
    val cx = size.width / 2f
    val h = size.height

    // Tip — silver
    val tip = Path().apply {
        moveTo(cx, 0f)
        lineTo(cx - size.width * 0.055f, h * 0.16f)
        lineTo(cx + size.width * 0.055f, h * 0.16f)
        close()
    }
    drawPath(tip, Color(0xFFCCCCCC))

    // Barrel — brass
    drawRoundRect(
        color = Color(0xFFB8882A),
        topLeft = Offset(cx - size.width * 0.085f, h * 0.16f),
        size = Size(size.width * 0.17f, h * 0.42f),
        cornerRadius = CornerRadius(size.width * 0.04f)
    )

    // Shaft — dark grey line
    drawLine(
        color = Color(0xFF444444),
        start = Offset(cx, h * 0.58f),
        end = Offset(cx, h * 0.72f),
        strokeWidth = size.width * 0.055f
    )

    // Flights — blue triangles
    val flightL = Path().apply {
        moveTo(cx, h * 0.72f)
        lineTo(cx - size.width * 0.30f, h * 0.98f)
        lineTo(cx, h * 0.89f)
        close()
    }
    val flightR = Path().apply {
        moveTo(cx, h * 0.72f)
        lineTo(cx + size.width * 0.30f, h * 0.98f)
        lineTo(cx, h * 0.89f)
        close()
    }
    drawPath(flightL, Color(0xFF2266CC))
    drawPath(flightR, Color(0xFF2266CC))
}

@Composable
fun ModeButton(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary else Color(0xFF1E1E1E))
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else Color(0xFF333333), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = if (selected) MaterialTheme.colorScheme.onPrimary else Color(0xFF888888),
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            fontSize = 13.sp,
            letterSpacing = 2.sp
        )
    }
}

@Composable
fun PlayerButton(count: Int, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary else Color(0xFF1E1E1E))
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else Color(0xFF333333), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "$count",
            color = if (selected) MaterialTheme.colorScheme.onPrimary else Color(0xFF888888),
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            fontSize = 18.sp
        )
    }
}
