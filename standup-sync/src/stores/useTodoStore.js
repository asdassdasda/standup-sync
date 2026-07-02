import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { TODO_STATUS } from '../utils/constants'
import { isOverdue } from '../utils/formatters'
import { useCrossTabSync } from '../composables/useCrossTabSync'
import { generateId } from '../utils/idGenerator'
import { WS_MSG } from '../utils/constants'
import { teamWsService } from '../services/websocket/teamWsService'
import { useUserStore } from './useUserStore'

async function callApi(method, url, data) {
  try {
    const { apiGet, apiPost, apiPatch } = await import('../services/api/index.js')
    if (method === 'GET')    return await apiGet(url)
    if (method === 'POST')   return await apiPost(url, data)
    if (method === 'PATCH')  return await apiPatch(url, data)
  } catch (e) { console.error('callApi error:', e); return null }
}

export const useTodoStore = defineStore('todo', () => {
  const todos = ref([])
  const selectedTodoId = ref(null)
  const activeTab = ref('all')
  const loading = ref(false)
  const notifications = ref([])

  const todosWithOverdue = computed(() =>
    todos.value.map(t => ({
      ...t,
      isOverdue: t.status !== 'done' && t.status !== 'cancelled' ? isOverdue(t.deadline) : false
    }))
  )
  const filteredTodos = computed(() => {
    const list = todosWithOverdue.value
    if (activeTab.value === 'all') return list
    return list.filter(t => t.status === activeTab.value)
  })
  const tabCounts = computed(() => ({
    all: todos.value.length,
    pending: todos.value.filter(t => t.status === 'pending').length,
    in_progress: todos.value.filter(t => t.status === 'in_progress').length,
    done: todos.value.filter(t => t.status === 'done').length
  }))
  const selectedTodo = computed(() =>
    selectedTodoId.value ? todosWithOverdue.value.find(t => t.id === selectedTodoId.value) || null : null
  )
  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

  // --- API Actions ---
  async function fetchTodos() {
    loading.value = true
    const res = await callApi('GET', '/todos/mine')
    if (res && res.code === 200) {
      todos.value = res.data || []
    }
    loading.value = false
  }

  async function createTodo(data) {
    const res = await callApi('POST', '/todos', {
      teamId: data.teamId,
      content: data.content,
      assigneeId: data.assigneeId,
      priority: data.priority || 'medium',
      deadline: data.deadline || null,
      sprintId: data.sprintId || null,
      sourceStandupId: data.sourceStandupId || null
    })
    if (res && res.code === 200) {
      await fetchTodos()
      return { success: true, data: res.data }
    }
    return { success: false, message: res?.msg || '创建失败' }
  }

  async function updateTodoStatus(id, status) {
    const res = await callApi('PATCH', `/todos/${id}/status?status=${status}`)
    if (res && res.code === 200) {
      const todo = todos.value.find(t => t.id === id)
      if (todo) todo.status = status
      broadcast('todo', 'updated', { id, status })
      return { success: true }
    }
    return { success: false, message: res?.msg || '更新失败' }
  }

  function selectTodo(id) { selectedTodoId.value = id }
  function setActiveTab(tab) { activeTab.value = tab }

  // --- Cross-tab sync ---
  const { register, broadcast } = useCrossTabSync()
  register('todo', (action, payload) => {
    if (action === 'updated') {
      const t = todos.value.find(t => t.id === payload.id)
      if (t) Object.assign(t, payload)
    }
  })

  function addNotification(type, message, todoId, detail) {
    notifications.value.unshift({
      id: generateId('notif_'), type, message,
      todoId: todoId || null, detail: detail || '',
      processed: false, time: new Date().toISOString(), read: false
    })
    if (notifications.value.length > 50) notifications.value.pop()
  }
  function markAllRead() { notifications.value.forEach(n => { n.read = true }) }
  function clearNotifications() { notifications.value = [] }

  function autoGenerateFromActionItems(actionItems, standupId) {
    if (!actionItems || !actionItems.length) return
    actionItems.forEach(item => {
      createTodo({
        teamId: null,
        content: item.text || item.content || '',
        assigneeId: item.assigneeId || null,
        priority: item.priority || 'medium',
        sourceStandupId: standupId,
        deadline: item.deadline || null
      })
    })
  }

  // --- WebSocket 实时通知 ---
  async function getIsMaster(teamId) {
    try {
      const { useTeamStore } = await import('./useTeamStore.js')
      const ts = useTeamStore()
      const uid = useUserStore().currentUser?.id
      if (!uid) return false
      const m = ts.activeMembers.find(m => String(m.userId) === String(uid))
      if (m && m.role != null) return m.role === 2
      const team = ts.teams.find(t => String(t.id) === String(teamId))
      if (team && String(team.creatorId) === String(uid)) return true
      return false
    } catch { return false }
  }

  let _wsUnsubs = []
  function _fixWs() {
    _wsUnsubs.forEach(fn => fn())
    _wsUnsubs = [
      teamWsService.on(WS_MSG.TODO_CREATED, async () => {
        const { useTeamStore } = await import('./useTeamStore.js')
        const tid = useTeamStore().activeTeamId
        if (tid) fetchTodos(tid)
      }),
      teamWsService.on(WS_MSG.TODO_UPDATED, (p) => {
        if (p && p.id) {
          const t = todos.value.find(t => t.id === p.id)
          if (t && p.status) t.status = p.status
        }
      }),
      teamWsService.on('todo:assigned', (p) => {
        const myUid = useUserStore().currentUser?.id
        if (p && p.assigneeId != null && String(p.assigneeId) === String(myUid)) {
          addNotification('assigned', '你被分配了新待办')
        }
      }),
      teamWsService.on('todo:status-changed', async (p) => {
        const myUid = useUserStore().currentUser?.id
        if (p && p.operatorId != null && String(p.operatorId) === String(myUid)) return
        if (p && p.teamId) {
          const isMaster = await getIsMaster(p.teamId)
          if (isMaster) {
            const labels = { pending: '待处理', in_progress: '进行中', done: '已完成', cancelled: '已取消' }
            addNotification('status', `${p.operatorName} 将待办标记为${labels[p.newStatus] || p.newStatus}`)
          }
        }
      }),
      teamWsService.on('todo:transfer-requested', async (p) => {
        if (p && p.teamId) {
          const isMaster = await getIsMaster(p.teamId)
          if (isMaster) addNotification('transfer-request', '待办转让请求', p.todoId, `"${p.content||''}"`)
        }
      }),
      teamWsService.on('todo:transfer-approved', async (p) => {
        const myUid = useUserStore().currentUser?.id
        const isOld = p && p.oldAssigneeId != null && String(p.oldAssigneeId) === String(myUid)
        const isNew = p && p.newAssigneeId != null && String(p.newAssigneeId) === String(myUid)
        notifications.value = notifications.value.map(n => {
          if ((n.type === 'transfer-request' || n.type === 'transfer') && String(n.todoId) === String(p && p.todoId))
            return { ...n, processed: true, read: true }
          return n
        })
        if (isOld && isNew) return
        if (isOld) addNotification('transfer', '待办已转出', p.todoId, p.content ? `"${p.content}"` : '')
        else if (isNew) {
          const isMaster = p.teamId ? await getIsMaster(p.teamId) : false
          if (!isMaster) addNotification('transfer', '待办已转入给你', p.todoId, p.content ? `"${p.content}"` : '')
        }
      })
    ]
  }
  _fixWs()

  return {
    todos, selectedTodoId, activeTab, loading,
    notifications, unreadCount,
    todosWithOverdue, filteredTodos, tabCounts, selectedTodo,
    fetchTodos, createTodo, updateTodoStatus, selectTodo, setActiveTab,
    addNotification, markAllRead, clearNotifications,
    autoGenerateFromActionItems
  }
}, {
  persist: { key: 'todos', pick: ['activeTab', 'notifications'] }
})
