<template>
  <div>
    <!-- Single unified input (default) -->
    <div v-if="!showManual">
      <div class="field-header">
        <h4>站会发言</h4>
        <div class="header-actions">
          <!-- Speaking timer display -->
          <span v-if="timer.isSpeaking.value" class="speaking-timer" :class="{ warning: timer.isWarning.value }">
            🎤 {{ timer.formatted.value }}
            <el-button link size="small" type="danger" @click="endSpeaking">提前结束</el-button>
          </span>
          <!-- Mic + duration selector -->
          <template v-if="voice.isSupported && !timer.isSpeaking.value">
            <el-dropdown v-if="!recordingField" trigger="click" @command="startWithDuration">
              <el-button size="small" circle :disabled="disabled" title="语音输入（可选时长）">
                <el-icon><Microphone /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="1">1 分钟</el-dropdown-item>
                  <el-dropdown-item command="2">2 分钟</el-dropdown-item>
                  <el-dropdown-item command="3">3 分钟</el-dropdown-item>
                  <el-dropdown-item command="5">5 分钟</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button v-else :type="recordingField === 'all' ? 'danger' : 'default'"
              size="small" circle @click="toggleVoice('all')" :disabled="disabled" title="停止语音">
              <el-icon><CloseBold /></el-icon>
            </el-button>
          </template>
          <el-button link type="primary" size="small" @click="showManual = true" title="手动分区填写">
            手动分区
          </el-button>
        </div>
      </div>
      <el-input
        :model-value="unified"
        @update:model-value="onUnifiedChange"
        type="textarea" :rows="6"
        placeholder="自由输入站会发言内容，AI将自动分区为昨日完成/今日计划/阻碍...&#10;&#10;也可以点击「手动分区」切换到三栏模式"
        :disabled="disabled"
        maxlength="8000"
      />
      <div v-if="recordingField === 'all' && voice.interimText.value" class="interim-text">
        {{ voice.interimText.value }}
      </div>
    </div>

    <!-- Manual three-column mode -->
    <div v-else>
      <div class="field-header" style="margin-bottom: 8px;">
        <h4>手动分区填写</h4>
        <el-button link type="primary" size="small" @click="mergeToUnified(); showManual = false">
          合并为自由输入
        </el-button>
      </div>

      <div class="item-block" :class="{ recording: recordingField === 'yesterday' }">
        <div class="field-header">
          <span class="field-label">昨天做了什么</span>
          <el-button v-if="voice.isSupported"
            :type="recordingField === 'yesterday' ? 'danger' : 'default'"
            size="small" circle @click="toggleVoice('yesterday')"
            :disabled="disabled" title="语音输入">
            <el-icon><Microphone /></el-icon>
          </el-button>
        </div>
        <el-input :model-value="yesterday" @update:model-value="$emit('update:yesterday', $event)"
          type="textarea" rows="2" placeholder="输入昨天完成的工作..."
          :disabled="disabled" maxlength="3000" />
        <div v-if="recordingField === 'yesterday' && voice.interimText.value" class="interim-text">{{ voice.interimText.value }}</div>
      </div>

      <div class="item-block" :class="{ recording: recordingField === 'today' }">
        <div class="field-header">
          <span class="field-label">今天要做什么</span>
          <el-button v-if="voice.isSupported"
            :type="recordingField === 'today' ? 'danger' : 'default'"
            size="small" circle @click="toggleVoice('today')"
            :disabled="disabled" title="语音输入">
            <el-icon><Microphone /></el-icon>
          </el-button>
        </div>
        <el-input :model-value="today" @update:model-value="$emit('update:today', $event)"
          type="textarea" rows="2" placeholder="输入今天的计划..."
          :disabled="disabled" maxlength="3000" />
        <div v-if="recordingField === 'today' && voice.interimText.value" class="interim-text">{{ voice.interimText.value }}</div>
      </div>

      <div class="item-block" :class="{ recording: recordingField === 'blockers' }">
        <div class="field-header">
          <span class="field-label">有什么阻碍</span>
          <el-button v-if="voice.isSupported"
            :type="recordingField === 'blockers' ? 'danger' : 'default'"
            size="small" circle @click="toggleVoice('blockers')"
            :disabled="disabled" title="语音输入">
            <el-icon><Microphone /></el-icon>
          </el-button>
        </div>
        <el-input :model-value="blockers" @update:model-value="$emit('update:blockers', $event)"
          type="textarea" rows="2" placeholder="输入遇到的阻碍（可选）..."
          :disabled="disabled" maxlength="2000" />
        <div v-if="recordingField === 'blockers' && voice.interimText.value" class="interim-text">{{ voice.interimText.value }}</div>
      </div>
    </div>

    <div v-if="!voice.isSupported" class="voice-hint">
      语音输入需要 Chrome 或 Edge 浏览器
    </div>
    <div v-if="voice.errorMsg.value" class="voice-error">
      {{ voice.errorMsg.value }}
      <el-button link type="primary" size="small" @click="voice.reset()">关闭</el-button>
    </div>

    <el-button v-if="showSubmit" type="primary" style="margin-top: 16px;" @click="handleSubmit">
      发言完毕
    </el-button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useSpeechRecognition } from '../../composables/useSpeechRecognition'
import { useSpeakerTimer } from '../../composables/useSpeakerTimer'

const props = defineProps({
  yesterday: { type: String, default: '' },
  today: { type: String, default: '' },
  blockers: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  showSubmit: { type: Boolean, default: true }
})

const emit = defineEmits(['update:yesterday', 'update:today', 'update:blockers', 'submit'])

const voice = useSpeechRecognition()
const timer = useSpeakerTimer()
const recordingField = ref(null)
const showManual = ref(false)
const unified = ref('')

function startWithDuration(mins) {
  timer.startTimer(parseInt(mins))
  recordingField.value = 'all'
  voice.finalText.value = ''
  voice.startListening()
}

function endSpeaking() {
  timer.endEarly()
  voice.stopListening()
  // onend will flush remaining text → watcher auto-fills
  recordingField.value = null
}

// Merge existing 3-field content into unified display
function syncUnified() {
  const parts = []
  if (props.yesterday) parts.push(props.yesterday)
  if (props.today) parts.push(props.today)
  if (props.blockers) parts.push(props.blockers)
  unified.value = parts.join('\n\n')
}
syncUnified()

// Watch finalText — auto-fill into the active field IMMEDIATELY
watch(() => voice.finalText.value, (val) => {
  if (!val || !recordingField.value) return
  const text = val.trim()
  if (!text) return
  appendToField(recordingField.value, text)
  voice.finalText.value = ''  // Consume the text
}, { flush: 'sync' })  // Fire immediately, not batched

function appendToField(field, text) {
  if (field === 'all') {
    unified.value = unified.value ? unified.value + '\n' + text : text
    emit('update:yesterday', unified.value)
  } else {
    const current = props[field] || ''
    emit(`update:${field}`, current ? current + '\n' + text : text)
  }
}

function onUnifiedChange(val) {
  unified.value = val
  emit('update:yesterday', val)
  emit('update:today', '')
  emit('update:blockers', '')
}

function mergeToUnified() { syncUnified() }
function handleSubmit() { emit('submit') }

function toggleVoice(field) {
  if (recordingField.value === field) {
    // Stop recording → flush any remaining interim text
    voice.stopListening()
    // onend will trigger finalText watch above, which auto-fills
    recordingField.value = null
  } else {
    // Switch to new field — stop current first
    if (recordingField.value) {
      voice.stopListening()
      recordingField.value = null
    }
    // Start on new field
    voice.finalText.value = ''
    voice.startListening()
    recordingField.value = field
  }
}

// Auto-stop voice when timer expires
watch(() => timer.isSpeaking.value, (val) => {
  if (!val && recordingField.value) {
    voice.stopListening()
    recordingField.value = null
  }
})
</script>

<style scoped>
.field-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.field-header h4 { margin: 0; font-size: 14px; color: var(--text-primary); }
.field-label { font-size: 13px; color: var(--text-secondary); }
.header-actions { display: flex; align-items: center; gap: 8px; }
.item-block { margin-top: 12px; transition: box-shadow 0.2s; }
.item-block.recording { box-shadow: 0 0 0 2px #F56C6C; border-radius: 6px; padding: 6px; background: rgba(245,108,108,0.03); }
.interim-text { margin-top: 6px; padding: 8px 12px; background: #fef0f0; border-radius: 4px; font-size: 13px; color: #909399; font-style: italic; }
.voice-hint { margin-top: 4px; font-size: 12px; color: #909399; }
.voice-error { margin-top: 8px; padding: 8px 12px; background: #fef0f0; border-radius: 4px; font-size: 13px; color: #F56C6C; }
.speaking-timer {
  font-size: 14px; font-weight: 600; color: #4094ED;
  display: flex; align-items: center; gap: 6px;
}
.speaking-timer.warning { color: #E6A23C; animation: pulse 1s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
</style>
