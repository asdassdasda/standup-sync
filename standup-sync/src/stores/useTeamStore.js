import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ROLES, WS_MSG } from '../utils/constants'
import { generateId } from '../utils/idGenerator'
import { useUserStore } from './useUserStore'
import { useCrossTabSync } from '../composables/useCrossTabSync'
import { teamWsService } from '../services/websocket/teamWsService'
import { ElMessage } from 'element-plus'

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
  const totalPendingCount = computed(() => {
    return Object.values(pendingAppsByTeam.value).reduce((sum, c) => sum + (c || 0), 0)
  })

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
      teamWsService.on(WS_MSG.TEAM_MEMBER_JOINED, (p) => {
        const tid = (p && p.teamId) || activeTeamId.value
        if (tid) loadMembers(tid)
      }),
      teamWsService.on(WS_MSG.TEAM_MEMBER_REMOVED, (p) => {
        const tid = (p && p.teamId) || activeTeamId.value
        const removedUserId = p && p.userId
        const myUid = useUserStore().currentUser?.id
        if (removedUserId != null && String(removedUserId) === String(myUid)) {
          // Current user was removed — refresh full team list
          const teamName = (p && p.teamName) || ''
          ElMessage.warning(teamName ? `你已被移出「${teamName}」` : '你已被移出团队')
          teamWsService.disconnect()
          fetchMyTeams().then(() => {
            setTimeout(() => { window.location.reload() }, 500)
          })
          return
        }
        if (tid) loadMembers(tid)
      }),
      teamWsService.on(WS_MSG.TEAM_MEMBER_ROLE, (p) => {
        const tid = (p && p.teamId) || activeTeamId.value
        if (tid) loadMembers(tid)
      }),
      // New application submitted — 团长 gets notification + badge + refresh
      teamWsService.on(WS_MSG.TEAM_APPLY_SUBMITTED, (p) => {
        const tid = p && p.teamId
        const userName = (p && p.userName) || '有人'
        const teamName = (p && p.teamName) || ''
        if (tid) {
          pendingAppsByTeam.value[tid] = (pendingAppsByTeam.value[tid] || 0) + 1
          fetchApplications(tid)
          ElMessage.info(`${userName} 申请加入「${teamName}」`)
        }
      }),
      teamWsService.on(WS_MSG.TEAM_APPLY_APPROVED, (p) => {
        const uid = p && p.uid
        const tid = p && p.teamId
        const myUid = useUserStore().currentUser?.id
        const isMe = uid != null && String(uid) === String(myUid)
        if (isMe) {
          fetchMyTeams().then(() => {
            if (tid) {
              activeTeamId.value = tid
              teamWsService.connect(tid)
              loadMembers(tid)
            }
            ElMessage.success('你的入团申请已通过！')
            // Force refresh current page to show new team
            setTimeout(() => { window.location.reload() }, 500)
          })
        }
        // Update badge (other users)
        if (tid) {
          pendingAppsByTeam.value[tid] = Math.max(0, (pendingAppsByTeam.value[tid] || 1) - 1)
        }
      }),
      teamWsService.on(WS_MSG.TEAM_APPLY_REJECTED, (p) => {
        const uid = p && p.uid
        const tid = p && p.teamId
        const myUid = useUserStore().currentUser?.id
        if (uid != null && String(uid) === String(myUid)) {
          ElMessage.warning('你的入团申请已被拒绝')
        }
        if (tid) {
          pendingAppsByTeam.value[tid] = Math.max(0, (pendingAppsByTeam.value[tid] || 1) - 1)
        }
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
    if (res && res.code === 200) {
      teams.value = res.data || []
      if (!activeTeamId.value && teams.value.length > 0) {
        activeTeamId.value = teams.value[0].id
      }
      if (activeTeamId.value) {
        teamWsService.connect(activeTeamId.value)
      } else {
        teamWsService.disconnect()
      }
      if (teams.value.length > 0) {
        fetchAllPendingCounts()
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
  // 3. 申请加入团队（提交审核） — POST /api/teams/join?inviteCode=xxx
  // ========================================================
  async function applyToJoin(code) {
    if (!/^\d{6}$/.test(code)) return { success: false, message: '邀请码格式错误，请输入6位数字' }
    const res = await callApi('POST', `/teams/join?inviteCode=${code}`)
    if (res && res.code === 200) {
      // Connect to team WS so applicant receives approval notification
      if (res.data && res.data.teamId) {
        teamWsService.connect(res.data.teamId)
      }
      return { success: true, message: '申请已提交，等待团长审核' }
    }
    return { success: false, message: res ? res.msg : '网络错误' }
  }

  // ========================================================
  // 3b. 获取待审核申请列表（团长 only）
  // ========================================================
  const applications = ref([])
  const pendingAppsByTeam = ref({})  // { [teamId]: count }

  async function fetchApplications(teamId) {
    const tid = teamId || currentTeam.value?.id
    if (!tid) return
    const res = await callApi('GET', `/teams/${tid}/applications`)
    if (res && res.code === 200) {
      applications.value = res.data || []
      pendingAppsByTeam.value[tid] = applications.value.length
    }
  }

  // Fetch pending counts for all teams where user is 团长
  async function fetchAllPendingCounts() {
    for (const t of teams.value) {
      try {
        const res = await callApi('GET', `/teams/${t.id}/applications`)
        if (res && res.code === 200) {
          pendingAppsByTeam.value[t.id] = (res.data || []).length
        }
      } catch { /* skip */ }
    }
  }

  async function approveApplication(appId) {
    const tid = currentTeam.value?.id
    if (!tid) return { success: false }
    const res = await callApi('POST', `/teams/${tid}/applications/${appId}/approve`)
    if (res && res.code === 200) {
      // Immediately remove from local list using splice
      const idx = applications.value.findIndex(a => String(a.id) === String(appId))
      if (idx > -1) applications.value.splice(idx, 1)
      // Update badge
      pendingAppsByTeam.value[tid] = Math.max(0, (pendingAppsByTeam.value[tid] || 1) - 1)
      await loadMembers(tid)
      broadcast('team', 'members-changed', { teamId: tid })
      return { success: true }
    }
    return { success: false, message: res?.msg }
  }

  async function rejectApplication(appId) {
    const tid = currentTeam.value?.id
    if (!tid) return { success: false }
    const res = await callApi('POST', `/teams/${tid}/applications/${appId}/reject`)
    if (res && res.code === 200) {
      // Immediately remove from local list using splice
      const idx = applications.value.findIndex(a => String(a.id) === String(appId))
      if (idx > -1) applications.value.splice(idx, 1)
      // Update badge
      pendingAppsByTeam.value[tid] = Math.max(0, (pendingAppsByTeam.value[tid] || 1) - 1)
      return { success: true }
    }
    return { success: false, message: res?.msg }
  }

  // ========================================================
  // 4. 删除团队 (Tech Lead) — POST /api/teams/{id}/dissolve
  // ========================================================
  async function deleteTeam(teamId) {
    const res = await callApi('POST', `/teams/${teamId}/dissolve`)
    if (res && res.code === 200) {
      teams.value = teams.value.filter(t => t.id !== teamId)
      if (activeTeamId.value === teamId) {
        activeTeamId.value = teams.value[0]?.id || null
      }
      members.value = []
      sprints.value = []
      broadcast('team', 'teams-changed')
      return { success: true }
    }
    return { success: false, message: res?.msg || '解散失败' }
  }
  // 自检: ✅ 先调后端解散, 再从本地列表移除, 清理关联数据

  // ========================================================
  // 5. 切换当前团队
  // ========================================================
  async function switchTeam(teamId) {
    activeTeamId.value = teamId
    await Promise.all([loadMembers(teamId), fetchSprints()])
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
    if (!teamId) return { success: false, message: '未选择团队' }
    const res = await callApi('DELETE', `/teams/${teamId}/members/${memberId}`)
    if (res && res.code === 200) {
      // Immediately remove from local list
      const idx = members.value.findIndex(m => m.id === memberId)
      if (idx > -1) members.value.splice(idx, 1)
      broadcast('team', 'members-changed', { teamId })
      return { success: true }
    }
    return { success: false, message: res?.msg || '移除失败' }
  }

  // ========================================================
  // 8. 修改成员角色 (Tech Lead) — PUT /api/teams/{teamId}/members/{id}/role?role=xxx
  // ========================================================
  async function changeMemberRole(memberId, newRole) {
    const teamId = currentTeam.value?.id
    if (!teamId) return { success: false, message: '未选择团队' }
    const res = await callApi('PUT', `/teams/${teamId}/members/${memberId}/role?role=${newRole}`)
    if (res && res.code === 200) {
      const member = members.value.find(m => m.id === memberId)
      if (member) member.role = newRole
      broadcast('team', 'members-changed', { teamId })
      return { success: true }
    }
    return { success: false, message: res?.msg || '更新失败' }
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
    const res = await callApi('PUT', `/teams/${teamId}?name=${encodeURIComponent(name)}`)
    if (res && res.code === 200) {
      const team = teams.value.find(t => t.id === teamId)
      if (team) team.name = name
      broadcast('team', 'teams-changed')
      return { success: true }
    }
    return { success: false, message: res?.msg || '更新失败' }
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
  // 6b. 加载团队迭代 — GET /api/sprints?teamId=xxx
  // ========================================================
  async function fetchSprints() {
    const res = await callApi('GET', '/sprints')
    if (res && res.code === 200 && res.data) {
      sprints.value = res.data
    }
  }

  // ========================================================
  // 12. 创建 Sprint — POST /api/sprints
  // ========================================================
  async function createSprint(name, startDate, endDate) {
    const sd = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate
    const ed = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate
    const res = await callApi('POST', `/sprints?name=${encodeURIComponent(name)}&startDate=${sd || ''}&endDate=${ed || ''}`)
    if (res && res.code === 200) {
      await fetchSprints()
      return { success: true }
    }
    return { success: false, message: res?.msg || '创建失败' }
  }

  // --- helpers ---
  function randCode() { return String(Math.floor(100000 + Math.random() * 900000)) }

  function seedDefaultSprint() {
    sprints.value = [{ id: generateId('sprint_'), name: 'Sprint #1', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 86400000).toISOString(), isActive: true }]
  }

  function seedLocalMember() {
    const u = useUserStore()
    members.value = [{ id: u.currentUser?.id || generateId('m_'), name: u.currentUser?.name || '创始人', role: ROLES.MASTER, joinedAt: new Date().toISOString(), isActive: true }]
  }

  return {
    teams, activeTeamId, members, sprints, loading,
    currentTeam, activeMembers, activeSprint, sprintOptions, applications, pendingAppsByTeam, totalPendingCount,
    fetchMyTeams, createTeam, applyToJoin, deleteTeam, switchTeam,
    loadMembers, fetchSprints, removeMember, changeMemberRole, regenerateInviteCode,
    updateTeamName, leaveTeam, createSprint,
    fetchApplications, approveApplication, rejectApplication, fetchAllPendingCounts
  }
}, {
  persist: { key: 'team', pick: ['teams', 'activeTeamId'] }
})
