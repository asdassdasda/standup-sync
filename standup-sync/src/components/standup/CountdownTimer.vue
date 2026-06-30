<template>
  <div class="countdown-timer" :class="{ warning: isWarning, overtime: isOvertime }">
    <div class="timer-ring">
      <svg viewBox="0 0 100 100">
        <circle class="bg-ring" cx="50" cy="50" r="45" />
        <circle
          class="progress-ring"
          cx="50" cy="50" r="45"
          :style="{ strokeDashoffset: dashOffset }"
        />
      </svg>
      <div class="timer-text">
        <span v-if="!isOvertime">{{ formatted }}</span>
        <span v-else class="overtime-text">超时 {{ formatted }}</span>
        <small v-if="isWarning && !isOvertime" class="warning-label">即将结束</small>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  seconds: { type: Number, default: 900 },
  isWarning: { type: Boolean, default: false },
  isOvertime: { type: Boolean, default: false }
})

const formatted = computed(() => {
  const mins = Math.floor(Math.max(0, props.seconds) / 60)
  const secs = Math.max(0, props.seconds) % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

const dashOffset = computed(() => {
  const circumference = 283 // 2 * PI * 45
  const progress = Math.max(0, props.seconds) / 900
  return circumference * (1 - progress)
})
</script>

<style scoped>
.countdown-timer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.timer-ring {
  position: relative;
  width: 80px;
  height: 80px;
}
.timer-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.bg-ring {
  fill: none;
  stroke: #e0e0e0;
  stroke-width: 6;
}
.progress-ring {
  fill: none;
  stroke: #4094ED;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 283;
  transition: stroke-dashoffset 1s linear;
}
.warning .progress-ring {
  stroke: #E6A23C;
}
.overtime .progress-ring {
  stroke: #F56C6C;
}
.timer-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
}
.warning .timer-text {
  color: #E6A23C;
}
.overtime .timer-text {
  color: #F56C6C;
}
.overtime-text {
  font-size: 14px;
}
.warning-label {
  display: block;
  font-size: 10px;
  color: #E6A23C;
  font-weight: normal;
}
</style>
