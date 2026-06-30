<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="showCreateDialog = true">[+ 新建待办]</el-button>
      <el-button>[导出]</el-button>
      <el-button>[筛选]</el-button>
    </div>

    <el-tabs v-model="todoStore.activeTab" @tab-change="todoStore.setActiveTab">
      <el-tab-pane label="全部" name="all">
        <template #label><span>全部({{ todoStore.tabCounts.all }})</span></template>
      </el-tab-pane>
      <el-tab-pane label="待处理" name="pending">
        <template #label><span>待处理({{ todoStore.tabCounts.pending }})</span></template>
      </el-tab-pane>
      <el-tab-pane label="进行中" name="in_progress">
        <template #label><span>进行中({{ todoStore.tabCounts.in_progress }})</span></template>
      </el-tab-pane>
      <el-tab-pane label="已完成" name="done">
        <template #label><span>已完成({{ todoStore.tabCounts.done }})</span></template>
      </el-tab-pane>
    </el-tabs>

    <el-row :gutter="20" style="margin-top: 16px;">
      <el-col :span="16">
        <el-table
          :data="todoStore.filteredTodos"
          border
          @row-click="handleRowClick"
          highlight-current-row
          :row-class-name="rowClassName"
        >
          <el-table-column type="selection" width="50" />
          <el-table-column prop="priority" label="优先级" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.priority === 'high' ? 'danger' : scope.row.priority === 'medium' ? 'warning' : 'success'">
                {{ scope.row.priority === 'high' ? '高' : scope.row.priority === 'medium' ? '中' : '低' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="content" label="内容" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="scope">
              <el-tag :type="statusType(scope.row.status)">
                {{ statusLabel(scope.row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="截止日期" width="120">
            <template #default="scope">
              <span :class="{ 'text-danger': scope.row.isOverdue }">
                {{ formatDate(scope.row.deadline) }}
                <el-tag v-if="scope.row.isOverdue" type="danger" size="small" style="margin-left: 4px;">逾期</el-tag>
              </span>
            </template>
          </el-table-column>
        </el-table>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header><span>待办详情</span></template>
          <template v-if="todoStore.selectedTodo">
            <h3>{{ todoStore.selectedTodo.content }}</h3>
            <el-tag
              :type="todoStore.selectedTodo.priority === 'high' ? 'danger' : todoStore.selectedTodo.priority === 'medium' ? 'warning' : 'success'"
            >
              {{ todoStore.selectedTodo.priority === 'high' ? '高优先级' : todoStore.selectedTodo.priority === 'medium' ? '中优先级' : '低优先级' }}
            </el-tag>
            <el-divider />
            <p>来源：{{ todoStore.selectedTodo.sourceStandupDate || '--' }} 站会</p>
            <p>责任人：{{ todoStore.selectedTodo.assigneeName || '--' }}（你）</p>
            <p>分配人：{{ todoStore.selectedTodo.assignerName || '--' }}</p>
            <p>截止：{{ getRelativeDeadline(todoStore.selectedTodo.deadline) }}</p>
            <p>状态：{{ statusLabel(todoStore.selectedTodo.status) }}</p>
            <el-divider />
            <div class="detail-actions">
              <el-button text @click="handleStatusChange('done')" :disabled="todoStore.selectedTodo.status === 'done'">
                [ 标记完成 ]
              </el-button>
              <el-button text @click="handleStatusChange('in_progress')" :disabled="todoStore.selectedTodo.status === 'in_progress'">
                [ 标记进行中 ]
              </el-button>
              <el-button text>[ 转交他人 ]</el-button>
              <el-button text @click="handleStatusChange('cancelled')">[ 取消待办 ]</el-button>
            </div>
          </template>
          <div v-else style="text-align: center; color: #909399; padding: 40px 0;">
            点击左侧待办查看详情
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Create Todo Dialog -->
    <el-dialog v-model="showCreateDialog" title="新建待办" width="480px">
      <el-form label-width="80px">
        <el-form-item label="内容">
          <el-input v-model="newTodo.content" type="textarea" rows="3" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="newTodo.priority">
            <el-radio value="high">高</el-radio>
            <el-radio value="medium">中</el-radio>
            <el-radio value="low">低</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="截止日期">
          <el-date-picker v-model="newTodo.deadline" type="date" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="责任人">
          <el-input v-model="newTodo.assigneeName" placeholder="输入责任人姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :disabled="!newTodo.content.trim()">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useTodoStore } from '../stores/useTodoStore'
import { TODO_STATUS, TODO_STATUS_LABELS } from '../utils/constants'
import { formatDate, getRelativeDeadline } from '../utils/formatters'
import { ElMessage } from 'element-plus'

const todoStore = useTodoStore()
const showCreateDialog = ref(false)

const newTodo = reactive({
  content: '',
  priority: 'medium',
  deadline: null,
  assigneeName: ''
})

function statusType(status) {
  const map = { pending: 'danger', in_progress: 'warning', done: 'success', cancelled: 'info' }
  return map[status] || 'info'
}

function statusLabel(status) {
  return TODO_STATUS_LABELS[status] || status
}

function rowClassName({ row }) {
  return row.isOverdue ? 'row-overdue' : ''
}

function handleRowClick(row) {
  todoStore.selectTodo(row.id)
}

function handleStatusChange(status) {
  if (todoStore.selectedTodoId) {
    todoStore.updateTodoStatus(todoStore.selectedTodoId, status)
    ElMessage.success(`已${status === 'done' ? '完成' : status === 'in_progress' ? '标记进行中' : '取消'}`)
  }
}

function handleCreate() {
  todoStore.createTodo({
    content: newTodo.content,
    priority: newTodo.priority,
    deadline: newTodo.deadline ? newTodo.deadline.toISOString() : null,
    assigneeName: newTodo.assigneeName || '未分配'
  })
  showCreateDialog.value = false
  newTodo.content = ''
  newTodo.deadline = null
  newTodo.assigneeName = ''
  ElMessage.success('待办已创建')
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.text-danger {
  color: #F56C6C;
}
</style>
