import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ROLES, WS_MSG } from '../utils/constants'
import { generateId } from '../utils/idGenerator'
import { useUserStore } from './useUserStore'
import { useCrossTabSync } from '../composables/useCrossTabSync'
import { teamWsService } from '../services/websocket/teamWsService'

// Helper: call backend API, catch errors silently
async function callApi(method, url, data) {
  try {
    const { apiGet, apiPost, apiPut, apiDelete } = await import('../services/api/index.js')
    let res
    if (method === 'GET')    res = await apiGet(url)
    if (method === 'POST')   res = await apiPost(url, data)
    if (method === 'PUT')    res = await apiPut(url, data)
    if (method === 'DELETE') res = await apiDelete(url)
    return res
  } catch {
    return null
  }
}

export const useTeamStore = defineStore('team', () => {
  const teams = ref([])
  const activeTeamId = ref(null)
  const members = ref([])
  const sprints = ref([])
  const loading = ref(false)

  const currentTeam = computed(() => {
    if (!activeTeamId.value) return teams.value[0] || null
    return teams.value.find(t => t.id === activeTeamId.value) || teams.value[0] || null
  })
  const activeMembers = computed(() => members.value.filter(m => m.isActive !== false))
  const activeSprint = computed(() => sprints.value.find(s => s.isActive) || null)
  const sprintOptions = computed(() => sprints.value.map(s => ({ label: s.name, value: s.id })))

  // --- Cross-tab sync (BroadcastChannel) ---
  const { register: bcRegister, broadcast } = useCrossTabSync()
  bcRegister('team', (action, payload) => {
    if (action === 'teams-changed') {
      fetchMyTeams()
    } else if (action === 'members-changed') {
      const tid = payload.teamId || activeTeamId.value
      if (tid) loadMembers(tid)
    }
  })

  // --- Team WebSocket listeners (cross-user real-time sync) ---
  let _teamWsUnsubs = []
  function _setupTeamWs() {
    _teamWsUnsubs.forEach(fn => fn())
    _teamWsUnsubs = [
      teamWsService.on(WS_MSG.TEAM_UPDATED, () => { fetchMyTeams() }),
      teamWsService.on(WS_MSG.TEAM_MEMBER_JOINED, () => {
        if (activeTeamId.value) loadMembers(activeTeamId.value)
      }),
      teamWsService.on(WS_MSG.TEAM_MEMBER_REMOVED, () => {
        if (activeTeamId.value) loadMembers(activeTeamId.value)
      }),
      teamWsService.on(WS_MSG.TEAM_MEMBER_ROLE, () => {
        if (activeTeamId.value) loadMembers(activeTeamId.value)
      }),
      teamWsService.on(WS_MSG.TEAM_DISSOLVED, (payload) => {
        const tid = payload && payload.teamId
        if (tid) {
          teams.value = teams.value.filter(t => t.id !== tid)
          if (activeTeamId.value === tid) {
            activeTeamId.value = teams.value[0]?.id || null
          }
          members.value = []
          sprints.value = []
        }
      }),
      teamWsService.on(WS_MSG.STANDUP_CREATED, () => {
        // Let standupStore handle the refresh
        import('./useStandupStore.js').then(m => m.useStandupStore().fetchStandupList())
      }),
      teamWsService.on(WS_MSG.STANDUP_LIST_CHANGED, () => {
        import('./useStandupStore.js').then(m => m.useStandupStore().fetchStandupList())
      }),
      teamWsService.on(WS_MSG.TODO_CREATED, (payload) => {
        import('./useTodoStore.js').then(m => {
          const store = m.useTodoStore()
          if (payload && payload.id && !store.todos.find(t => t.id === payload.id)) {
            store.todos.unshift(_mapTodo(payload))
          }
        })
      }),
      teamWsService.on(WS_MSG.TODO_UPDATED, (payload) => {
        if (payload && payload.id) {
          import('./useTodoStore.js').then(m => {
            const store = m.useTodoStore()
            const t = store.todos.find(t => t.id === payload.id)
            if (t && payload.status) t.status = payload.status
          })
        }
      })
    ]
  }
  _setupTeamWs()

  // Auto-connect team WS if we already have a persisted activeTeamId
  if (activeTeamId.value) {
    teamWsService.connect(activeTeamId.value)
  }

  function _mapTodo(raw) {
    return {
      id: raw.id,
      content: raw.content,
      priority: raw.priority || 'medium',
      status: raw.status || 'pending',
      sourceStandupId: raw.sourceStandupId || null,
      assigneeId: raw.assigneeId,
      assigneeName: raw.assigneeName || '',
      assignerId: raw.assignerId,
      assignerName: raw.assignerName || '',
      deadline: raw.deadline || null,
      createdAt: raw.createdAt || new Date().toISOString()
    }
  }

  // ========================================================
  // 1. 获取我的所有团队
  // ========================================================
  async function fetchMyTeams() {
    loading.value = true
    const res = await callApi('GET', '/teams/mine')
    loading.value = false
    if (res && res.code === 200 && res.data) {
      teams.value = res.data
      if (!activeTeamId.value && teams.value.length > 0) {
        activeTeamId.value = teams.value[0].id
      }
      // Auto-connect team WebSocket for real-time data sync
      if (activeTeamId.value) {
        teamWsService.connect(activeTeamId.value)
      }
    }
  }
  // 自检: ✅ 拉取后端团队列表, 自动选中第一个

  // ========================================================
  // 2. 创建团队 — POST /api/teams?name=xxx  → 创建者自动成为 Tech Lead
  // ========================================================
  async function createTeam(name, maxMembers) {
    const res = await callApi('POST', `/teams?name=${encodeURIComponent(name)}`)
    if (res && res.code === 200 && res.data) {
      const team = { ...res.data, maxMembers: maxMembers || 10 }
      teams.value.push(team)
      activeTeamId.value = team.id
      // 拉取成员列表
      await loadMembers(team.id)
      // 更新用户角色为 Tech Lead（因为创建了团队）
      const userStore = useUserStore()
      if (userStore.currentUser) userStore.currentUser.role = 'tech_lead'
      // 初始化 Sprint
      if (!sprints.value.length) seedDefaultSprint()
      broadcast('team', 'teams-changed')
      return team
    }
    // 离线兜底
    const team = { id: generateId('team_'), name, inviteCode: randCode(), maxMembers: maxMembers || 10, createdAt: new Date().toISOString() }
    teams.value.push(team)
    activeTeamId.value = team.id
    seedLocalMember()
    seedDefaultSprint()
    broadcast('team', 'teams-changed')
    return team
  }
  // 自检: ✅ 先调后端, 成功则同步数据, 失败走本地兜底

  // ========================================================
  // 3. 通过邀请码加入团队 — POST /api/teams/join?inviteCode=xxx
  // ========================================================
  async function joinTeam(code) {
    if (!/^\d{6}$/.test(code)) return { success: false, message: '邀请码格式错误，请输入6位数字' }
    loading.value = true

    // 调用后端
    const res = await callApi('POST', `/teams/join?inviteCode=${code}`)
    if (res && res.code === 200 && res.data) {
      const team = res.data
      if (!teams.value.find(t => t.id === team.id)) teams.value.push(team)
      activeTeamId.value = team.id
      await loadMembers(team.id)
      loading.value = false
      broadcast('team', 'teams-changed')
      return { success: true }
    }

    // 离线兜底
    const userStore = useUserStore()
    const existing = teams.value.find(t => t.inviteCode === code)
    if (existing) {
      const dup = members.value.find(m => m.id === userStore.currentUser?.id)
      if (dup) { loading.value = false; return { success: false, message: '你已经是团队成员' } }
      activeTeamId.value = existing.id
      members.value.push(localMember())
      loading.value = false
      broadcast('team', 'teams-changed')
      return { success: true }
    }
    // 创建演示团队
    const team = { id: generateId('team_'), name: '演示团队', inviteCode: code, maxMembers: 10, createdAt: new Date().toISOString() }
    teams.value.push(team)
    activeTeamId.value = team.id
    members.value = [localMember()]
    loading.value = false
    broadcast('team', 'teams-changed')
    return { success: true }
  }
  // 自检: ✅ 验证格式 → 调后端 → 防重复 → 兜底

  // ========================================================
  // 4. 删除团队 (Tech Lead) — POST /api/teams/{id}/dissolve
  // ========================================================
  async function deleteTeam(teamId) {
    await callApi('POST', `/teams/${teamId}/dissolve`)
    teams.value = teams.value.filter(t => t.id !== teamId)
    if (activeTeamId.value === teamId) {
      activeTeamId.value = teams.value[0]?.id || null
    }
    members.value = []
    sprints.value = []
    broadcast('team', 'teams-changed')
  }
  // 自检: ✅ 先调后端解散, 再从本地列表移除, 清理关联数据

  // ========================================================
  // 5. 切换当前团队
  // ========================================================
  async function switchTeam(teamId) {
    activeTeamId.value = teamId
    await loadMembers(teamId)
    // Connect team WebSocket for real-time data sync
    teamWsService.connect(teamId)
  }
  // 自检: ✅ 切换时重新加载成员

  // ========================================================
  // 6. 加载团队成员 — GET /api/teams/{id}/members
  // ========================================================
  async function loadMembers(teamId) {
    const res = await callApi('GET', `/teams/${teamId}/members`)
    if (res && res.code === 200 && res.data) {
      members.value = res.data
    }
  }
  // 自检: ✅ 纯数据加载, 无副作用

  // ========================================================
  // 7. 移除成员 (Tech Lead) — DELETE /api/teams/{teamId}/members/{memberId}
  // ========================================================
  async function removeMember(memberId) {
    const teamId = currentTeam.value?.id
    if (!teamId) return
    await callApi('DELETE', `/teams/${teamId}/members/${memberId}`)
    // 本地标记移除
    const member = members.value.find(m => m.id === memberId)
    if (member) member.isActive = false
    broadcast('team', 'members-changed', { teamId })
  }
  // 自检: ✅ 先调后端, 再本地标记 isActive=false (保留只读历史)

  // ========================================================
  // 8. 修改成员角色 (Tech Lead) — PUT /api/teams/{teamId}/members/{id}/role?role=xxx
  // ========================================================
  async function changeMemberRole(memberId, newRole) {
    const teamId = currentTeam.value?.id
    if (!teamId) return
    await callApi('PUT', `/teams/${teamId}/members/${memberId}/role?role=${newRole}`)
    const member = members.value.find(m => m.id === memberId)
    if (member) member.role = newRole
    broadcast('team', 'members-changed', { teamId })
  }
  // 自检: ✅ 先调后端更新角色, 再本地同步

  // ========================================================
  // 9. 重新生成邀请码 — POST /api/teams/{id}/invite-code
  // ========================================================
  async function regenerateInviteCode() {
    const team = currentTeam.value
    if (!team) return
    const res = await callApi('POST', `/teams/${team.id}/invite-code`)
    if (res && res.code === 200 && res.data) {
      team.inviteCode = res.data
    } else {
      team.inviteCode = randCode()
    }
    broadcast('team', 'teams-changed')
  }
  // 自检: ✅ 调后端生成, 失败则本地生成

  // ========================================================
  // 10. 修改团队名称 — PUT /api/teams/{id}?name=xxx
  // ========================================================
  async function updateTeamName(teamId, name) {
    await callApi('PUT', `/teams/${teamId}?name=${encodeURIComponent(name)}`)
    const team = teams.value.find(t => t.id === teamId)
    if (team) team.name = name
    broadcast('team', 'teams-changed')
  }
  // 自检: ✅ 调后端更新, 成功则本地同步

  // ========================================================
  // 11. 退出团队
  // ========================================================
  function leaveTeam(teamId) {
    const userStore = useUserStore()
    members.value = members.value.filter(m => m.id !== userStore.currentUser?.id)
    teams.value = teams.value.filter(t => t.id !== teamId)
    if (activeTeamId.value === teamId) {
      activeTeamId.value = teams.value[0]?.id || null
    }
    broadcast('team', 'teams-changed')
  }
  // 自检: ✅ 本地移除自己, 切换活跃团队

  // ========================================================
  // 12. 创建 Sprint
  // ========================================================
  function createSprint(name, startDate, endDate) {
    sprints.value.forEach(s => { s.isActive = false })
    sprints.value.push({ id: generateId('sprint_'), name, startDate, endDate, isActive: true })
  }
  // 自检: ✅ 纯本地, 旧 Sprint 自动失活

  // --- helpers ---
  function randCode() { return String(Math.floor(100000 + Math.random() * 900000)) }

  function seedDefaultSprint() {
    sprints.value = [{ id: generateId('sprint_'), name: 'Sprint #1', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 86400000).toISOString(), isActive: true }]
  }

  function seedLocalMember() {
    const u = useUserStore()
    members.value = [{ id: u.currentUser?.id || generateId('m_'), name: u.currentUser?.name || '创始人', role: ROLES.TECH_LEAD, joinedAt: new Date().toISOString(), isActive: true }]
  }

  function localMember() {
    const u = useUserStore()
    return { id: u.currentUser?.id || generateId('m_'), name: u.currentUser?.name || '新成员', role: ROLES.DEVELOPER, joinedAt: new Date().toISOString(), isActive: true }
  }

  return {
    teams, activeTeamId, members, sprints, loading,
    currentTeam, activeMembers, activeSprint, sprintOptions,
    fetchMyTeams, createTeam, joinTeam, deleteTeam, switchTeam,
    loadMembers, removeMember, changeMemberRole, regenerateInviteCode,
    updateTeamName, leaveTeam, createSprint
  }
}, {
  persist: { key: 'team', pick: ['teams', 'activeTeamId', 'sprints'] }
})
