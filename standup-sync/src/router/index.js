import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../views/MainLayout.vue'
import { useUserStore } from '../stores/useUserStore'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: '登录', noAuth: true }
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/standup',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'standup',
        name: 'StandupIndex',
        component: () => import('../views/StandupIndex.vue'),
        meta: { title: '站会' }
      },
      {
        path: 'standup/:standupId/meeting',
        name: 'StandupMeeting',
        component: () => import('../views/StandupMeeting.vue'),
        meta: { title: '站会发言' },
        props: true
      },
      {
        path: 'standup/:standupId/result',
        name: 'StandupResult',
        component: () => import('../views/StandupResult.vue'),
        meta: { title: 'AI整理结果' },
        props: true
      },
      {
        path: 'todo',
        name: 'TodoList',
        component: () => import('../views/TodoList.vue'),
        meta: { title: '待办' }
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '数据看板' }
      },
      {
        path: 'team',
        name: 'TeamView',
        component: () => import('../views/TeamView.vue'),
        meta: { title: '团队管理', requiresAuth: true }
      },
      {
        path: 'setting',
        name: 'SettingView',
        component: () => import('../views/SettingView.vue'),
        meta: { title: '系统设置', requiresAuth: true }
      }
    ]
  },
  {
    path: '/join',
    name: 'JoinTeam',
    component: () => import('../views/TeamView.vue'),
    meta: { title: '加入团队' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
    meta: { title: '页面不存在', noAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Auth guard
router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - StandupSync` : 'StandupSync'

  if (to.meta.noAuth) {
    next()
    return
  }

  const userStore = useUserStore()
  if (to.meta.requiresAuth && !userStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }
  next()
})

export default router
