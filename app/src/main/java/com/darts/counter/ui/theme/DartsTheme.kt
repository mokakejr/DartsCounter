package com.darts.counter.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ── Design tokens — Fléchettes / Target Precision ──────────────────────────
object DartsColors {
    // Brand
    val Primary   = Color(0xFFE61E2A) // Rouge Cible — CTA, selected, dart flights
    val Secondary = Color(0xFF1A237E) // Bleu Cobalt — active player, score confirm
    val Tertiary  = Color(0xFF2E7D32) // Vert Succès  — cricket closed, valid score

    // Backgrounds & surfaces
    val Background   = Color(0xFF0D1117)
    val Surface      = Color(0xFF161B22)
    val SurfaceAlt   = Color(0xFF1E1E1E) // Buttons unselected, grid cells
    val SurfaceDeep  = Color(0xFF141414) // Disabled button bg
    val SurfaceNavy  = Color(0xFF1A1A2E) // Score display box

    // Text
    val OnSurface = Color(0xFFE6EDF3)
    val Muted     = Color(0xFF8B949E) // Labels, subtitles
    val Disabled  = Color(0xFF444444)

    // Borders
    val Outline     = Color(0xFF30363D)
    val OutlineSoft = Color(0xFF2A2A2A)
    val OutlineDim  = Color(0xFF1A1A1A)

    // Semantic — sound buttons
    val MissBg      = Color(0xFF2A0A0A); val MissBorder  = Color(0xFFCC2222); val MissText    = Color(0xFFFF4444)
    val MexBg       = Color(0xFF061428); val MexBorder   = Color(0xFF1565C0); val MexText     = Color(0xFF42A5F5)
    val GaufreBg    = Color(0xFF1A1200); val GaufreBorder = Color(0xFF997700); val GaufreText  = Color(0xFFFFCC00)

    // Game
    val CricketClosed = Color(0xFF4CAF50)
    val WinnerGold    = Color(0xFFFFD700)
}

private val DarkColors = darkColorScheme(
    background  = DartsColors.Background,
    surface     = DartsColors.Surface,
    primary     = DartsColors.Primary,
    onPrimary   = Color.White,
    secondary   = DartsColors.Secondary,
    onSecondary = Color.White,
    tertiary    = DartsColors.Tertiary,
    onTertiary  = Color.White,
    onBackground = DartsColors.OnSurface,
    onSurface    = DartsColors.OnSurface,
    outline      = DartsColors.Outline,
)

@Composable
fun DartsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        content = content
    )
}
