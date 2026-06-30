import { ref, onUnmounted } from 'vue'

// Check support once at module level
const SUPPORTED = (function() {
  try {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  } catch { return false }
})()

export function useSpeechRecognition() {
  const isListening = ref(false)
  const interimText = ref('')
  const finalText = ref('')
  const errorMsg = ref('')
  const isSupported = SUPPORTED  // constant, not ref

  let recognition = null
  let restartCount = 0
  const MAX_RESTARTS = 20
  const RESTART_DELAY = 200

  function startListening() {
    if (!isSupported) {
      errorMsg.value = '浏览器不支持语音识别，请使用 Chrome 或 Edge'
      return false
    }
    interimText.value = ''
    finalText.value = ''
    errorMsg.value = ''
    restartCount = 0
    try {
      _startOneSession()
      isListening.value = true
      return true
    } catch (e) {
      errorMsg.value = '语音识别启动失败'
      return false
    }
  }

  function _startOneSession() {
    if (restartCount >= MAX_RESTARTS) {
      stopListening()
      errorMsg.value = '已达到最大识别时长'
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition = new SR()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = '', final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (final) finalText.value += final
      interimText.value = interim
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        restartCount++
        setTimeout(() => { if (isListening.value) _startOneSession() }, RESTART_DELAY)
        return
      }
      if (event.error === 'aborted') return
      errorMsg.value = event.error === 'not-allowed' ? '请允许麦克风权限' : `语音错误: ${event.error}`
      stopListening()
    }

    recognition.onend = () => {
      if (isListening.value) {
        restartCount++
        setTimeout(() => { if (isListening.value) _startOneSession() }, RESTART_DELAY)
      } else {
        if (interimText.value) { finalText.value += interimText.value; interimText.value = '' }
      }
    }

    recognition.start()
  }

  function stopListening() {
    isListening.value = false
    // Use stop() to get pending results, then flush immediately
    if (recognition) {
      try { recognition.stop() } catch {}
      // Small delay to let onresult fire before cleaning up
      setTimeout(() => {
        if (interimText.value) {
          finalText.value += interimText.value
          interimText.value = ''
        }
        recognition = null
      }, 150)
    } else {
      if (interimText.value) {
        finalText.value += interimText.value
        interimText.value = ''
      }
    }
  }

  function cancelListening() {
    interimText.value = ''; finalText.value = ''
    if (recognition) { try { recognition.abort() } catch {}; recognition = null }
    isListening.value = false
  }

  function reset() { stopListening(); interimText.value = ''; finalText.value = ''; errorMsg.value = '' }

  onUnmounted(() => { stopListening() })

  return { isListening, interimText, finalText, errorMsg, isSupported, startListening, stopListening, cancelListening, reset }
}
