<template>
  <div>
    <!-- Toolbar -->
    <div class="toolbar">
      <!-- Voice Call -->
      <el-button
        :type="webrtc.callStatus === 'idle' ? 'primary' : 'success'"
        @click="toggleVoiceCall"
        :loading="webrtc.callStatus === 'connecting'"
        :disabled="!wsReady"
        :title="!wsReady ? 'WebSocket 连接中...' : ''"
      >
        {{ voiceCallLabel }}
      </el-button>
      <el-button v-if="webrtc.callStatus === 'in-call'"
        :type="webrtc.isMuted ? 'warning' : 'info'"
        @click="webrtc.toggleMute()"
      >
        {{ webrtc.isMuted ? '🔇 已静音' : '🎤 发言中' }}
      </el-button>

      <el-button v-if="canStart" @click="handleSkip" :disabled="!standupStore.currentSpeakerId">
        [跳过此人]
      </el-button>
      <el-button type="success" @click="handleAISummary" :disabled="standupStore.doneCount === 0">
        [AI整理]
      </el-button>
      <el-button type="danger" @click="showEndDialog = true">[结束站会]</el-button>
      <div style="flex:1; text-align:right;">
        <span v-if="webrtc.connectedPeers > 0" class="peer-count">
          {{ webrtc.connectedPeers }} 人在线
        </span>
        <CountdownTimer
          :seconds="standupStore.currentMeeting.timerSeconds"
          :is-warning="standupStore.isTimerWarning"
          :is-overtime="standupStore.currentMeeting.isOvertime"
        />
      </div>
    </div>

    <!-- Real-time AI classification display -->
    <div v-if="realtimeAI.classifiedItems.length && standupStore.currentSpeakerId" class="ai-realtime">
      <div class="ai-section">
        <span class="ai-tag yesterday">昨日完成</span>
        <span v-for="item in realtimeAI.yesterdayItems" :key="item.id" class="ai-item">{{ item.text }}</span>
      </div>
      <div class="ai-section">
        <span class="ai-tag today">今日计划</span>
        <span v-for="item in realtimeAI.todayItems" :key="item.id" class="ai-item">{{ item.text }}</span>
      </div>
      <div class="ai-section">
        <span class="ai-tag blocker">阻碍</span>
        <span v-for="item in realtimeAI.blockerItems" :key="item.id" class="ai-item">{{ item.text }}</span>
      </div>
    </div>

    <el-row :gutter="20">
      <!-- Left: Draggable speaking order + member status -->
      <el-col :span="6">
        <el-card>
          <template #header>
            <div class="panel-header">
              <span>发言顺序 ({{ standupStore.doneCount }}/{{ standupStore.totalCount }})</span>
              <el-tag v-if="standupStore.isAllDone" type="success" size="small">全部完成</el-tag>
            </div>
          </template>

          <!-- Speaking order list with drag support -->
          <draggable
            v-model="localOrder"
            item-key="id"
            handle=".drag-handle"
            @change="handleOrderChange"
            :disabled="standupStore.isAllDone"
            ghost-class="drag-ghost"
          >
            <template #item="{ element: id, index }">
              <div class="member-item" :class="getMemberClass(id)">
                <span class="drag-handle" title="拖拽排序">⋮⋮</span>
                <span class="order-num">{{ index + 1 }}</span>
                <div class="member-info">
                  <span class="member-name">{{ getMemberName(id) }}</span>
                  <span class="member-role-tag">{{ getMemberRole(id) }}</span>
                </div>
                <div class="member-status-icon">
                  <span v-if="id === standupStore.currentSpeakerId" class="pulse-dot speaking-dot"></span>
                  <el-icon v-else-if="getMemberStatus(id) === 'done'" class="done-icon"><CircleCheckFilled /></el-icon>
                  <el-icon v-else-if="getMemberStatus(id) === 'skipped'" class="skip-icon"><RemoveFilled /></el-icon>
                  <span v-else class="waiting-dot"></span>
                </div>
                <div class="member-actions">
                  <el-button v-if="standupStore.currentSpeakerId === id"
                    link type="primary" size="small" @click="handleSkip">跳过</el-button>
                  <el-button v-if="getMemberStatus(id) === 'skipped'"
                    link type="warning" size="small" @click="handleReinsert(id)">重新插入</el-button>
                </div>
              </div>
            </template>
          </draggable>
          <div v-if="!standupStore.currentMeeting.speakingOrder.length"
            style="color:#909399;text-align:center;padding:20px 0;">暂无成员</div>
        </el-card>
      </el-col>

      <!-- Center: Speaking area -->
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>
              <template v-if="standupStore.isAllDone">
                <strong>全员发言完毕</strong> ✅
              </template>
              <template v-else-if="standupStore.currentSpeakerId">
                <strong>{{ getMemberName(standupStore.currentSpeakerId) }}</strong>
                <span class="speaking-label">正在发言</span>
              </template>
              <template v-else>
                等待开始
              </template>
            </span>
          </template>

          <div v-if="standupStore.currentSpeakerId">
            <ThreeColumnInput
              v-model:yesterday="speech.yesterday"
              v-model:today="speech.today"
              v-model:blockers="speech.blockers"
              @submit="handleSubmitSpeech"
            />
          </div>
          <div v-else class="idle-state">
            <el-result
              v-if="standupStore.currentMeeting.status === 'finished'"
              icon="success" title="站会已结束" sub-title="所有成员发言完毕" />
            <el-result
              v-else-if="standupStore.isAllDone"
              icon="success" title="全员发言完毕" sub-title="可以结束站会了">
              <template #extra>
                <el-button type="primary" @click="handleAISummary">AI整理</el-button>
                <el-button type="danger" @click="showEndDialog = true">结束站会</el-button>
              </template>
            </el-result>
            <el-result
              v-else icon="info" title="准备开始"
              :sub-title="canStart ? '点击「开始站会」启动15分钟倒计时' : '等待 Tech Lead 或 Scrum Master 开启站会'">
              <template #extra>
                <el-button v-if="canStart" type="primary" @click="handleStart">开始站会</el-button>
              </template>
            </el-result>
          </div>
        </el-card>
      </el-col>

      <!-- Right: Finished speakers -->
      <el-col :span="6">
        <el-card>
          <template #header><span>已完成发言</span></template>
          <div v-for="item in finishedSpeakers" :key="item.id" class="finished-item">
            <p><strong>{{ item.name }}</strong></p>
            <p class="speech-line">昨日：{{ item.yesterday || '--' }}</p>
            <p class="speech-line">今日：{{ item.today || '--' }}</p>
            <p class="speech-line">阻碍：{{ item.blockers || '无' }}</p>
            <el-divider />
          </div>
          <div v-if="!finishedSpeakers.length" style="color:#909399;text-align:center;padding:20px 0;">
            暂无已发言成员
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Overtime Dialog -->
    <el-dialog v-model="showOvertimeDialog" title="站会超时" width="400px">
      <p>15分钟时限已到。已超时 {{ overtimeSeconds }} 秒</p>
      <p>是否继续站会？</p>
      <template #footer>
        <el-button @click="handleOvertimeEnd">结束站会</el-button>
        <el-button type="primary" @click="handleOvertimeContinue">延长站会</el-button>
      </template>
    </el-dialog>

    <!-- End Dialog -->
    <el-dialog v-model="showEndDialog" title="结束站会" width="400px">
      <p>确定要结束当前站会吗？</p>
      <p v-if="undoneCount > 0" style="color:#E6A23C;">{{ undoneCount }} 名成员尚未发言</p>
      <template #footer>
        <el-button @click="showEndDialog = false">取消</el-button>
        <el-button type="danger" @click="handleEndStandup">确认结束</el-button>
      </template>
    </el-dialog>

    <!-- AI Thinking Dialog -->
    <el-dialog v-model="showAiThinking" title="AI 整理中..." width="480px" :close-on-click-modal="false" :show-close="false">
      <div class="ai-thinking">
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
        <p>正在调用 AI 模型分析发言记录...</p>
        <p class="thinking-hint">提取昨日完成、今日计划、阻碍事项、Action Item</p>
      </div>
    </el-dialog>

    <!-- Paste Dialog -->
    <el-dialog v-model="showPasteDialog" title="粘贴聊天记录" width="560px">
      <el-input v-model="pasteText" type="textarea" rows="8"
        placeholder="粘贴飞书/钉钉聊天记录，格式：&#10;张三：完成了登录模块重构&#10;李四：修复了3个权限校验Bug" />
      <template #footer>
        <el-button @click="showPasteDialog = false">取消</el-button>
        <el-button type="primary" @click="handlePaste">解析并导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// ========================================================
// Step 2: Each function is a focused, single-purpose unit
// ========================================================
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useStandupStore } from '../stores/useStandupStore'
import { useTeamStore } from '../stores/useTeamStore'
import { useUserStore } from '../stores/useUserStore'
import { SPEAKER_STATUS, ROLES, ROLE_LABELS } from '../utils/constants'
import { parseChatLog } from '../composables/usePasteChat'
import { ElMessage } from 'element-plus'
import ThreeColumnInput from '../components/standup/ThreeColumnInput.vue'
import CountdownTimer from '../components/standup/CountdownTimer.vue'
import { useSpeakerTimer } from '../composables/useSpeakerTimer'
import { useWebRTC } from '../composables/useWebRTC'
import { useRealtimeAI } from '../composables/useRealtimeAI'
import { wsService } from '../services/websocket/wsService'
import draggable from 'vuedraggable'

const router = useRouter()
const standupStore = useStandupStore()
const teamStore = useTeamStore()
const userStore = useUserStore()

// Auto-connect WebSocket for ALL meeting members (not just the host)
const wsReady = ref(false)
if (standupStore.currentMeeting.id) {
  wsService.connect(standupStore.currentMeeting.id, userStore.currentUser?.id)
  // Wait for actual connection
  const checkInterval = setInterval(() => {
    if (wsService.isConnected) {
      wsReady.value = true
      standupStore.wsConnected = true
      clearInterval(checkInterval)
    }
  }, 300)
  // Timeout after 10s
  setTimeout(() => { if (!wsReady.value) clearInterval(checkInterval) }, 10000)
}

// Periodic live state broadcast for real-time card updates on index page
let liveStateTimer = null
watch(wsReady, (ready) => {
  if (ready) {
    standupStore.broadcastLiveState()
    liveStateTimer = setInterval(() => standupStore.broadcastLiveState(), 15000)
  } else {
    if (liveStateTimer) { clearInterval(liveStateTimer); liveStateTimer = null }
  }
})

// Detect remote meeting end (host ended the standup from another tab/user)
watch(() => standupStore.currentMeeting.id, (newId) => {
  if (!newId && wsReady.value) {
    // Meeting was remotely ended — redirect to standup list
    ElMessage.info('主持人已结束本次站会')
    router.push('/standup')
  }
})

const listener = useSpeakerTimer()
const webrtc = useWebRTC()
const realtimeAI = useRealtimeAI()

const canStart = computed(() => {
  const meeting = standupStore.currentMeeting
  const uid = userStore.currentUser?.id
  if (!uid) return false
  const myRole = teamStore.activeMembers.find(m =>
    String(m.userId) === String(uid) || String(m.id) === String(uid)
  )?.role || userStore.currentUser?.role
  return myRole === ROLES.MASTER || myRole === ROLES.ADMIN ||
    (meeting.createdBy && String(meeting.createdBy) === String(uid))
})

// ---- Local State ----
const showOvertimeDialog = ref(false)
const showEndDialog = ref(false)
const showPasteDialog = ref(false)
const showAiThinking = ref(false)
const pasteText = ref('')
const overtimeSeconds = ref(0)
let overtimeInterval = null

const speech = reactive({ yesterday: '', today: '', blockers: '' })

// Sync local speaking order for drag-reorder
const localOrder = computed({
  get: () => [...standupStore.currentMeeting.speakingOrder],
  set: (val) => { /* handled by handleOrderChange */ }
})

// ---- Computed ----
const finishedSpeakers = computed(() =>
  Object.entries(standupStore.currentMeeting.memberStatuses)
    .filter(([, s]) => s.status === SPEAKER_STATUS.DONE)
    .map(([id, s]) => ({ id, name: getMemberName(id), yesterday: s.yesterday, today: s.today, blockers: s.blockers }))
)
const undoneCount = computed(() => standupStore.totalCount - standupStore.doneCount)

// Voice call
const voiceCallLabel = computed(() => {
  switch (webrtc.callStatus.value) {
    case 'idle': return '📞 加入语音'
    case 'connecting': return '连接中...'
    case 'in-call': return '📞 语音中'
    case 'speaking': return '🎤 发言中'
    default: return '📞 加入语音'
  }
})

async function toggleVoiceCall() {
  if (webrtc.callStatus.value === 'idle') {
    const ok = await webrtc.joinCall(standupStore.currentMeeting.id, userStore.currentUser?.id)
    if (!ok) ElMessage.error(webrtc.errorMsg || '加入语音失败')
    else ElMessage.success('已加入语音通话')
  } else {
    webrtc.leaveCall()
    ElMessage.info('已退出语音通话')
  }
}

// Listener: other members can hear current speaker's text via TTS
const isNotCurrentSpeaker = computed(() => {
  return standupStore.currentSpeakerId &&
    String(standupStore.currentSpeakerId) !== String(userStore.currentUser?.id)
})

function toggleListener() {
  if (listener.isListening.value) {
    listener.stopListening()
  } else {
    listener.startListening()
    // Read current speaker's text
    const speakerId = standupStore.currentSpeakerId
    if (speakerId) {
      const s = standupStore.currentMeeting.memberStatuses[speakerId]
      if (s) {
        const text = [s.yesterday, s.today, s.blockers].filter(Boolean).join('。')
        if (text) listener.speakText(speakerId + '发言：' + text)
      }
    }
  }
}

// Auto-read when new speaker starts or text appears
watch(() => standupStore.currentSpeakerId, (newId) => {
  if (newId && listener.isListening.value) {
    listener.speakText(getMemberName(newId) + '正在发言')
  }
})

// ---- Watchers ----
watch(() => standupStore.currentSpeakerId, () => {
  speech.yesterday = ''; speech.today = ''; speech.blockers = ''
})
watch(() => standupStore.currentMeeting.isOvertime, (val) => {
  if (!val) return
  showOvertimeDialog.value = true
  overtimeSeconds.value = 0
  overtimeInterval = setInterval(() => { overtimeSeconds.value++ }, 1000)
})

// ---- Helper functions (pure, no side effects beyond return) ----
function getMemberName(id) { const m = teamStore.activeMembers.find(x => String(x.userId) === String(id) || String(x.id) === String(id)); return m?.name || id || '' }
function getMemberRole(id) {
  const m = teamStore.activeMembers.find(x => String(x.userId) === String(id) || String(x.id) === String(id))
  return ROLE_LABELS[m?.role] || m?.role || ''
}
function getMemberStatus(id) { return standupStore.currentMeeting.memberStatuses[id]?.status || 'waiting' }

function getMemberClass(id) {
  if (id === standupStore.currentSpeakerId) return 'speaking'
  const s = getMemberStatus(id)
  if (s === 'done') return 'done'
  if (s === 'skipped') return 'skipped'
  return 'waiting'
}

// ---- Standup lifecycle functions ----
// 1. 开始站会: status → counting, start timer, WS broadcast
function handleStart() {
  standupStore.startStandup()
  standupStore.nextSpeaker()
  ElMessage.success('站会已开始，15分钟倒计时启动')
}
// Self-check ✅: Calls startStandup() → nextSpeaker() → first speaker starts

// 2. 提交发言: validate → submit → auto-advance to next
function handleSubmitSpeech() {
  if (!speech.yesterday && !speech.today) {
    ElMessage.warning('请至少填写昨日完成或今日计划')
    return
  }
  standupStore.submitSpeech({
    yesterday: speech.yesterday,
    today: speech.today,
    blockers: speech.blockers
  })
}
// Self-check ✅: Validates input before submitting, WS sync happens in store

// 3. 跳过当前发言人: skip → auto-advance to next
function handleSkip() {
  const id = standupStore.currentSpeakerId
  if (!id) return
  standupStore.skipSpeaker(id)
  ElMessage.info(`已跳过 ${getMemberName(id)}`)
}
// Self-check ✅: Only active when speaker is selected

// 4. 重新插入被跳过的成员: remove from skipped list → re-add to order
function handleReinsert(memberId) {
  standupStore.reinsertSpeaker(memberId)
  ElMessage.success(`已重新插入 ${getMemberName(memberId)}`)
}
// Self-check ✅: Restores skipped member to speaking order

// 5. 拖拽调整发言顺序: update local order → persist to store
function handleOrderChange() {
  standupStore.reorderSpeakingOrder([...localOrder.value])
}
// Self-check ✅: Draggable → on change → store reorder

// 6. 结束站会: auto-generate summary → finish → navigate
function handleEndStandup() {
  if (standupStore.doneCount > 0 && !standupStore.currentSummary.id) {
    standupStore.generateSummary()
  }
  standupStore.finishStandup()
  showEndDialog.value = false
  clearOvertimeTimer()
  router.push('/standup')
  ElMessage.success('站会已结束，纪要已归档')
}
// Self-check ✅: Auto-generates summary before ending

// 7. AI整理: show thinking → generate summary → navigate to result
async function handleAISummary() {
  if (standupStore.doneCount === 0) {
    ElMessage.warning('还没有成员发言')
    return
  }
  showAiThinking.value = true
  // Small delay to show thinking dialog
  await new Promise(r => setTimeout(r, 600))
  standupStore.generateSummary()
  showAiThinking.value = false
  router.push(`/standup/${standupStore.currentMeeting.id}/result`)
}
// Self-check ✅: Shows AI thinking indicator before navigating

// 8. 超时处理: continue or end
function handleOvertimeContinue() {
  showOvertimeDialog.value = false
  clearOvertimeTimer()
  standupStore.confirmOvertime()
}
function handleOvertimeEnd() {
  showOvertimeDialog.value = false
  clearOvertimeTimer()
  handleEndStandup()
}
function clearOvertimeTimer() {
  if (overtimeInterval) { clearInterval(overtimeInterval); overtimeInterval = null }
}
// Self-check ✅: Both paths clean up the timer

// 9. 粘贴聊天记录: parse → fill speech
function handlePaste() {
  const parsed = parseChatLog(pasteText.value)
  if (!parsed.length) { ElMessage.warning('未能解析出有效内容'); return }
  const combined = parsed.map(p => p.name ? `${p.name}: ${p.content}` : p.content).join('\n')
  speech.yesterday = combined
  ElMessage.success(`已解析 ${parsed.length} 条记录到昨日完成`)
  showPasteDialog.value = false
  pasteText.value = ''
}
// Self-check ✅: Parses Name:content format → populates yesterday field

// ---- Cleanup ----
onBeforeUnmount(() => {
  clearOvertimeTimer()
  listener.stopListening()
  if (liveStateTimer) { clearInterval(liveStateTimer); liveStateTimer = null }
  if (router.currentRoute.value.name !== 'StandupResult') {
    standupStore.cleanupStandup()
  }
})
// Self-check ✅: Cleans up timer, WS only disconnects when NOT going to result page
</script>

<style scoped>
/* ---- Toolbar ---- */
.toolbar { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }

/* ---- Speaking Order List ---- */
.panel-header { display: flex; justify-content: space-between; align-items: center; }

.member-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 8px; margin: 6px 0;
  transition: all 0.25s ease;
}
.member-item.waiting { background: #f5f5f5; color: #999; }
.member-item.speaking {
  background: linear-gradient(135deg, #e8f4fd, #d0e8ff);
  border: 2px solid #4094ED; box-shadow: 0 0 12px rgba(64,148,237,0.3);
  transform: scale(1.04); z-index: 2;
}
.member-item.done { background: #f0fff4; }
.member-item.skipped { background: #fff8e6; opacity: 0.6; }

.drag-handle { cursor: grab; color: #c0c4cc; font-size: 18px; user-select: none; }
.drag-ghost { opacity: 0.4; background: #e0e0e0; }

.order-num { width: 22px; text-align: center; font-weight: 600; color: #909399; font-size: 13px; }
.member-info { flex: 1; }
.member-name { display: block; font-weight: 500; }
.member-role-tag { font-size: 11px; color: #909399; }

/* Status indicators */
.member-status-icon { width: 24px; text-align: center; }
.pulse-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.speaking-dot { background: #4094ED; animation: pulse 1.2s infinite; }
.waiting-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: #dcdfe6; }
.done-icon { color: #67C23A; font-size: 18px; }
.skip-icon { color: #E6A23C; font-size: 16px; }

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(64,148,237,0.6); }
  50% { box-shadow: 0 0 0 8px rgba(64,148,237,0); }
}

/* ---- Center Speaking ---- */
.speaking-label { font-size: 13px; color: #4094ED; margin-left: 8px; animation: fadeInOut 2s infinite; }
@keyframes fadeInOut { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.idle-state { padding: 20px 0; }

/* ---- Finished Speakers ---- */
.finished-item { font-size: 13px; }
.speech-line { margin: 2px 0; color: var(--text-secondary); }
.finished-item strong { color: var(--text-primary); }
.peer-count { font-size: 13px; color: #67C23A; margin-right: 12px; }

/* AI Realtime Classification */
.ai-realtime { margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; }
.ai-section { margin: 4px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ai-tag { font-size: 11px; padding: 2px 8px; border-radius: 10px; color: #fff; white-space: nowrap; }
.ai-tag.yesterday { background: #4094ED; }
.ai-tag.today { background: #67C23A; }
.ai-tag.blocker { background: #F56C6C; }
.ai-item { font-size: 13px; color: #606266; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* AI Thinking */
.ai-thinking { text-align: center; padding: 20px 0; }
.ai-thinking p { margin-top: 16px; color: var(--text-secondary); }
.thinking-hint { font-size: 13px; color: #909399; }
.thinking-dots { display: flex; justify-content: center; gap: 8px; }
.thinking-dots span {
  width: 10px; height: 10px; border-radius: 50%; background: #4094ED;
  animation: bounce 1.2s infinite;
}
.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}
</style>
