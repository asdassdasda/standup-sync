<template>
  <el-container style="height: 100vh; width: 100%;">
    <!-- 左侧侧边栏 -->
    <el-aside width="240px">
      <div class="logo-box">
        <h2 class="logo-text">StandupSync</h2>
      </div>
      <el-menu
        :default-active="$route.path"
        class="el-menu-vertical-dark"
        text-color="#FFFFFF"
        active-text-color="#4094ED"
        router
      >
        <el-menu-item index="/standup">
          <el-icon><Menu /></el-icon>
          <span>站会</span>
        </el-menu-item>
        <el-menu-item index="/todo">
          <el-icon><List /></el-icon>
          <span>待办</span>
        </el-menu-item>
        <el-menu-item index="/dashboard">
          <el-icon><DataLine /></el-icon>
          <span>看板</span>
        </el-menu-item>
        <el-menu-item index="/team">
          <el-icon><User /></el-icon>
          <span>团队</span>
        </el-menu-item>
        <el-menu-item index="/setting">
          <el-icon><Setting /></el-icon>
          <span>设置</span>
        </el-menu-item>
      </el-menu>
      <!-- 底部用户信息 -->
      <div class="user-footer">
        <el-avatar :size="42">{{ userStore.currentUser?.name?.charAt(0) || '?' }}</el-avatar>
        <div class="user-info">
          <div class="username">{{ userStore.currentUser?.name || '未登录' }}</div>
          <div class="role">{{ roleLabel }}</div>
        </div>
      </div>
    </el-aside>

    <el-container>
      <!-- 顶部蓝色导航栏 -->
      <el-header>
        <div class="header-left">
          <span class="brand">StandupSync</span>
          <span class="page-name">{{ $route.meta.title }}</span>
        </div>
        <el-dropdown trigger="click">
          <span class="user-dropdown" style="color:#fff; cursor:pointer;">
            {{ userStore.currentUser?.name || '未登录' }} <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="$router.push('/setting')">
                <el-icon><Setting /></el-icon> 个人设置
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">
                <el-icon><SwitchButton /></el-icon> 退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <!-- 页面主体内容 -->
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/useUserStore'
import { useTeamStore } from '../stores/useTeamStore'
import { ROLE_LABELS } from '../utils/constants'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const teamStore = useTeamStore()

onMounted(() => {
  if (userStore.isAuthenticated) {
    teamStore.fetchMyTeams()
  }
})

const roleLabel = computed(() => {
  return ROLE_LABELS[userStore.currentUser?.role] || ''
})

function handleLogout() {
  userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped>
.logo-box {
  padding: 20px 16px;
  border-bottom: 1px solid #333652;
}
.logo-text {
  color: #fff;
  font-size: 22px;
  margin: 0;
}
.user-footer {
  position: absolute;
  bottom: 24px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
}
.role {
  font-size: 13px;
  opacity: 0.7;
}
.el-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
}
.header-left {
  display: flex;
  gap: 24px;
  font-size: 20px;
}
.page-name {
  font-size: 18px;
}
</style>
