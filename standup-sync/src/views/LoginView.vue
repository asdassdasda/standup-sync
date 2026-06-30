<template>
  <div class="login-wrapper">
    <div class="login-card">
      <h1 class="login-title">StandupSync</h1>
      <p class="login-subtitle">敏捷站会速记平台</p>

      <!-- Tabs -->
      <div class="tab-row">
        <span class="tab" :class="{ active: activeTab === 'login' }" @click="activeTab = 'login'">登录</span>
        <span class="tab" :class="{ active: activeTab === 'register' }" @click="activeTab = 'register'">注册</span>
      </div>

      <!-- Login Form -->
      <el-form v-if="activeTab === 'login'" ref="formRef" :model="loginForm" :rules="loginRules" @submit.prevent="handleLogin">
        <el-form-item prop="name">
          <el-input v-model="loginForm.name" placeholder="请输入用户名" size="large" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="loginForm.password" type="password" placeholder="请输入密码" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" class="login-btn" native-type="submit" :loading="loading">
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <!-- Register Form -->
      <el-form v-else ref="regFormRef" :model="regForm" :rules="regRules" @submit.prevent="handleRegister">
        <el-form-item prop="username">
          <el-input v-model="regForm.username" placeholder="请输入用户名（字母数字）" size="large" />
        </el-form-item>
        <el-form-item prop="nickname">
          <el-input v-model="regForm.nickname" placeholder="请输入昵称" size="large" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="regForm.password" type="password" placeholder="请输入密码" size="large" show-password />
        </el-form-item>
        <el-form-item prop="confirm">
          <el-input v-model="regForm.confirm" type="password" placeholder="确认密码" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="success" size="large" class="login-btn" native-type="submit" :loading="loading">
            注 册
          </el-button>
        </el-form-item>
      </el-form>

      <p class="login-hint">测试账号：zhangsan / lisi / wangwu / zhaoliu / qianqi 密码：123456</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '../stores/useUserStore'
import { apiPost } from '../services/api/index.js'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const loading = ref(false)
const activeTab = ref('login')

const loginForm = reactive({ name: 'zhangsan', password: '123456' })
const loginRules = {
  name: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const regForm = reactive({ username: '', nickname: '', password: '', confirm: '' })
const regRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9]{3,32}$/, message: '3-32位字母或数字', trigger: 'blur' }
  ],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ],
  confirm: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: (rule, value, cb) => value === regForm.password ? cb() : cb(new Error('两次密码不一致')), trigger: 'blur' }
  ]
}

async function handleLogin() {
  loading.value = true
  try {
    const res = await apiPost('/auth/login', { username: loginForm.name, password: loginForm.password })
    loading.value = false
    if (res.code === 200) {
      const d = res.data
      const currentUser = { id: String(d.userId), name: loginForm.name, role: 0 }
      const authToken = d.token
      sessionStorage.setItem('user', JSON.stringify({ currentUser, authToken }))
      userStore.$patch({ currentUser, authToken })
      ElMessage.success('登录成功')
      router.push(route.query.redirect || '/')
      return
    }
    ElMessage.error(res.msg || '登录失败')
  } catch (e) {
    loading.value = false
    const result = userStore.login(loginForm.name, loginForm.password)
    if (result.success) {
      ElMessage.success('登录成功（离线模式）')
      router.push(route.query.redirect || '/')
    } else {
      ElMessage.error('无法连接服务器，请确认后端已启动')
    }
  }
}

async function handleRegister() {
  loading.value = true
  try {
    const res = await apiPost('/auth/register', { username: regForm.username, password: regForm.password, nickname: regForm.nickname })
    loading.value = false
    if (res.code === 200) {
      ElMessage.success('注册成功，请登录')
      activeTab.value = 'login'
      loginForm.name = regForm.username
    } else {
      ElMessage.error(res.msg || '注册失败')
    }
  } catch (e) {
    loading.value = false
    ElMessage.error('无法连接服务器，请确认后端已启动')
  }
}
</script>

<style scoped>
.login-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #4094ED 100%);
}
.login-card {
  width: 420px;
  padding: 36px 40px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.login-title {
  text-align: center;
  font-size: 28px;
  color: #1A1A2E;
  margin-bottom: 4px;
}
.login-subtitle {
  text-align: center;
  font-size: 14px;
  color: #909399;
  margin-bottom: 20px;
}
.tab-row {
  display: flex;
  margin-bottom: 24px;
  border-bottom: 2px solid #EBEEF5;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  cursor: pointer;
  font-size: 15px;
  color: #909399;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}
.tab.active {
  color: #4094ED;
  border-bottom-color: #4094ED;
  font-weight: 600;
}
.tab:hover {
  color: #4094ED;
}
.login-btn {
  width: 100%;
}
.login-hint {
  text-align: center;
  font-size: 12px;
  color: #C0C4CC;
  margin-top: 12px;
}
</style>
