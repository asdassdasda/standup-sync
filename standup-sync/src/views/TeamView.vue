<template>
  <div>
    <!-- No team state -->
    <div v-if="!teamStore.teams || !teamStore.teams.length" class="no-team">
      <el-result icon="info" title="你还没有加入任何团队">
        <template #extra>
          <el-button type="primary" @click="showCreateDialog = true">创建新团队</el-button>
          <el-button @click="showJoinDialog = true">加入已有团队</el-button>
        </template>
      </el-result>
    </div>

    <!-- Has at least one team -->
    <div v-else>
      <div class="page-header">
        <h2>团队管理</h2>
        <div>
          <el-button type="primary" @click="handleCreateTeamClick">创建新团队</el-button>
          <el-button @click="showJoinDialog = true">加入团队</el-button>
        </div>
      </div>

      <!-- Team cards -->
      <el-row :gutter="16">
        <el-col :span="8" v-for="t in teamStore.teams" :key="t.id">
          <el-card shadow="hover" class="team-card" :class="{ active: viewedTeamId === t.id }"
            @click="viewTeam(t)">
            <div class="team-card-body">
              <div class="team-card-header">
                <h3>
                  {{ t.name }}
                  <el-badge v-if="teamStore.pendingAppsByTeam[t.id]" :value="teamStore.pendingAppsByTeam[t.id]" class="pending-badge" />
                </h3>
                <el-tag size="small" :type="viewedTeamId === t.id ? 'success' : 'info'">
                  {{ viewedTeamId === t.id ? '查看中' : '点击查看' }}
                </el-tag>
              </div>
              <p>邀请码：<el-tag>{{ t.inviteCode }}</el-tag></p>
              <p v-if="t.maxMembers">上限 {{ t.maxMembers }} 人</p>
              <p v-if="t.createdAt">创建于 {{ formatDate(t.createdAt) }}</p>
            </div>
            <div class="team-card-actions" @click.stop>
              <el-button v-if="String(t.creatorId) === String(userStore.currentUser?.id)" link type="primary" size="small" @click="startEditTeam(t)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button link type="warning" size="small" @click="confirmLeaveTeam(t)">
                退出
              </el-button>
              <el-button v-if="String(t.creatorId) === String(userStore.currentUser?.id)" link type="danger" size="small" @click="confirmDeleteTeam(t)">
                解散
              </el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- Viewed team details -->
      <el-card v-if="viewedTeamId && teamStore.currentTeam" style="margin-top: 20px;">
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>{{ teamStore.currentTeam.name }} · 成员管理</span>
            <el-button type="primary" size="small" @click="showInviteDialog = true">
              <el-icon><Plus /></el-icon> 邀请成员
            </el-button>
          </div>
        </template>
        <el-table :data="teamStore.activeMembers" border style="width: 100%;">
          <el-table-column label="姓名">
            <template #default="scope">{{ scope.row.name || scope.row.nickname || '用户' + scope.row.userId }}</template>
          </el-table-column>
          <el-table-column label="角色" width="180">
            <template #default="scope">
              <el-select
                v-if="isMaster && String(scope.row.userId) !== String(userStore.currentUser?.id)"
                :model-value="Number(scope.row.role ?? 0)"
                @change="handleRoleChange(scope.row, $event)"
                size="small"
                placeholder="选择角色"
              >
                <el-option v-for="r in roleOptions" :key="r.value" :label="r.label" :value="r.value" />
              </el-select>
              <el-tag v-else :type="scope.row.role === ROLES.MASTER ? 'danger' : scope.row.role === ROLES.ADMIN ? 'warning' : 'info'">{{ getRoleLabel(scope.row.role) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="joinedAt" label="加入时间" width="180">
            <template #default="scope">{{ formatDateTime(scope.row.joinedAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" v-if="isMaster">
            <template #default="scope">
              <el-button
                v-if="String(scope.row.userId) !== String(userStore.currentUser?.id)"
                type="danger" link @click="handleRemoveClick(scope.row)"
              >移除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 入团申请 (团长 only) -->
        <div v-if="isMaster" style="margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600;">入团申请</span>
            <el-button size="small" @click="teamStore.fetchApplications()" :loading="loadingApps">刷新</el-button>
          </div>
          <el-table :data="teamStore.applications" border v-if="teamStore.applications.length">
            <el-table-column label="申请人">
              <template #default="scope">{{ scope.row.name || '用户' + scope.row.uid }}</template>
            </el-table-column>
            <el-table-column label="申请时间" width="180">
              <template #default="scope">{{ formatDateTime(scope.row.createTime) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="200">
              <template #default="scope">
                <el-button type="success" size="small" @click="handleApprove(scope.row.id)">通过</el-button>
                <el-button type="danger" size="small" @click="handleReject(scope.row.id)">拒绝</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="没有待审核的申请" :image-size="40" />
        </div>
      </el-card>

      <!-- Sprints -->
      <el-card v-if="viewedTeamId && teamStore.currentTeam" style="margin-top: 20px;">
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>Sprint 迭代</span>
            <el-button type="primary" size="small" @click="showSprintDialog = true">新建 Sprint</el-button>
          </div>
        </template>
        <el-table :data="teamStore.sprints" border>
          <el-table-column prop="name" label="名称" />
          <el-table-column label="开始日期">
            <template #default="scope">{{ formatDate(scope.row.startDate) }}</template>
          </el-table-column>
          <el-table-column label="结束日期">
            <template #default="scope">{{ formatDate(scope.row.endDate) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="scope">
              <el-tag :type="scope.row.isActive ? 'success' : 'info'">
                {{ scope.row.isActive ? '进行中' : '已结束' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- Create Team Dialog -->
    <el-dialog v-model="showCreateDialog" title="创建新团队" width="440px">
      <el-form>
        <el-form-item label="团队名称">
          <el-input v-model="newTeamName" placeholder="输入团队名称" maxlength="30" />
        </el-form-item>
        <el-form-item label="团队人数上限">
          <el-input-number v-model="newTeamSize" :min="2" :max="50" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateTeam" :disabled="!newTeamName.trim()">创建</el-button>
      </template>
    </el-dialog>

    <!-- Join Team Dialog -->
    <el-dialog v-model="showJoinDialog" title="加入团队" width="400px">
      <p style="margin-bottom: 12px; color: #909399;">输入团队 Tech Lead 分享的 6 位邀请码</p>
      <el-input v-model="inviteCode" placeholder="请输入6位邀请码" maxlength="6" />
      <template #footer>
        <el-button @click="showJoinDialog = false">取消</el-button>
        <el-button type="primary" @click="handleJoinTeam" :disabled="inviteCode.length !== 6">加入</el-button>
      </template>
    </el-dialog>

    <!-- Invite Dialog -->
    <el-dialog v-model="showInviteDialog" title="邀请成员" width="400px">
      <p>邀请码：<strong style="font-size: 24px; letter-spacing: 4px;">{{ teamStore.currentTeam?.inviteCode }}</strong></p>
      <p>分享链接：<el-link type="primary">{{ inviteLink }}</el-link></p>
      <template #footer>
        <el-button type="primary" @click="copyInviteCode">复制邀请码</el-button>
      </template>
    </el-dialog>

    <!-- Remove Member Dialog -->
    <el-dialog v-model="showRemoveDialog" title="移除成员" width="400px">
      <p>确定要移除 <strong>{{ memberToRemove?.name }}</strong> 吗？</p>
      <template #footer>
        <el-button @click="showRemoveDialog = false">取消</el-button>
        <el-button type="danger" @click="handleRemoveMember">确认移除</el-button>
      </template>
    </el-dialog>

    <!-- Edit Team Name Dialog -->
    <el-dialog v-model="showEditDialog" title="修改团队名称" width="400px">
      <el-input v-model="editTeamName" placeholder="输入新团队名称" maxlength="30" />
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="handleEditTeam" :disabled="!editTeamName.trim()">保存</el-button>
      </template>
    </el-dialog>

    <!-- Leave Team Confirm -->
    <el-dialog v-model="showLeaveDialog" title="退出团队" width="400px">
      <p>确定要退出 <strong>{{ leaveTarget?.name }}</strong> 吗？</p>
      <p style="color: #E6A23C; font-size: 13px;">退出后你将无法查看该团队的站会记录</p>
      <template #footer>
        <el-button @click="showLeaveDialog = false">取消</el-button>
        <el-button type="warning" @click="handleLeaveTeam">确认退出</el-button>
      </template>
    </el-dialog>

    <!-- Delete Team Confirm -->
    <el-dialog v-model="showDeleteDialog" title="解散团队" width="400px">
      <p>确定要解散 <strong>{{ deleteTarget?.name }}</strong> 吗？</p>
      <p style="color: #F56C6C; font-size: 13px;">解散后所有站会记录、待办将被归档，不可恢复</p>
      <template #footer>
        <el-button @click="showDeleteDialog = false">取消</el-button>
        <el-button type="danger" @click="handleDeleteTeam">确认解散</el-button>
      </template>
    </el-dialog>

    <!-- New Sprint Dialog -->
    <el-dialog v-model="showSprintDialog" title="新建 Sprint" width="440px">
      <el-form>
        <el-form-item label="名称">
          <el-input v-model="newSprint.name" placeholder="e.g. Sprint #2" />
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="newSprint.startDate" type="date" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="newSprint.endDate" type="date" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSprintDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateSprint">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '../stores/useUserStore'
import { useTeamStore } from '../stores/useTeamStore'
import { ROLES, ROLE_LABELS } from '../utils/constants'
import { formatDate, formatDateTime } from '../utils/formatters'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const userStore = useUserStore()
const teamStore = useTeamStore()

const viewedTeamId = ref(null)

async function viewTeam(team) {
  viewedTeamId.value = team.id
  await teamStore.switchTeam(team.id)
  teamStore.fetchApplications(team.id)
}

const loadingApps = ref(false)
async function handleApprove(appId) {
  const res = await teamStore.approveApplication(appId)
  if (res.success) ElMessage.success('已通过')
  else ElMessage.error(res.message || '操作失败')
}
async function handleReject(appId) {
  const res = await teamStore.rejectApplication(appId)
  if (res.success) ElMessage.success('已拒绝')
  else ElMessage.error(res.message || '操作失败')
}

const showCreateDialog = ref(false)
const showJoinDialog = ref(false)
const showInviteDialog = ref(false)
const showRemoveDialog = ref(false)
const showSprintDialog = ref(false)
const showEditDialog = ref(false)
const showLeaveDialog = ref(false)
const showDeleteDialog = ref(false)
const newTeamName = ref('')
const editTeamName = ref('')
const newTeamSize = ref(10)
const inviteCode = ref('')
const memberToRemove = ref(null)
const leaveTarget = ref(null)
const deleteTarget = ref(null)
const editTarget = ref(null)

// Current user's role in the viewed team (2=团长 1=管理员 0=团员)
const myRoleInTeam = computed(() => {
  const uid = userStore.currentUser?.id
  if (!uid) return null
  const m = teamStore.activeMembers.find(m =>
    String(m.userId) === String(uid) || String(m.id) === String(uid)
  )
  return m?.role != null ? m.role : null
})
const isMaster = computed(() => myRoleInTeam.value === ROLES.MASTER)

const newSprint = reactive({ name: '', startDate: null, endDate: null })

const roleOptions = Object.entries(ROLES).map(([key, value]) => ({
  label: ROLE_LABELS[value], value
}))

const inviteLink = computed(() => {
  const code = teamStore.currentTeam?.inviteCode || ''
  return `${window.location.origin}/join?code=${code}`
})

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role
}

function handleCreateTeamClick() {
  showCreateDialog.value = true
}

async function handleCreateTeam() {
  if (newTeamName.value.trim()) {
    await teamStore.createTeam(newTeamName.value.trim(), newTeamSize.value)
    showCreateDialog.value = false
    newTeamName.value = ''
    ElMessage.success('团队创建成功')
  }
}

async function handleJoinTeam() {
  const result = await teamStore.applyToJoin(inviteCode.value)
  if (result.success) {
    showJoinDialog.value = false
    inviteCode.value = ''
    ElMessage.success(result.message || '申请已提交，等待团长审核')
  } else {
    ElMessage.error(result.message || '申请失败')
  }
}

async function handleRoleChange(member, newRole) {
  const roleLabel = ROLE_LABELS[newRole] || newRole
  try {
    await ElMessageBox.confirm(
      `确定将 ${member.name || '用户' + member.userId} 的角色改为「${roleLabel}」？`,
      '确认更改角色',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await teamStore.changeMemberRole(member.id, newRole)
    if (result && result.success !== false) {
      ElMessage.success('角色已更新')
    } else {
      ElMessage.error(result?.message || '更新失败')
    }
  } catch { /* user cancelled */ }
}

function handleRemoveClick(member) {
  memberToRemove.value = member
  showRemoveDialog.value = true
}

async function handleRemoveMember() {
  if (memberToRemove.value) {
    const result = await teamStore.removeMember(memberToRemove.value.id)
    showRemoveDialog.value = false
    if (result && result.success) {
      ElMessage.success('成员已移除')
    } else {
      ElMessage.error(result?.message || '移除失败')
    }
  }
}

function copyInviteCode() {
  navigator.clipboard?.writeText(teamStore.currentTeam?.inviteCode || '').then(() => {
    ElMessage.success('邀请码已复制')
  }).catch(() => {
    ElMessage.info('请手动复制邀请码')
  })
}

function handleCreateSprint() {
  if (newSprint.name && newSprint.startDate && newSprint.endDate) {
    teamStore.createSprint(newSprint.name, newSprint.startDate, newSprint.endDate)
    showSprintDialog.value = false
    newSprint.name = ''
    newSprint.startDate = null
    newSprint.endDate = null
    ElMessage.success('Sprint 创建成功')
  }
}

function startEditTeam(team) {
  if (!isMaster.value) {
    ElMessage.error('只有团长可以修改团队名称')
    return
  }
  editTarget.value = team
  editTeamName.value = team.name
  showEditDialog.value = true
}

async function handleEditTeam() {
  if (!editTarget.value || !editTeamName.value.trim()) return
  if (editTeamName.value.trim() === editTarget.value.name) {
    showEditDialog.value = false
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定将团队名称改为「${editTeamName.value.trim()}」？`,
      '确认修改',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await teamStore.updateTeamName(editTarget.value.id, editTeamName.value.trim())
    showEditDialog.value = false
    if (result && result.success) {
      ElMessage.success('团队名称已更新')
    } else {
      ElMessage.error(result?.message || '更新失败')
    }
  } catch { /* cancelled */ }
}

function confirmLeaveTeam(team) {
  leaveTarget.value = team
  showLeaveDialog.value = true
}

function handleLeaveTeam() {
  if (leaveTarget.value) {
    teamStore.leaveTeam(leaveTarget.value.id)
    showLeaveDialog.value = false
    ElMessage.success('已退出团队')
  }
}

function confirmDeleteTeam(team) {
  deleteTarget.value = team
  showDeleteDialog.value = true
}

async function handleDeleteTeam() {
  if (deleteTarget.value) {
    await teamStore.deleteTeam(deleteTarget.value.id)
    showDeleteDialog.value = false
    ElMessage.success('团队已解散')
  }
}

onMounted(async () => {
  // Ensure team data is fresh and WS is connected for real-time sync
  await teamStore.fetchMyTeams()
  // Auto-join via invite link
  const code = route.query.code
  if (code && !teamStore.teams.find(t => t.inviteCode === code)) {
    teamStore.applyToJoin(code).then(r => {
      if (r.success) ElMessage.success(r.message || '已通过邀请链接提交申请')
    })
  }
  // Auto-view first team
  if (teamStore.teams.length && !viewedTeamId.value) {
    viewTeam(teamStore.teams[0])
  }
})
</script>

<style scoped>
.no-team {
  padding-top: 80px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.team-card {
  cursor: pointer;
  margin-bottom: 16px;
  transition: border-color 0.2s;
}
.team-card h3 {
  margin: 0 0 8px 0;
}
.team-card p {
  margin: 4px 0;
  font-size: 13px;
}
.team-card.active {
  border-color: #4094ED;
  box-shadow: 0 0 0 1px #4094ED;
}
.team-card-body {
  cursor: pointer;
}
.team-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.team-card-header h3 {
  margin: 0;
}
.team-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--card-border, #EBEEF5);
}
</style>
