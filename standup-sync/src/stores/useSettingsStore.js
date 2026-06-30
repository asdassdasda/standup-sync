import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCrossTabSync } from '../composables/useCrossTabSync'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref('light')
  const notifications = ref({
    standupReminder: true,
    todoDueReminder: true,
    taskAssignment: true
  })

  // --- Cross-tab sync ---
  const { register, broadcast } = useCrossTabSync()
  register('settings', (action, payload) => {
    if (action === 'theme-changed') {
      setTheme(payload.theme)
    } else if (action === 'notification-changed') {
      if (payload.key in notifications.value) {
        notifications.value[payload.key] = payload.value
      }
    }
  })

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    applyTheme()
    broadcast('settings', 'theme-changed', { theme: theme.value })
  }

  function setTheme(t) {
    theme.value = t
    applyTheme()
  }

  function applyTheme() {
    if (theme.value === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function toggleNotification(key) {
    if (key in notifications.value) {
      notifications.value[key] = !notifications.value[key]
      broadcast('settings', 'notification-changed', { key, value: notifications.value[key] })
    }
  }

  // Apply theme on store initialization
  applyTheme()

  return { theme, notifications, toggleTheme, setTheme, toggleNotification, applyTheme }
}, {
  persist: {
    key: 'settings',
    pick: ['theme', 'notifications']
  }
})
