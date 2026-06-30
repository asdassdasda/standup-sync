import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ROLES } from '../utils/constants'

export const useUserStore = defineStore('user', () => {
  const currentUser = ref(null)
  const authToken = ref(null)

  const isAuthenticated = computed(() => !!currentUser.value && !!authToken.value)
  const isTechLead = computed(() => currentUser.value?.role === ROLES.TECH_LEAD)
  const isScrumMaster = computed(() => currentUser.value?.role === ROLES.SCRUM_MASTER)

  function login(name, password) {
    // Mock login - accept any non-empty credentials
    if (!name || !password) {
      return { success: false, message: '请输入用户名和密码' }
    }
    const users = {
      '张三': { id: 'u1', name: '张三', role: ROLES.TECH_LEAD },
      '李四': { id: 'u2', name: '李四', role: ROLES.SCRUM_MASTER },
      '王五': { id: 'u3', name: '王五', role: ROLES.DEVELOPER },
      '赵六': { id: 'u4', name: '赵六', role: ROLES.DEVELOPER },
      '钱七': { id: 'u5', name: '钱七', role: ROLES.OBSERVER }
    }
    if (users[name]) {
      currentUser.value = users[name]
      authToken.value = `mock-token-${users[name].id}-${Date.now()}`
      return { success: true }
    }
    currentUser.value = { id: `u${Date.now()}`, name, role: ROLES.DEVELOPER }
    authToken.value = `mock-token-new-${Date.now()}`
    return { success: true }
  }

  function logout() {
    currentUser.value = null
    authToken.value = null
  }

  return { currentUser, authToken, isAuthenticated, isTechLead, isScrumMaster, login, logout }
}, {
  persist: {
    key: 'user',
    storage: sessionStorage,  // 每个标签页独立会话，支持多用户同时登录测试
    pick: ['currentUser', 'authToken']
  }
})
