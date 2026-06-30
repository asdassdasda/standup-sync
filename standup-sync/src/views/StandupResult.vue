<template>
  <div>
    <div class="toolbar">
      <el-button v-if="!summary.isArchived" @click="handleRegenerate" :loading="regenerating">[重新生成]</el-button>
      <el-button
        type="primary"
        @click="handleArchive"
        :disabled="summary.isArchived"
      >
        [确认并结束]
      </el-button>
      <el-tag v-if="summary.isArchived" type="success" style="margin-left: 8px;">已归档</el-tag>
    </div>

    <!-- Fallback: AI failed or raw text only -->
    <el-alert v-if="summary.aiFailed || summary.fallbackText" type="warning" :closable="false" style="margin-bottom: 16px;">
      <template #title>
        <span v-if="summary.aiFailed">数据加载失败，以下为可用信息</span>
        <span v-else>AI 服务不可用，展示原始发言记录</span>
      </template>
      <pre v-if="summary.fallbackText" style="white-space: pre-wrap; margin-top: 8px;">{{ summary.fallbackText }}</pre>
    </el-alert>

    <!-- Yesterday Done + Today Plan -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card>
          <template #header><span>昨日完成</span></template>
          <div v-if="summary.doneList.length">
            <p
              v-for="item in summary.doneList"
              :key="item.id"
              class="editable-item"
            >
              <template v-if="editingId === item.id">
                <el-input
                  v-model="editText"
                  size="small"
                  @blur="handleSaveEdit('doneList', item.id)"
                  @keyup.enter="handleSaveEdit('doneList', item.id)"
                />
              </template>
              <template v-else>
                <span @dblclick="startEdit(item)" class="item-text">{{ item.text }}</span>
              </template>
            </p>
          </div>
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>今日计划</span></template>
          <div v-if="summary.planList.length">
            <p
              v-for="item in summary.planList"
              :key="item.id"
              class="editable-item"
            >
              <template v-if="editingId === item.id">
                <el-input
                  v-model="editText"
                  size="small"
                  @blur="handleSaveEdit('planList', item.id)"
                  @keyup.enter="handleSaveEdit('planList', item.id)"
                />
              </template>
              <template v-else>
                <span @dblclick="startEdit(item)" class="item-text">{{ item.text }}</span>
              </template>
            </p>
          </div>
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- Blockers + Action Items -->
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card class="block-card">
          <template #header><span>阻碍汇总</span></template>
          <div v-if="summary.blockers.length">
            <p
              v-for="item in summary.blockers"
              :key="item.id"
              class="editable-item"
            >
              <span>{{ item.text }}</span>
              <el-tag v-if="item.type" size="small" type="danger" style="margin-left: 8px;">{{ item.type }}</el-tag>
            </p>
          </div>
          <el-empty v-else description="没有阻碍">
            <template #description><span style="color: #67C23A;">没有阻碍</span></template>
          </el-empty>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="action-card">
          <template #header><span>Action Item</span></template>
          <div v-if="summary.actionItems.length">
            <p
              v-for="item in summary.actionItems"
              :key="item.id"
              class="action-item"
            >
              <span class="priority-dot" :class="item.priority"></span>
              {{ item.text }}
              <span v-if="item.assignee"> → {{ item.assignee }} · {{ item.deadline || '无截止' }}</span>
            </p>
          </div>
          <el-empty v-else description="无待办事项" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- Archive Confirm Dialog -->
    <el-dialog v-model="showArchiveDialog" title="确认归档" width="400px">
      <p>归档后，会议纪要变为<strong>只读</strong>状态，无法再编辑。</p>
      <p>是否确认归档？</p>
      <template #footer>
        <el-button @click="showArchiveDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmArchive">确认归档</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStandupStore } from '../stores/useStandupStore'
import { ElMessage } from 'element-plus'

const router = useRouter()

const props = defineProps({
  standupId: { type: String, default: null }
})

const standupStore = useStandupStore()
const showArchiveDialog = ref(false)
const regenerating = ref(false)
const editingId = ref(null)
const editText = ref('')

const summary = computed(() => standupStore.currentSummary)

onMounted(async () => {
  // Coming from active meeting → auto-generate if speeches exist
  if (!summary.value.id && standupStore.doneCount > 0) {
    standupStore.generateSummary()
  }
  // Viewing historical standup → load from backend
  if (props.standupId && props.standupId !== standupStore.currentMeeting.id) {
    await standupStore.loadHistoricalSummary(props.standupId)
  }
})

function startEdit(item) {
  if (summary.value.isArchived) return
  editingId.value = item.id
  editText.value = item.text
}

function handleSaveEdit(section, itemId) {
  if (editText.value.trim()) {
    standupStore.updateSummaryItem(section, itemId, editText.value.trim())
  }
  editingId.value = null
}

function handleRegenerate() {
  regenerating.value = true
  setTimeout(() => {
    standupStore.generateSummary()
    regenerating.value = false
    ElMessage.success('已重新生成')
  }, 1000)
}

function handleArchive() {
  showArchiveDialog.value = true
}

function confirmArchive() {
  standupStore.archiveSummary()
  // Also end the standup meeting and add to history
  if (standupStore.currentMeeting.id && standupStore.currentMeeting.status !== 'finished') {
    standupStore.finishStandup()
  }
  showArchiveDialog.value = false
  ElMessage.success('会议纪要已归档，站会已结束')
  router.push('/standup')
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}
.editable-item {
  padding: 6px 0;
  border-bottom: 1px dashed var(--card-border);
}
.item-text {
  cursor: pointer;
}
.item-text:hover {
  background: var(--table-row-hover);
}
.action-item {
  padding: 6px 0;
  display: flex;
  align-items: center;
}
.priority-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
  flex-shrink: 0;
}
.priority-dot.high { background: #F56C6C; }
.priority-dot.medium { background: #E6A23C; }
.priority-dot.low { background: #67C23A; }
</style>
