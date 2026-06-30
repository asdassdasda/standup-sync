<template>
  <div>
    <!-- Filter bar -->
    <div class="filter-bar">
      <el-select v-model="dashStore.filters.sprintId" style="width: 140px;">
        <el-option label="Sprint#12" value="sprint_1" />
        <el-option label="Sprint#13" value="sprint_13" />
      </el-select>
      <el-button>[阻碍类型]</el-button>
      <el-button>[成员]</el-button>
      <el-button>[时间范围]</el-button>
      <el-checkbox v-model="dashStore.filters.crossTeam">跨团队对比</el-checkbox>
      <el-button @click="dashStore.exportCSV()">[导出CSV]</el-button>
    </div>

    <!-- KPI Cards -->
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card>
          <div class="num">{{ dashStore.kpiData.standupCount.current }} 次</div>
          <div>
            站会次数
            <span :class="dashStore.kpiData.standupCount.trend === 'up' ? 'up' : 'down'">
              {{ dashStore.kpiData.standupCount.trend === 'up' ? '↑' : '↓' }}{{ Math.abs(dashStore.kpiData.standupCount.current - dashStore.kpiData.standupCount.previous) }} 较上期
            </span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div class="num text-red">{{ dashStore.kpiData.attendanceRate.current }}%</div>
          <div>
            平均出勤率
            <span :class="dashStore.kpiData.attendanceRate.trend === 'up' ? 'up' : 'down'">
              {{ dashStore.kpiData.attendanceRate.trend === 'up' ? '↑' : '↓' }}{{ Math.abs(dashStore.kpiData.attendanceRate.current - dashStore.kpiData.attendanceRate.previous) }}% 较上期
            </span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div class="num text-green">{{ dashStore.kpiData.completionRate.current }}%</div>
          <div>
            待办完成率
            <span :class="dashStore.kpiData.completionRate.trend === 'up' ? 'up' : 'down'">
              {{ dashStore.kpiData.completionRate.trend === 'up' ? '↑' : '↓' }}{{ Math.abs(dashStore.kpiData.completionRate.current - dashStore.kpiData.completionRate.previous) }}% 较上期
            </span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div class="num">{{ dashStore.kpiData.activeBlockers.current }} 个</div>
          <div>
            活跃阻碍
            <span :class="dashStore.kpiData.activeBlockers.trend === 'up' ? 'up' : 'down'">
              {{ dashStore.kpiData.activeBlockers.trend === 'up' ? '↑' : '↓' }}{{ Math.abs(dashStore.kpiData.activeBlockers.current - dashStore.kpiData.activeBlockers.previous) }} 较上期
            </span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Charts row 1 -->
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header><span>出勤率趋势</span></template>
          <v-chart :option="dashStore.attendanceChartOption" style="height: 300px;" autoresize />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>完成率趋势</span></template>
          <v-chart :option="dashStore.completionChartOption" style="height: 300px;" autoresize />
        </el-card>
      </el-col>
    </el-row>

    <!-- Charts row 2 -->
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header><span>阻碍类型分布</span></template>
          <v-chart :option="dashStore.pieChartOption" style="height: 300px;" autoresize />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>个人完成排行</span></template>
          <div v-for="p in dashStore.memberRanking" :key="p.name" class="rank-item">
            <span class="medal" v-if="p.medal">
              {{ p.medal === 'gold' ? '🥇' : p.medal === 'silver' ? '🥈' : '🥉' }}
            </span>
            <span class="rank-name">{{ p.name }}</span>
            <span class="rank-stats">{{ p.doneCount }}项 {{ p.completionRate }}%</span>
            <el-progress
              :percentage="p.completionRate"
              :color="p.medal === 'gold' ? '#F0C040' : p.medal === 'silver' ? '#C0C0C0' : p.medal === 'bronze' ? '#CD7F32' : '#4094ED'"
              style="flex: 1; margin-left: 12px;"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { ScatterChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useDashboardStore } from '../stores/useDashboardStore'

use([ScatterChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const dashStore = useDashboardStore()

onMounted(() => {
  dashStore.fetchDashboardData()
})
</script>

<style scoped>
.filter-bar {
  margin-bottom: 20px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.num {
  font-size: 26px;
  font-weight: bold;
}
.text-red { color: #E53E3E; }
.text-green { color: #38A169; }
.up { color: #38A169; font-size: 12px; margin-left: 4px; }
.down { color: #E53E3E; font-size: 12px; margin-left: 4px; }
.rank-item {
  display: flex;
  align-items: center;
  margin: 12px 0;
}
.medal {
  font-size: 18px;
  margin-right: 8px;
}
.rank-name {
  width: 60px;
  font-weight: 500;
}
.rank-stats {
  width: 110px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
