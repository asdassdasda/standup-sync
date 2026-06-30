// ========================================================
// Speaking timer — custom duration + early end
// Listener mode — TTS reads current speaker's text aloud
// ========================================================
import { ref, computed, onUnmounted } from 'vue'

export function useSpeakerTimer() {
  const durationMinutes = ref(2)        // Default 2 min
  const remainingSeconds = ref(0)
  const isSpeaking = ref(false)
  const timerInterval = ref(null)
  const isListening = ref(false)       // Listener mode
  let synth = null
  let utterance = null

  const formatted = computed(() => {
    const m = Math.floor(remainingSeconds.value / 60)
    const s = remainingSeconds.value % 60
    return `${m}:${String(s).padStart(2, '0')}`
  })

  const isWarning = computed(() => remainingSeconds.value <= 30 && remainingSeconds.value > 0)

  // --- Speaker: start timer ---
  function startTimer(mins) {
    durationMinutes.value = mins || 2
    remainingSeconds.value = mins * 60
    isSpeaking.value = true
    stopTimer()
    timerInterval.value = setInterval(() => {
      if (remainingSeconds.value > 0) {
        remainingSeconds.value--
      } else {
        stopTimer()
        isSpeaking.value = false
      }
    }, 1000)
  }

  function stopTimer() {
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
      timerInterval.value = null
    }
  }

  function endEarly() {
    stopTimer()
    isSpeaking.value = false
    remainingSeconds.value = 0
  }

  // --- Listener: TTS read aloud ---
  function startListening() {
    if (!('speechSynthesis' in window)) return false
    isListening.value = true
    synth = window.speechSynthesis
    return true
  }

  function speakText(text) {
    if (!isListening.value || !text || !synth) return
    // Cancel any current speech
    synth.cancel()
    utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.0
    utterance.pitch = 1.0
    synth.speak(utterance)
  }

  function stopListening() {
    isListening.value = false
    if (synth) synth.cancel()
  }

  onUnmounted(() => {
    stopTimer()
    stopListening()
  })

  return {
    durationMinutes, remainingSeconds, isSpeaking, formatted, isWarning,
    startTimer, stopTimer, endEarly,
    isListening, startListening, speakText, stopListening
  }
}
