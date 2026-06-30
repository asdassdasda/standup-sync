import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ROLES } from '../utils/constants'

export const useUserStore = defineStore('user', () => {
  const currentUser = ref(null)
  const authToken = ref(null)

  const isAuthenticated = computed(() => !!currentUser.value && !!authToken.value)

  function login(name, password) {
    if (!name || !password) {
      return { success: false, message: '请输入用户名和密码' }
    }
    const users = {
      '张三': { id: 'u1', name: '张三', role: ROLES.MASTER },
      '李四': { id: 'u2', name: '李四', role: ROLES.ADMIN },
      '王五': { id: 'u3', name: '王五', role: ROLES.MEMBER },
      '赵六': { id: 'u4', name: '赵六', role: ROLES.MEMBER },
      '钱七': { id: 'u5', name: '钱七', role: ROLES.MEMBER }
    }
    if (users[name]) {
      currentUser.value = users[name]
      authToken.value = `mock-token-${users[name].id}-${Date.now()}`
      return { success: true }
    }
    currentUser.value = { id: `u${Date.now()}`, name, role: ROLES.MEMBER }
    authToken.value = `mock-token-new-${Date.now()}`
    return { success: true }
  }

  function logout() {
    currentUser.value = null
    authToken.value = null
  }

  return { currentUser, authToken, isAuthenticated, login, logout }
}, {
  persist: {
    key: 'user',
    storage: sessionStorage,
    pick: ['currentUser', 'authToken']
  }
})
