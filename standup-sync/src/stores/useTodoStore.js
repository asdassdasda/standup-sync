import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { generateId } from '../utils/idGenerator'
import { TODO_STATUS } from '../utils/constants'
import { isOverdue } from '../utils/formatters'
import { useCrossTabSync } from '../composables/useCrossTabSync'

export const useTodoStore = defineStore('todo', () => {
  const todos = ref([
    { id: 't1', content: '修复登录页面Bug', priority: 'high', status: TODO_STATUS.PENDING, sourceStandupId: 'st-1', sourceStandupDate: '06-25', assigneeId: 'u1', assigneeName: '张三', assignerId: 'u2', assignerName: '李四（SM）', deadline: new Date(Date.now() + 86400000).toISOString(), createdAt: '2026-06-25' },
    { id: 't2', content: '编写接口文档', priority: 'medium', status: TODO_STATUS.IN_PROGRESS, sourceStandupId: 'st-2', sourceStandupDate: '06-24', assigneeId: 'u4', assigneeName: '赵六', assignerId: 'u2', assignerName: '李四（SM）', deadline: new Date(Date.now() + 3 * 86400000).toISOString(), createdAt: '2026-06-24' },
    { id: 't3', content: 'CR 王五代码', priority: 'medium', status: TODO_STATUS.PENDING, sourceStandupId: 'st-3', sourceStandupDate: '06-23', assigneeId: 'u2', assigneeName: '李四', assignerId: 'u1', assignerName: '张三', deadline: '2026-06-25', createdAt: '2026-06-23', isOverdue: true },
    { id: 't4', content: '更新项目README', priority: 'medium', status: TODO_STATUS.DONE, sourceStandupId: 'st-4', sourceStandupDate: '06-22', assigneeId: 'u3', assigneeName: '王五', assignerId: 'u1', assignerName: '张三', deadline: '2026-06-23', createdAt: '2026-06-22' },
    { id: 't5', content: '部署测试环境', priority: 'high', status: TODO_STATUS.PENDING, sourceStandupId: 'st-5', sourceStandupDate: '06-21', assigneeId: 'u3', assigneeName: '王五', assignerId: 'u2', assignerName: '李四（SM）', deadline: '2026-06-20', createdAt: '2026-06-21', isOverdue: true }
  ])
  const selectedTodoId = ref(null)
  const activeTab = ref('all')
  const loading = ref(false)

  const todosWithOverdue = computed(() => {
    return todos.value.map(t => ({
      ...t,
      isOverdue: isOverdue(t.deadline) && t.status !== TODO_STATUS.DONE && t.status !== TODO_STATUS.CANCELLED
    }))
  })

  const filteredTodos = computed(() => {
    const list = todosWithOverdue.value
    switch (activeTab.value) {
      case 'pending': return list.filter(t => t.status === TODO_STATUS.PENDING)
      case 'in_progress': return list.filter(t => t.status === TODO_STATUS.IN_PROGRESS)
      case 'done': return list.filter(t => t.status === TODO_STATUS.DONE)
      default: return list
    }
  })

  const tabCounts = computed(() => ({
    all: todos.value.length,
    pending: todos.value.filter(t => t.status === TODO_STATUS.PENDING).length,
    in_progress: todos.value.filter(t => t.status === TODO_STATUS.IN_PROGRESS).length,
    done: todos.value.filter(t => t.status === TODO_STATUS.DONE).length
  }))

  const selectedTodo = computed(() => {
    return todosWithOverdue.value.find(t => t.id === selectedTodoId.value) || null
  })

  const unfinishedFromPreviousRound = computed(() => {
    return todosWithOverdue.value.filter(
      t => t.status === TODO_STATUS.PENDING || t.status === TODO_STATUS.IN_PROGRESS
    )
  })

  // --- Cross-tab sync ---
  const { register, broadcast } = useCrossTabSync()
  register('todo', (action, payload) => {
    if (action === 'created') {
      if (!todos.value.find(t => t.id === payload.todo.id)) {
        todos.value.unshift(payload.todo)
      }
    } else if (action === 'status-changed') {
      const t = todos.value.find(t => t.id === payload.id)
      if (t) t.status = payload.status
    } else if (action === 'updated') {
      const t = todos.value.find(t => t.id === payload.id)
      if (t) Object.assign(t, payload.data)
    } else if (action === 'deleted') {
      const idx = todos.value.findIndex(t => t.id === payload.id)
      if (idx > -1) todos.value.splice(idx, 1)
    }
  })

  function createTodo(data) {
    const todo = {
      id: generateId('t_'),
      content: data.content,
      priority: data.priority || 'medium',
      status: TODO_STATUS.PENDING,
      sourceStandupId: data.sourceStandupId || null,
      sourceStandupDate: data.sourceStandupDate || null,
      assigneeId: data.assigneeId,
      assigneeName: data.assigneeName || '',
      assignerId: data.assignerId,
      assignerName: data.assignerName || '',
      deadline: data.deadline || null,
      createdAt: new Date().toISOString()
    }
    todos.value.unshift(todo)
    broadcast('todo', 'created', { todo })
    return todo
  }

  function updateTodoStatus(id, status) {
    const todo = todos.value.find(t => t.id === id)
    if (todo) { todo.status = status; broadcast('todo', 'status-changed', { id, status }) }
  }

  function updateTodo(id, data) {
    const todo = todos.value.find(t => t.id === id)
    if (todo) { Object.assign(todo, data); broadcast('todo', 'updated', { id, data }) }
  }

  function deleteTodo(id) {
    const idx = todos.value.findIndex(t => t.id === id)
    if (idx > -1) { todos.value.splice(idx, 1); broadcast('todo', 'deleted', { id }) }
  }

  function selectTodo(id) {
    selectedTodoId.value = id
  }

  function setActiveTab(tab) {
    activeTab.value = tab
  }

  function autoGenerateFromActionItems(actionItems, standupId) {
    actionItems.forEach(item => {
      createTodo({
        content: item.text,
        priority: item.priority || 'medium',
        sourceStandupId: standupId,
        sourceStandupDate: new Date().toISOString().split('T')[0],
        assigneeId: item.assignee,
        assigneeName: item.assignee || '',
        assignerId: 'current',
        assignerName: 'AI自动分配',
        deadline: item.deadline || null
      })
    })
  }

  return {
    todos, selectedTodoId, activeTab, loading,
    todosWithOverdue, filteredTodos, tabCounts, selectedTodo, unfinishedFromPreviousRound,
    createTodo, updateTodoStatus, updateTodo, deleteTodo, selectTodo, setActiveTab,
    autoGenerateFromActionItems
  }
}, {
  persist: {
    key: 'todos',
    pick: ['todos', 'activeTab']
  }
})
