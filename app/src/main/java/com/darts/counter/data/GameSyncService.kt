package com.darts.counter.data

import android.util.Base64
import android.util.Log
import com.darts.counter.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object GameSyncService {

    private val isoFmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    suspend fun sync(game: GameResultEntity) = withContext(Dispatchers.IO + NonCancellable) {
        runCatching { updateGitHubPages(game) }
            .onFailure { Log.e("GameSync", "GitHub update failed", it) }
        runCatching { sendGoogleChatMessage(game) }
            .onFailure { Log.e("GameSync", "Google Chat webhook failed", it) }
    }

    // --- GitHub Contents API ---

    private fun updateGitHubPages(game: GameResultEntity) {
        val token = BuildConfig.GITHUB_TOKEN
        val owner = BuildConfig.GITHUB_REPO_OWNER
        val repo = BuildConfig.GITHUB_REPO_NAME
        if (token.isBlank() || owner.isBlank() || repo.isBlank()) return

        val apiUrl = "https://api.github.com/repos/$owner/$repo/contents/docs/data/games.json"

        // GET current file
        val (currentContent, sha) = getFile(apiUrl, token)

        // Decode + parse existing games list
        val decoded = if (currentContent.isNotBlank())
            String(Base64.decode(currentContent.replace("\\n", "").replace("\n", ""), Base64.DEFAULT))
        else "[]"

        val newEntry = gameToJson(game)
        val updatedJson = insertEntry(decoded, newEntry)

        // PUT updated file (omit sha when creating a new file)
        val shaField = if (sha.isNotBlank()) ""","sha":"$sha"""" else ""
        val body = """{"message":"chore: add game result","content":"${
            Base64.encodeToString(updatedJson.toByteArray(), Base64.NO_WRAP)
        }"$shaField}"""

        putFile(apiUrl, token, body)
    }

    private fun getFile(apiUrl: String, token: String): Pair<String, String> {
        val conn = (URL(apiUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
        }
        return if (conn.responseCode == 200) {
            val response = conn.inputStream.bufferedReader().readText()
            val content = extractJsonString(response, "content")
            val sha = extractJsonString(response, "sha")
            Pair(content, sha)
        } else {
            Pair("", "")
        }
    }

    private fun putFile(apiUrl: String, token: String, body: String) {
        val conn = (URL(apiUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "PUT"
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
        }
        conn.outputStream.bufferedWriter().use { it.write(body) }
        val code = conn.responseCode
        if (code >= 400) {
            val error = conn.errorStream?.bufferedReader()?.readText() ?: "HTTP $code"
            throw RuntimeException("GitHub PUT failed ($code): $error")
        }
        conn.inputStream.close()
    }

    // --- Google Chat ---

    private fun sendGoogleChatMessage(game: GameResultEntity) {
        val webhookUrl = BuildConfig.GOOGLE_CHAT_WEBHOOK
        if (webhookUrl.isBlank()) return

        val players = parseJsonArray(game.playerNames)
        val scores = parseJsonArray(game.scores)
        val isShanghai = game.mode == "Shanghai"
        val isShanghaiKill = isShanghai && game.variant == "Shanghai Kill"
        val modeLabel = if (isShanghaiKill) "SHANGHAI KILL 🎯"
            else if (game.variant.isNotBlank() && game.variant != "Normal") "${game.mode} · ${game.variant}"
            else game.mode
        val isCutThroat = game.variant.contains("CutThroat", ignoreCase = true)

        val entries = players.zip(scores).map { (n, s) -> Pair(n, s) }
        val (winnerEntries, otherEntries) = entries.partition { it.first == game.winnerName }
        val others = otherEntries.sortedWith(
            if (isCutThroat) compareBy { it.second.toIntOrNull() ?: 0 }
            else compareByDescending { it.second.toIntOrNull() ?: 0 }
        )
        val sorted = winnerEntries + others
        val total = sorted.size

        val rankEmojis = listOf("🥇", "🥈", "🥉", "🪓", "💀")

        val playerRows = sorted.mapIndexed { rank, (name, score) ->
            val emoji = rankEmojis.getOrElse(rank) { "🎯" }
            val statusText: String; val colorJson: String
            when {
                rank == 0         -> { statusText = "VAINQUEUR"; colorJson = """"red":0,"green":0.8,"blue":0,"alpha":1""" }
                rank == total - 1 -> { statusText = "ELIMINE";   colorJson = """"red":1,"green":0,"blue":0,"alpha":1""" }
                else              -> { statusText = "QUALIFIE";  colorJson = """"red":0,"green":0.5,"blue":1,"alpha":1""" }
            }
            val safeName = jsonEscape(name)
            val scoreText = if (isShanghaiKill && rank == 0) "SHANGHAI!" else "$score pts"
            """{"columns":{"columnItems":[""" +
            """{"widgets":[{"textParagraph":{"text":"$emoji $safeName"}}]},""" +
            """{"widgets":[{"textParagraph":{"text":"$scoreText"}}]},""" +
            """{"widgets":[{"buttonList":{"buttons":[{"text":"$statusText","color":{$colorJson}}]}}]}""" +
            """]}}"""
        }.joinToString(",")

        val duration = formatDuration(game.durationSeconds)
        val statsUrl = "https://${BuildConfig.GITHUB_REPO_OWNER}.github.io/${BuildConfig.GITHUB_REPO_NAME}"

        val card = """{"cardsV2":[{"cardId":"darts_result","card":{"header":{""" +
            """"title":"🎯 ${modeLabel.uppercase()} - LE VERDICT",""" +
            """"subtitle":"Partie terminée · $duration",""" +
            """"imageUrl":"https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg",""" +
            """"imageType":"CIRCLE"},"sections":[{"widgets":[""" +
            """{"columns":{"columnItems":[""" +
            """{"widgets":[{"textParagraph":{"text":"JOUEUR"}}]},""" +
            """{"widgets":[{"textParagraph":{"text":"SCORE"}}]},""" +
            """{"widgets":[{"textParagraph":{"text":"STATUT"}}]}""" +
            """]}},""" +
            """{"divider":{}},""" +
            playerRows +
            """,{"divider":{}},""" +
            """{"buttonList":{"buttons":[{"text":"VOIR LES STATS 📊","onClick":{"openLink":{"url":"$statsUrl"}}}]}}""" +
            """]}]}}]}"""

        val conn = (URL(webhookUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            doOutput = true
        }
        conn.outputStream.bufferedWriter().use { it.write(card) }
        val code = conn.responseCode
        if (code >= 400) {
            val error = conn.errorStream?.bufferedReader()?.readText() ?: "HTTP $code"
            throw RuntimeException("Google Chat webhook failed ($code): $error")
        }
        conn.inputStream.close()
    }

    // --- Helpers ---

    private fun jsonEscape(s: String) = s
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")

    private fun gameToJson(game: GameResultEntity): String {
        val date = isoFmt.format(Date(game.playedAt))
        val id = "${game.playedAt}"
        return """{"id":"$id","date":"$date","mode":"${game.mode}","variant":"${game.variant}","players":${game.playerNames},"scores":${game.scores},"winner":"${game.winnerName}","duration":${game.durationSeconds}}"""
    }

    private fun insertEntry(existingJson: String, newEntry: String): String {
        val trimmed = existingJson.trim()
        return if (trimmed == "[]" || trimmed.isBlank()) {
            "[$newEntry]"
        } else {
            // Prepend to array — keep max 200 entries
            val inner = trimmed.removePrefix("[").removeSuffix("]").trim()
            val entries = mutableListOf(newEntry)
            entries.add(inner)
            "[${entries.joinToString(",")}]"
        }
    }

    private fun formatDuration(seconds: Long): String {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    // Minimal JSON string extraction without a full parser
    private fun extractJsonString(json: String, key: String): String {
        val marker = "\"$key\":"
        val start = json.indexOf(marker) + marker.length
        if (start < marker.length) return ""
        val valueStart = json.indexOf('"', start) + 1
        val valueEnd = json.indexOf('"', valueStart)
        if (valueStart <= 0 || valueEnd < 0) return ""
        return json.substring(valueStart, valueEnd)
    }

    private fun parseJsonArray(json: String): List<String> {
        val trimmed = json.trim().removePrefix("[").removeSuffix("]")
        if (trimmed.isBlank()) return emptyList()
        return trimmed.split(",").map { it.trim().trim('"') }
    }
}
