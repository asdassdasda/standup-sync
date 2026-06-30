<template>
  <div>
    <h2 style="margin-bottom: 20px;">系统设置</h2>

    <el-card style="margin-bottom: 20px;">
      <template #header><span>外观设置</span></template>
      <div class="setting-row">
        <div>
          <h4>主题模式</h4>
          <p style="color: var(--text-secondary); font-size: 13px;">切换深色/浅色主题</p>
        </div>
        <el-switch
          :model-value="settingsStore.theme === 'dark'"
          @change="settingsStore.toggleTheme()"
          active-text="深色"
          inactive-text="浅色"
        />
      </div>
    </el-card>

    <el-card style="margin-bottom: 20px;">
      <template #header><span>通知设置</span></template>
      <div class="setting-row">
        <div>
          <h4>站会提醒</h4>
          <p style="color: var(--text-secondary); font-size: 13px;">站会开始前15分钟发送通知</p>
        </div>
        <el-switch
          :model-value="settingsStore.notifications.standupReminder"
          @change="settingsStore.toggleNotification('standupReminder')"
        />
      </div>
      <el-divider />
      <div class="setting-row">
        <div>
          <h4>待办到期提醒</h4>
          <p style="color: var(--text-secondary); font-size: 13px;">待办截止日期前一天发送提醒</p>
        </div>
        <el-switch
          :model-value="settingsStore.notifications.todoDueReminder"
          @change="settingsStore.toggleNotification('todoDueReminder')"
        />
      </div>
      <el-divider />
      <div class="setting-row">
        <div>
          <h4>任务分配通知</h4>
          <p style="color: var(--text-secondary); font-size: 13px;">当有人分配任务给你时发送通知</p>
        </div>
        <el-switch
          :model-value="settingsStore.notifications.taskAssignment"
          @change="settingsStore.toggleNotification('taskAssignment')"
        />
      </div>
    </el-card>

    <el-card>
      <template #header><span>关于</span></template>
      <p>StandupSync v1.0</p>
      <p style="color: var(--text-secondary); font-size: 13px;">敏捷站会速记平台 · Vue3 + Element Plus</p>
    </el-card>
  </div>
</template>

<script setup>
import { useSettingsStore } from '../stores/useSettingsStore'

const settingsStore = useSettingsStore()
</script>

<style scoped>
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.setting-row h4 {
  margin: 0 0 4px 0;
}
</style>
