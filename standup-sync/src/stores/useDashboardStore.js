import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useDashboardStore = defineStore('dashboard', () => {
  const filters = ref({
    sprintId: 'sprint_1',
    memberId: null,
    dateRange: null,
    crossTeam: false
  })
  const loading = ref(false)

  const kpiData = ref({
    standupCount: { current: 12, previous: 10, trend: 'up' },
    attendanceRate: { current: 87, previous: 90, trend: 'down' },
    completionRate: { current: 73, previous: 58, trend: 'up' },
    activeBlockers: { current: 3, previous: 4, trend: 'down' }
  })

  const attendanceTrend = ref([
    { date: '6/1', value: 60 },
    { date: '6/1', value: 80 },
    { date: '6/5', value: 70 },
    { date: '6/5', value: 90 },
    { date: '6/5', value: 60 },
    { date: '6/9', value: 80 },
    { date: '6/9', value: 90 }
  ])

  const completionTrend = ref([
    { date: '6/1', value: 50 },
    { date: '6/1', value: 75 },
    { date: '6/5', value: 60 },
    { date: '6/5', value: 80 },
    { date: '6/9', value: 70 },
    { date: '6/9', value: 90 }
  ])

  const blockerDistribution = ref([
    { name: '技术问题', value: 45 },
    { name: '资源问题', value: 30 },
    { name: '沟通问题', value: 15 }
  ])

  const memberRanking = ref([
    { name: '张三', doneCount: 12, completionRate: 92, medal: 'gold' },
    { name: '李四', doneCount: 8, completionRate: 75, medal: 'silver' },
    { name: '王五', doneCount: 5, completionRate: 60, medal: 'bronze' },
    { name: '赵六', doneCount: 3, completionRate: 45, medal: null },
    { name: '钱七', doneCount: 1, completionRate: 20, medal: null }
  ])

  // ECharts options
  const attendanceChartOption = computed(() => ({
    xAxis: {
      type: 'category',
      data: ['6/1', '6/5', '6/9'],
      name: '日期'
    },
    yAxis: {
      type: 'value',
      name: '出勤率 (%)',
      max: 100
    },
    tooltip: { trigger: 'item', formatter: '{c}%' },
    series: [{
      type: 'scatter',
      data: attendanceTrend.value.map(d => [d.date, d.value]),
      symbolSize: 12,
      itemStyle: { color: '#4094ED' }
    }]
  }))

  const completionChartOption = computed(() => ({
    xAxis: {
      type: 'category',
      data: ['6/1', '6/5', '6/9'],
      name: '日期'
    },
    yAxis: {
      type: 'value',
      name: '完成率 (%)',
      max: 100
    },
    tooltip: { trigger: 'item', formatter: '{c}%' },
    series: [{
      type: 'scatter',
      data: completionTrend.value.map(d => [d.date, d.value]),
      symbolSize: 12,
      itemStyle: { color: '#67C23A' }
    }]
  }))

  const pieChartOption = computed(() => ({
    tooltip: { trigger: 'item' },
    legend: { bottom: '0%' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      label: { formatter: '{b}\n{d}%' },
      data: blockerDistribution.value,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }
    }]
  }))

  const topThreeMembers = computed(() => {
    return memberRanking.value.filter(m => m.medal)
  })

  function fetchDashboardData() {
    loading.value = true
    setTimeout(() => { loading.value = false }, 300)
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
    link.href = url
    link.download = 'dashboard-data.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return {
    filters, loading, kpiData,
    attendanceTrend, completionTrend, blockerDistribution, memberRanking,
    attendanceChartOption, completionChartOption, pieChartOption, topThreeMembers,
    fetchDashboardData, updateFilters, exportCSV
  }
})
