package com.darts.counter

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.animation.AccelerateInterpolator
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.animation.doOnEnd
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.darts.counter.ui.DartsApp
import com.darts.counter.ui.theme.DartsTheme

class MainActivity : ComponentActivity() {

    private val splashViewModel: SplashViewModel by viewModels()

    private var soundPool: SoundPool? = null
    private var dartsSoundId: Int = 0
    private var wowSoundId: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)

        splashScreen.setKeepOnScreenCondition {
            !splashViewModel.isReady.value
        }

        // Exit: icon explodes outward (shockwave), screen fades out.
        splashScreen.setOnExitAnimationListener { provider ->
            val icon = provider.iconView
            val iconScaleX = ObjectAnimator.ofFloat(icon, View.SCALE_X, 1f, 1.6f)
            val iconScaleY = ObjectAnimator.ofFloat(icon, View.SCALE_Y, 1f, 1.6f)
            val iconAlpha  = ObjectAnimator.ofFloat(icon, View.ALPHA,   1f, 0f)
            val bgAlpha    = ObjectAnimator.ofFloat(provider.view, View.ALPHA, 1f, 0f)

            AnimatorSet().apply {
                playTogether(iconScaleX, iconScaleY, iconAlpha, bgAlpha)
                duration = 280L
                interpolator = AccelerateInterpolator(1.8f)
                doOnEnd { provider.remove() }
                start()
            }
        }

        initSoundPool()

        val handler = Handler(Looper.getMainLooper())

        // darts.wav — dart hits the bullseye (sync'd with end of 750 ms fly-in).
        handler.postDelayed({
            soundPool?.play(dartsSoundId, 1f, 1f, 1, 0, 1f)
            triggerHaptic()
        }, 100L)

        // wow.wav — crowd reaction, played right after the impact sound.
        handler.postDelayed({
            soundPool?.play(wowSoundId, 1f, 1f, 1, 0, 1f)
        }, 600L)

        setContent {
            DartsTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    DartsApp()
                }
            }
        }
    }

    // ── Sound ─────────────────────────────────────────────────────────────────

    private fun initSoundPool() {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        soundPool = SoundPool.Builder()
            .setMaxStreams(2)
            .setAudioAttributes(attrs)
            .build()

        dartsSoundId = soundPool?.load(this, R.raw.darts, 1) ?: 0
        wowSoundId   = soundPool?.load(this, R.raw.wow,   1) ?: 0
    }

    // ── Haptic ────────────────────────────────────────────────────────────────

    @Suppress("DEPRECATION")
    private fun triggerHaptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.vibrate(
                    VibrationEffect.createOneShot(40L, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val v = getSystemService(VIBRATOR_SERVICE) as Vibrator
                v.vibrate(VibrationEffect.createOneShot(40L, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (_: Exception) {
            // Vibration unavailable — silent fallback.
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onDestroy() {
        super.onDestroy()
        soundPool?.release()
        soundPool = null
    }
}
