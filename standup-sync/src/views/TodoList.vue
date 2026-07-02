<template>
  <div>
    <div class="toolbar">
      <el-button-group>
        <el-button :type="activePanel==='todo'?'primary':''" @click="activePanel='todo'">待办</el-button>
        <el-button :type="activePanel==='notif'?'primary':''" @click="activePanel='notif'">
          通知
          <el-badge v-if="todoStore.unreadCount" :value="todoStore.unreadCount" style="margin-left:4px" />
        </el-button>
      </el-button-group>
      <el-button type="primary" @click="openCreateDialog" style="margin-left:12px">[+ 新建待办]</el-button>
    </div>

    <el-card v-if="activePanel==='notif'" style="margin-bottom:12px">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>通知中心 ({{ todoStore.notifications.length }})</span>
          <div>
            <el-button link size="small" @click="todoStore.markAllRead()">全部已读</el-button>
            <el-button link size="small" @click="todoStore.clearNotifications()">清空</el-button>
          </div>
        </div>
      </template>
      <div v-if="!todoStore.notifications.length" style="text-align:center;color:#999;padding:20px">暂无通知</div>
      <div v-for="n in showNotifications" :key="n.id"
        style="padding:8px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center"
        :style="{opacity: n.read ? 0.5 : 1}">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px">{{ n.message }}</div>
          <div v-if="n.detail" style="font-size:12px;color:#606266;margin-top:2px">{{ n.detail }}</div>
          <div style="color:#999;font-size:11px">{{ formatTime(n.time) }}</div>
        </div>
        <el-button v-if="!n.read" link size="small" @click="n.read=true" style="flex-shrink:0">已读</el-button>
        <div v-if="isMasterForTodo(n.todoId) && n.type === 'transfer-request' && n.todoId && !n.processed" style="flex-shrink:0;margin-left:4px">
          <el-button type="success" size="small" @click="handleApproveTransfer(n.id, n.todoId)">通过</el-button>
          <el-button type="danger" size="small" @click="handleRejectTransfer(n.id)">拒绝</el-button>
        </div>
      </div>
    </el-card>

    <el-tabs v-if="activePanel==='todo'" v-model="todoStore.activeTab" @tab-change="todoStore.setActiveTab">
      <el-tab-pane label="全部" name="all">
        <template #label><span>全部({{ todoStore.tabCounts.all }})</span></template>
      </el-tab-pane>
      <el-tab-pane label="待处理" name="pending">
        <template #label><span>待处理({{ todoStore.tabCounts.pending }})</span></template>
      </el-tab-pane>
      <el-tab-pane label="进行中" name="in_progress">
        <template #label><span>进行中({{ todoStore.tabCounts.in_progress }})</span></template>
      </el-tab-pane>
      <el-tab-pane label="已完成" name="done">
        <template #label><span>已完成({{ todoStore.tabCounts.done }})</span></template>
      </el-tab-pane>
    </el-tabs>

    <el-row v-if="activePanel==='todo'" :gutter="20" style="margin-top: 16px;">
      <el-col :span="16">
        <el-table
          :data="todoStore.filteredTodos"
          border
          @row-click="handleRowClick"
          highlight-current-row
          :row-class-name="rowClassName"
          v-loading="todoStore.loading"
        >
          <el-table-column prop="priority" label="优先级" width="80">
            <template #default="scope">
              <el-tag :type="scope.row.priority === 'high' ? 'danger' : scope.row.priority === 'medium' ? 'warning' : 'success'">
                {{ scope.row.priority === 'high' ? '高' : scope.row.priority === 'medium' ? '中' : '低' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="content" label="内容" />
          <el-table-column label="Sprint" width="100">
            <template #default="scope">{{ sprintName(scope.row.sprintId) || '-' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="scope">
              <el-tag :type="statusType(scope.row.status)">{{ statusLabel(scope.row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="截止" width="110">
            <template #default="scope">
              <span :class="{ 'text-danger': scope.row.isOverdue }">{{ formatDate(scope.row.deadline) }}</span>
              <el-tag v-if="scope.row.isOverdue" type="danger" size="small" style="margin-left:4px;">逾期</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header><span>待办详情</span></template>
          <template v-if="todoStore.selectedTodo">
            <h3>{{ todoStore.selectedTodo.content }}</h3>
            <el-tag :type="todoStore.selectedTodo.priority==='high'?'danger':todoStore.selectedTodo.priority==='medium'?'warning':'success'">
              {{ todoStore.selectedTodo.priority==='high'?'高':todoStore.selectedTodo.priority==='medium'?'中':'低' }}
            </el-tag>
            <el-divider />
            <p>团队：{{ teamName(todoStore.selectedTodo.teamId) }}</p>
            <p>Sprint：{{ sprintName(todoStore.selectedTodo.sprintId) || '--' }}</p>
            <p>团长：{{ teamLeaderName(todoStore.selectedTodo.teamId) }}</p>
            <p>责任人：{{ todoStore.selectedTodo.assigneeName || ('用户' + todoStore.selectedTodo.assigneeId) || '--' }}</p>
            <p>截止：{{ getRelativeDeadline(todoStore.selectedTodo.deadline) }}</p>
            <p>状态：{{ statusLabel(todoStore.selectedTodo.status) }}</p>
            <el-divider />
            <div class="detail-actions">
              <el-button text @click="handleStatusChange('done')" :disabled="todoStore.selectedTodo.status === 'done'">[ 标记完成 ]</el-button>
              <el-button text @click="handleStatusChange('in_progress')" :disabled="todoStore.selectedTodo.status === 'in_progress'">[ 标记进行中 ]</el-button>
              <el-button text @click="showTransferDialog = true">[ 转交他人 ]</el-button>
              <el-button text @click="handleStatusChange('cancelled')">[ 取消待办 ]</el-button>
            </div>
          </template>
          <div v-else style="text-align:center;color:#909399;padding:40px 0;">点击左侧待办查看详情</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Create Dialog -->
    <el-dialog v-model="showCreateDialog" title="新建待办" width="480px">
      <el-form label-width="80px">
        <el-form-item label="团队">
          <el-select v-model="newTodo.teamId" style="width:100%">
            <el-option v-for="t in masterTeams" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Sprint">
          <el-select v-model="newTodo.sprintId" style="width:100%" clearable placeholder="选择Sprint（可选)">
            <el-option v-for="s in currentSprints" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="newTodo.content" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="newTodo.priority">
            <el-radio value="high">高</el-radio>
            <el-radio value="medium">中</el-radio>
            <el-radio value="low">低</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="截止日期">
          <el-date-picker v-model="newTodo.deadline" type="date" style="width:100%;" />
        </el-form-item>
        <el-form-item label="责任人">
          <el-select v-model="newTodo.assigneeId" style="width:100%" placeholder="选择成员">
            <el-option v-for="m in teamStore.activeMembers" :key="m.userId || m.id" :label="m.name" :value="m.userId || m.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :disabled="!newTodo.content.trim() || !newTodo.teamId">创建</el-button>
      </template>
    </el-dialog>

    <!-- Transfer Dialog -->
    <el-dialog v-model="showTransferDialog" title="转交他人" width="400px">
      <el-form label-width="80px">
        <el-form-item label="转交给">
          <el-select v-model="transferTargetId" style="width:100%" placeholder="选择团队成员">
            <el-option v-for="m in teamStore.activeMembers.filter(x => String(x.userId||x.id) !== String(todoStore.selectedTodo?.assigneeId))" :key="m.userId || m.id" :label="m.name" :value="m.userId || m.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTransferDialog = false">取消</el-button>
        <el-button type="primary" @click="handleTransfer" :disabled="!transferTargetId">提交转交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useTodoStore } from '../stores/useTodoStore'
import { useTeamStore } from '../stores/useTeamStore'
import { useUserStore } from '../stores/useUserStore'
import { TODO_STATUS_LABELS } from '../utils/constants'
import { formatDate, getRelativeDeadline } from '../utils/formatters'
import { ElMessage } from 'element-plus'

const todoStore = useTodoStore()
const teamStore = useTeamStore()
const userStore = useUserStore()
const showCreateDialog = ref(false)
const showTransferDialog = ref(false)
const transferTargetId = ref(null)

function openCreateDialog() {
  // 默认选中当前活跃团队
  if (!newTodo.teamId && teamStore.activeTeamId) {
    newTodo.teamId = teamStore.activeTeamId
  }
  showCreateDialog.value = true
}
const activePanel = ref('todo')

function isMasterForTodo(todoId) {
  if (!todoId) return false
  const todo = todoStore.todos.find(t => String(t.id) === String(todoId))
  if (!todo || !todo.teamId) return false
  const uid = userStore.currentUser?.id
  if (!uid) return false
  const team = teamStore.teams.find(t => String(t.id) === String(todo.teamId))
  return team && String(team.creatorId) === String(uid)
}

const masterTeams = computed(() => {
  const uid = userStore.currentUser?.id
  if (!uid) return []
  return teamStore.teams.filter(t => String(t.creatorId) === String(uid))
})

const currentSprints = computed(() => {
  return teamStore.sprints || []
})

const showNotifications = computed(() => todoStore.notifications.slice(0, 30))

const newTodo = reactive({
  teamId: null,
  sprintId: null,
  content: '',
  priority: 'medium',
  deadline: null,
  assigneeId: null
})

onMounted(async () => {
  await teamStore.fetchMyTeams()
  await teamStore.fetchSprints()
  if (teamStore.activeTeamId) {
    await teamStore.switchTeam(teamStore.activeTeamId)
    todoStore.fetchTodos()
  }
})

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')
  return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')
}

function statusType(status) {
  const map = { pending: 'danger', in_progress: 'warning', done: 'success', cancelled: 'info' }
  return map[status] || 'info'
}
function statusLabel(status) { return TODO_STATUS_LABELS[status] || status }
function rowClassName({ row }) { return row.isOverdue ? 'row-overdue' : '' }
function handleRowClick(row) { todoStore.selectTodo(row.id) }

function teamName(teamId) {
  const t = teamStore.teams.find(t => String(t.id) === String(teamId))
  return t ? t.name : '--'
}
function sprintName(sprintId) {
  if (!sprintId) return null
  const s = teamStore.sprints.find(s => String(s.id) === String(sprintId))
  return s ? s.name : null
}

function teamLeaderName(teamId) {
  const t = teamStore.teams.find(t => String(t.id) === String(teamId))
  if (!t) return '--'
  const leader = teamStore.activeMembers.find(m => String(m.userId) === String(t.creatorId) || m.role === 2 && String(m.teamId) === String(teamId))
  return leader ? leader.name : ('用户' + t.creatorId)
}

async function handleStatusChange(status) {
  if (!todoStore.selectedTodoId) return
  const result = await todoStore.updateTodoStatus(todoStore.selectedTodoId, status)
  if (result && result.success) {
    ElMessage.success(status === 'done' ? '已完成' : status === 'in_progress' ? '标记进行中' : '已取消')
  } else {
    ElMessage.error(result?.message || '操作失败')
  }
}

async function handleTransfer() {
  if (!todoStore.selectedTodoId || !transferTargetId.value) return
  const { apiPost } = await import('../services/api/index.js')
  const res = await apiPost(`/todos/${todoStore.selectedTodoId}/transfer?newAssigneeId=${transferTargetId.value}`)
  if (res && res.code === 200) {
    showTransferDialog.value = false
    transferTargetId.value = null
    ElMessage.success('转交申请已提交，等待团长审批')
    todoStore.fetchTodos()
  } else {
    ElMessage.error(res?.msg || '转交失败')
  }
}

async function handleApproveTransfer(notifId, todoId) {
  const updated = todoStore.notifications.map(n => {
    if (n.id === notifId || String(n.todoId) === String(todoId))
      return { ...n, processed: true, read: true }
    return n
  })
  todoStore.$patch({ notifications: updated })
  const { apiPost } = await import('../services/api/index.js')
  const res = await apiPost(`/todos/${todoId}/transfer/approve`)
  if (res && res.code === 200) {
    ElMessage.success('转交已通过')
    todoStore.fetchTodos()
  } else {
    ElMessage.error(res?.msg || '操作失败')
  }
}

function handleRejectTransfer(notifId) {
  const updated = todoStore.notifications.map(n => {
    if (n.id === notifId) return { ...n, processed: true, read: true }
    return n
  })
  todoStore.$patch({ notifications: updated })
  ElMessage.info('转交已拒绝')
}

async function handleCreate() {
  if (!newTodo.teamId) { ElMessage.warning('请选择团队'); return }
  const result = await todoStore.createTodo({
    teamId: newTodo.teamId,
    sprintId: newTodo.sprintId,
    content: newTodo.content,
    priority: newTodo.priority,
    deadline: newTodo.deadline ? newTodo.deadline.toISOString() : null,
    assigneeId: newTodo.assigneeId
  })
  if (result && result.success) {
    showCreateDialog.value = false
    newTodo.teamId = null
    newTodo.sprintId = null
    newTodo.content = ''
    newTodo.priority = 'medium'
    newTodo.deadline = null
    newTodo.assigneeId = null
    ElMessage.success('待办已创建')
  } else {
    ElMessage.error(result?.message || '创建失败')
  }
}
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.detail-actions { display: flex; flex-direction: column; gap: 4px; }
.text-danger { color: #F56C6C; }
</style>
