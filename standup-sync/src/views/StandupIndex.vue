<template>
  <div>
    <div class="top-action">
      <el-button type="primary" @click="handleCreateClick">[+ 创建站会]</el-button>
      <el-button @click="showPasteDialog = true">[粘贴记录]</el-button>
      <el-button @click="refreshAll" :loading="refreshing" style="float:right">[刷新数据]</el-button>
    </div>

    <!-- Active standup cards — show all in-progress meetings -->
    <div v-if="activeStandups.length" style="margin-bottom: 16px;">
      <h3 style="margin-bottom: 12px;">进行中的站会 ({{ activeStandups.length }})</h3>
      <el-row :gutter="16">
        <el-col :span="8" v-for="m in activeStandups" :key="m.id">
          <el-card shadow="hover" class="active-meeting-card" :class="{ live: m.status === 'counting' || m.status === 'speaking' }">
            <div class="card-sprint">{{ m.sprintName }}</div>
            <div class="card-info">
              <span v-if="m.status === 'speaking' && currentSpeakerForCard(m)" class="live-speaker">
                🔴 发言中: {{ getMemberName(currentSpeakerForCard(m)) }}
              </span>
              <span v-else-if="m.status === 'counting'">⏳ 即将开始</span>
              <span v-else-if="m.status === 'idle'">📋 待开始</span>
            </div>
            <div class="card-info">{{ (m._doneCount != null ? m._doneCount : getMeetingDoneCount(m)) }}/{{ m._totalCount || m.speakingOrder.length }} 人已发言</div>
            <div class="card-info">创建于 {{ formatDateTime(m.createdAt) }}</div>
            <div class="card-info" v-if="m.status === 'counting' || m.status === 'speaking'">
              剩余 {{ formatDuration(m.timerSeconds) }}
            </div>
            <el-button type="primary" size="small" style="margin-top: 8px;"
              @click="enterMeeting(m.id)">进入站会</el-button>
            <el-button type="danger" size="small" style="margin-top: 8px;"
              @click="endMeetingFromCard(m.id)">结束</el-button>
          </el-card>
        </el-col>
      </el-row>
    </div>
    <div v-else style="margin-bottom: 16px;">
      <el-card shadow="hover"><p>当前没有进行中的站会</p></el-card>
    </div>

    <!-- Stats card -->
    <el-card shadow="hover" style="margin-bottom: 24px;">
      <h3>快速统计</h3>
      <p>本月 {{ stats.monthlyCount }} 次站会 · 出勤率 {{ stats.attendanceRate }}%</p>
      <p>待办完成率 {{ stats.completionRate }}% · 活跃阻碍 {{ stats.activeBlockers }} 个</p>
      <p v-if="teamStore.activeSprint">{{ teamStore.activeSprint.name }} · {{ formatDate(teamStore.activeSprint.startDate) }} ~ {{ formatDate(teamStore.activeSprint.endDate) }}</p>
      <p v-else>尚未创建 Sprint</p>
    </el-card>

    <!-- History table -->
    <el-table :data="standupStore.standupList" border style="width: 100%; margin-top: 24px;" v-loading="standupStore.loading">
      <el-table-column label="日期时间" width="170">
        <template #default="scope">{{ scope.row.date }} {{ scope.row.time }}</template>
      </el-table-column>
      <el-table-column prop="sprintName" label="Sprint" />
      <el-table-column prop="attendance" label="出勤率" />
      <el-table-column label="完成率">
        <template #default="scope">{{ scope.row.finishRate }}%</template>
      </el-table-column>
      <el-table-column prop="blockCount" label="阻碍" />
      <el-table-column label="操作">
        <template #default="scope">
          <el-button link @click="$router.push(`/standup/${scope.row.id}/result`)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create Standup Dialog -->
    <el-dialog v-model="showCreateDialog" title="创建站会" width="560px" @open="initMemberSelection">
      <el-form label-width="80px">
        <el-form-item label="所属团队">
          <el-select v-model="newStandup.teamId" style="width: 100%;">
            <el-option v-for="t in teamStore.teams" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="站会时间">
          <el-date-picker v-model="newStandup.date" type="datetime" style="width: 100%;"
            placeholder="选择日期时间（默认现在）" format="YYYY-MM-DD HH:mm" />
        </el-form-item>
        <el-form-item label="Sprint">
          <el-select v-model="newStandup.sprintId" style="width: 100%;">
            <el-option
              v-for="s in (teamStore.sprints.length ? teamStore.sprintOptions : defaultSprintOptions)"
              :key="s.value" :label="s.label" :value="s.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="站会模式">
          <el-radio-group v-model="newStandup.mode">
            <el-radio value="live">实时轮流站会</el-radio>
            <el-radio value="async">异步填写站会</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="参会人员">
          <el-checkbox v-model="selectAllMembers" @change="toggleSelectAll" style="margin-bottom:8px;">
            全选
          </el-checkbox>
          <el-checkbox-group v-model="newStandup.memberIds">
            <div v-for="m in availableMembers" :key="m.userId || m.id" style="margin-bottom: 8px;">
              <el-checkbox :value="m.userId || m.id">
                {{ m.name }} <el-tag size="small" type="info">{{ getRoleLabel(m.role) }}</el-tag>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :disabled="!newStandup.memberIds.length">
          创建站会
        </el-button>
      </template>
    </el-dialog>

    <!-- Paste Chat Dialog -->
    <el-dialog v-model="showPasteDialog" title="粘贴聊天记录" width="560px">
      <el-input
        v-model="pasteText"
        type="textarea"
        rows="8"
        placeholder="粘贴飞书/钉钉聊天记录，支持格式：&#10;张三：完成了登录模块重构&#10;李四：修复了3个权限校验Bug"
      />
      <template #footer>
        <el-button @click="showPasteDialog = false">取消</el-button>
        <el-button type="primary" @click="handlePaste">解析并导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStandupStore } from '../stores/useStandupStore'
import { useTeamStore } from '../stores/useTeamStore'
import { useUserStore } from '../stores/useUserStore'
import { ROLES, ROLE_LABELS } from '../utils/constants'
import { formatDate, formatDateTime, formatDuration } from '../utils/formatters'
import { parseChatLog } from '../composables/usePasteChat'
import { ElMessage } from 'element-plus'

const router = useRouter()
const standupStore = useStandupStore()
const teamStore = useTeamStore()
const userStore = useUserStore()

const showCreateDialog = ref(false)
const showPasteDialog = ref(false)
const pasteText = ref('')

const selectAllMembers = ref(true)
const newStandup = reactive({
  teamId: null,
  sprintId: 'sprint_1',
  date: null,
  mode: 'live',
  memberIds: []
})

const defaultSprintOptions = [
  { label: 'Sprint #12', value: 'sprint_1' },
  { label: 'Sprint #13', value: 'sprint_13' }
]

const defaultMembers = [
  { id: 1, userId: 1, name: '张三', role: ROLES.MASTER },
  { id: 2, userId: 2, name: '李四', role: ROLES.ADMIN },
  { id: 3, userId: 3, name: '王五', role: ROLES.MEMBER },
  { id: 4, userId: 4, name: '赵六', role: ROLES.MEMBER },
  { id: 5, userId: 5, name: '钱七', role: ROLES.MEMBER }
]

const stats = computed(() => {
  const list = standupStore.standupList
  if (!list.length) return { monthlyCount: 0, attendanceRate: 0, completionRate: 0, activeBlockers: 0 }
  const monthlyCount = list.length
  const attendanceRate = Math.round(list.reduce((s, i) => s + i.attendanceRate, 0) / list.length)
  const completionRate = Math.round(list.reduce((s, i) => s + i.finishRate, 0) / list.length)
  const activeBlockers = list.reduce((s, i) => s + i.blockCount, 0)
  return { monthlyCount, attendanceRate, completionRate, activeBlockers }
})

// Check team membership role (int: 2=团长 1=管理员 0=团员)
const myTeamRole = computed(() => {
  const uid = userStore.currentUser?.id
  if (!uid) return ROLES.MEMBER
  const m = teamStore.activeMembers.find(m => String(m.userId) === String(uid) || String(m.id) === String(uid))
  return m?.role != null ? m.role : ROLES.MEMBER
})

const canCreateStandup = computed(() => {
  return myTeamRole.value === ROLES.MASTER
})

const activeStandups = computed(() => {
  const meetings = standupStore.activeMeetings || {}
  const myTeamIds = (teamStore.teams || []).map(t => t.id)
  return Object.values(meetings).filter(m =>
    m.status !== 'finished' && m.id &&
    (!m.teamId || myTeamIds.includes(m.teamId))
  )
})

function getMeetingDoneCount(meeting) {
  if (!meeting.memberStatuses) return 0
  return Object.values(meeting.memberStatuses).filter(s => s.status === 'done').length
}

function currentSpeakerForCard(meeting) {
  if (!meeting.speakingOrder) return null
  const idx = meeting.currentSpeakerIndex
  if (idx == null || idx < 0 || idx >= meeting.speakingOrder.length) return null
  return meeting.speakingOrder[idx]
}

function getMemberName(memberId) {
  const m = teamStore.activeMembers.find(x => String(x.userId) === String(memberId) || String(x.id) === String(memberId))
  return m ? m.name : memberId
}

function enterMeeting(meetingId) {
  standupStore.loadMeeting(meetingId)
  router.push(`/standup/${meetingId}/meeting`)
}

function endMeetingFromCard(meetingId) {
  standupStore.loadMeeting(meetingId)
  standupStore.finishStandup()
  ElMessage.success('站会已结束')
}

const availableMembers = computed(() => {
  return teamStore.activeMembers.length ? teamStore.activeMembers : defaultMembers
})

function handleCreateClick() {
  if (!teamStore.currentTeam) {
    ElMessage.warning('请先创建或加入一个团队')
    return
  }
  showCreateDialog.value = true
}

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role
}

function toggleSelectAll(checked) {
  if (checked) {
    newStandup.memberIds = availableMembers.value.map(m => m.userId || m.id)
  } else {
    newStandup.memberIds = []
  }
}

// Auto-select all members when dialog opens
const initMemberSelection = () => {
  newStandup.teamId = teamStore.currentTeam?.id
  if (!newStandup.memberIds.length) {
    newStandup.memberIds = availableMembers.value.map(m => m.userId || m.id)
    selectAllMembers.value = true
  }
}

function onTeamChange(teamId) {
  teamStore.switchTeam(teamId)
}

async function handleCreate() {
  if (!newStandup.teamId) {
    ElMessage.warning('请选择所属团队')
    return
  }
  // Switch to selected team to load its members (loadMembers is already awaited inside switchTeam)
  await teamStore.switchTeam(newStandup.teamId)
  // Check permission against the selected team
  const uid = userStore.currentUser?.id
  const myRole = teamStore.activeMembers.find(m =>
    String(m.userId) === String(uid) || String(m.id) === String(uid)
  )?.role || userStore.currentUser?.role
  if (myRole !== ROLES.MASTER) {
    ElMessage.error('没有权限：仅团长可创建站会')
    return
  }
  const sprintName = (teamStore.sprintOptions.find(s => s.value === newStandup.sprintId) || { label: 'Sprint' }).label
  const id = await standupStore.createStandup({
    sprintId: newStandup.sprintId,
    sprintName,
    memberIds: newStandup.memberIds,
    mode: newStandup.mode
  })
  showCreateDialog.value = false
  ElMessage.success('站会创建成功')
  router.push(`/standup/${id}/meeting`)
}

async function handlePaste() {
  const parsed = parseChatLog(pasteText.value)
  if (!parsed.length) {
    ElMessage.warning('未能解析出有效内容')
    return
  }
  const members = teamStore.activeMembers.length ? teamStore.activeMembers : defaultMembers
  const memberIds = members.map(m => m.userId || m.id)
  const sprintName = (teamStore.sprintOptions.find(s => s.value === newStandup.sprintId) || { label: 'Sprint' }).label

  const id = await standupStore.createStandup({
    sprintId: newStandup.sprintId || 'sprint_1',
    sprintName,
    memberIds,
    mode: 'async'
  })

  // Pre-fill speeches from parsed chat - match names to members
  parsed.forEach(entry => {
    const member = members.find(m => m.name === entry.name)
    const memberKey = member ? (member.userId || member.id) : null
    if (memberKey && standupStore.currentMeeting.memberStatuses[memberKey]) {
      standupStore.currentMeeting.memberStatuses[memberKey].yesterday = entry.content
      standupStore.currentMeeting.memberStatuses[memberKey].status = 'done'
      standupStore.currentMeeting.memberStatuses[memberKey].submittedAt = new Date().toISOString()
    }
  })

  ElMessage.success(`已解析 ${parsed.length} 条发言并创建站会`)
  showPasteDialog.value = false
  pasteText.value = ''
  router.push(`/standup/${id}/meeting`)
}

const refreshing = ref(false)
async function refreshAll() {
  refreshing.value = true
  await Promise.all([
    teamStore.fetchMyTeams(),
    standupStore.fetchStandupList()
  ])
  refreshing.value = false
  ElMessage.success('数据已刷新')
}

onMounted(() => {
  standupStore.fetchStandupList()
  // Ensure team data is fresh and team WebSocket is connected
  teamStore.fetchMyTeams()
})
</script>

<style scoped>
.top-action {
  margin-bottom: 16px;
}
.active-meeting-card {
  border-left: 3px solid #4094ED;
}
.active-meeting-card .card-sprint {
  font-weight: 600; font-size: 15px; margin-bottom: 6px;
}
.active-meeting-card .card-info {
  font-size: 13px; color: #909399; margin: 2px 0;
}
.active-meeting-card.live {
  border-left: 3px solid #67C23A;
  animation: live-pulse 2s infinite;
}
.live-speaker {
  color: #E6A23C; font-weight: 600;
}
@keyframes live-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(103,194,58,0.3); }
  50% { box-shadow: 0 0 8px 2px rgba(103,194,58,0.15); }
}
</style>
