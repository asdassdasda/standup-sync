import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { WS_MSG } from '../utils/constants'
import { teamWsService } from '../services/websocket/teamWsService'

async function callApi(url) {
  try {
    const { apiGet } = await import('../services/api/index.js')
    return await apiGet(url)
  } catch { return null }
}

export const useDashboardStore = defineStore('dashboard', () => {
  const filters = ref({
    sprintId: null,
    memberId: null,
    dateRange: null,
    crossTeam: false
  })
  const loading = ref(false)

  const kpiData = ref({
    standupCount: { current: 0, previous: 0, trend: 'up' },
    attendanceRate: { current: 0, previous: 0, trend: 'up' },
    completionRate: { current: 0, previous: 0, trend: 'up' },
    activeBlockers: { current: 0, previous: 0, trend: 'down' }
  })

  const attendanceTrend = ref([])
  const completionTrend = ref([])
  const blockerDistribution = ref([])
  const memberRanking = ref([])

  const attendanceChartOption = computed(() => {
    const data = attendanceTrend.value && attendanceTrend.value.length
      ? attendanceTrend.value.map(d => [d.date, d.value])
      : [['暂无', 0]]
    const dates = data.map(d => d[0])
    return {
      xAxis: { type: 'category', data: dates, name: '日期' },
      yAxis: { type: 'value', name: '出勤率 (%)', max: 100 },
      tooltip: { trigger: 'item', formatter: '{c}%' },
      series: [{ type: 'scatter', data, symbolSize: 12, itemStyle: { color: '#4094ED' } }]
    }
  })

  const completionChartOption = computed(() => {
    const data = completionTrend.value && completionTrend.value.length
      ? completionTrend.value.map(d => [d.date, d.value])
      : [['暂无', 0]]
    const dates = data.map(d => d[0])
    return {
      xAxis: { type: 'category', data: dates, name: '日期' },
      yAxis: { type: 'value', name: '完成率 (%)', max: 100 },
      tooltip: { trigger: 'item', formatter: '{c}%' },
      series: [{ type: 'scatter', data, symbolSize: 12, itemStyle: { color: '#67C23A' } }]
    }
  })

  const pieChartOption = computed(() => {
    const data = blockerDistribution.value && blockerDistribution.value.length
      ? blockerDistribution.value
      : [{ name: '暂无数据', value: 1 }]
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: '0%' },
      series: [{ type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
        label: { formatter: '{b}\n{d}%' }, data,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 } }]
    }
  })

  const topThreeMembers = computed(() => {
    return memberRanking.value.filter(m => m.medal)
  })

  async function fetchDashboardData() {
    if (loading.value) return
    loading.value = true
    try {
      const { useTeamStore } = await import('./useTeamStore.js')
      const ts = useTeamStore()
      const teamId = ts.currentTeam?.id || 0

      const sprintId = filters.value.sprintId
      const sprint = sprintId ? ts.sprints.find(s => s.id === sprintId) : null
      // NOTE: The backend sprint filter matches by sprint name (standup_meeting.sprint column),
      // not by sprint ID. This means multiple sprints with the same name would produce the same
      // results. This is intentional — the backend stores sprint as a denormalized name string.
      const sprintName = sprint ? sprint.name : ''
      const sprintParam = sprintName ? `&sprintId=${encodeURIComponent(sprintName)}` : ''

      const [kpiRes, trendsRes, rankingRes] = await Promise.all([
        callApi(`/dashboard/kpi?teamId=${teamId}${sprintParam}`),
        callApi(`/dashboard/trends?teamId=${teamId}${sprintParam}`),
        callApi(`/dashboard/ranking?teamId=${teamId}`)
      ])

      if (kpiRes && kpiRes.code === 200 && kpiRes.data) {
        const d = kpiRes.data
        kpiData.value = {
          standupCount: typeof d.standupCount === 'object' ? d.standupCount : { current: d.standupCount || 0, previous: 0, trend: 'up' },
          attendanceRate: typeof d.attendanceRate === 'object' ? d.attendanceRate : { current: d.attendanceRate || 0, previous: 0, trend: 'up' },
          completionRate: typeof d.completionRate === 'object' ? d.completionRate : { current: d.completionRate || 0, previous: 0, trend: 'up' },
          activeBlockers: typeof d.activeBlockers === 'object' ? d.activeBlockers : { current: d.activeBlockers || 0, previous: 0, trend: 'down' }
        }
      }
      if (trendsRes && trendsRes.code === 200 && trendsRes.data) {
        const td = trendsRes.data
        attendanceTrend.value = (td.attendanceTrend || []).map(d => ({ date: d.date?.substring(5) || d.date, value: d.value }))
        completionTrend.value = (td.completionTrend || []).map(d => ({ date: d.date?.substring(5) || d.date, value: d.value }))
        blockerDistribution.value = td.blockerDistribution || []
      }
      if (rankingRes && rankingRes.code === 200 && rankingRes.data) {
        memberRanking.value = (rankingRes.data || []).map((r, i) => ({
          ...r,
          medal: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : null
        }))
      }
    } catch { /* keep current data */ }
    loading.value = false
  }

  function updateFilters(newFilters) {
    Object.assign(filters.value, newFilters)
  }

  function exportCSV() {
    const data = memberRanking.value
    const header = '姓名,完成数量,完成率(%)\n'
    const rows = data.map(d => `${d.name},${d.doneCount},${d.completionRate}`).join('\n')
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'dashboard-data.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  let _unsub = null
  function _listen() {
    if (_unsub) _unsub()
    _unsub = teamWsService.on(WS_MSG.STANDUP_LIST_CHANGED, () => { fetchDashboardData() })
  }
  _listen()

  return {
    filters, loading, kpiData,
    attendanceTrend, completionTrend, blockerDistribution, memberRanking,
    attendanceChartOption, completionChartOption, pieChartOption, topThreeMembers,
    fetchDashboardData, updateFilters, exportCSV
  }
})
