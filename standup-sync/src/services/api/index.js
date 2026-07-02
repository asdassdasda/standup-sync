import axios from 'axios'
// import { installMockInterceptor } from './mockAdapter'  // Disabled: using real backend

const apiClient = axios.create({
  baseURL: 'http://localhost:8088/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

// Auth token interceptor — sessionStorage for per-tab independent sessions
apiClient.interceptors.request.use(config => {
  const stored = sessionStorage.getItem('user') || localStorage.getItem('user')
  if (stored) {
    try {
      const userData = JSON.parse(stored)
      if (userData.authToken) {
        config.headers.Authorization = `Bearer ${userData.authToken}`
      }
    } catch { /* ignore */ }
  }
  return config
})

// Response interceptor: unwrap data
apiClient.interceptors.response.use(
  response => response.data,
  error => {
    const msg = error.response?.data?.msg || error.message || '请求失败'
    console.error('API Error:', msg)
    return Promise.reject(error)
  }
)

// Don't install mock — use real backend
// installMockInterceptor(apiClient)

export async function apiGet(url, params) {
  return apiClient.get(url, { params })
}

export async function apiPost(url, data) {
  return data != null ? apiClient.post(url, data) : apiClient.post(url)
}

export async function apiPut(url, data) {
  return data != null ? apiClient.put(url, data) : apiClient.put(url)
}

export async function apiPatch(url, data) {
  return data != null ? apiClient.patch(url, data) : apiClient.patch(url)
}

export async function apiDelete(url) {
  return apiClient.delete(url)
}

export default apiClient
