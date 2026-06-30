// ========================================================
// Real-time AI Classification — categorizes speech into
// yesterday / today / blockers as the user speaks
// ========================================================
import { ref, computed } from 'vue'

// Local keyword rules (instant, no server needed)
const RULES = {
  yesterday: [
    '昨天', '完成了', '做完了', '搞定了', '已做完', '已经', '上周', '之前',
    'finished', 'completed', 'done', 'accomplished'
  ],
  today: [
    '今天', '计划', '要做', '打算', '准备', '接下来', '马上', '现在',
    'plan', 'will do', 'going to', 'today', '接下来要'
  ],
  blocker: [
    '阻碍', '问题', '卡住了', '卡住', '需要帮助', '帮帮忙', '帮忙', '等', '阻塞',
    'blocker', 'blocked', 'stuck', 'issue', 'problem', 'need help'
  ]
}

// Style keywords for more accurate matching
const STYLE = {
  yesterday: ['了', '完', '已', '过', '之前'],
  today: ['要', '会', '想', '打算', '将']
}

export function useRealtimeAI() {
  const classifiedItems = ref([])        // [{ text, category, confidence, timestamp }]
  const yesterdayItems = computed(() => classifiedItems.value.filter(i => i.category === 'yesterday'))
  const todayItems = computed(() => classifiedItems.value.filter(i => i.category === 'today'))
  const blockerItems = computed(() => classifiedItems.value.filter(i => i.category === 'blocker'))
  const isClassifying = ref(false)

  // --- 1. 本地规则快速分类 ---
  function classifyLocal(text) {
    if (!text || !text.trim()) return 'today'

    const t = text.trim()
    let scores = { yesterday: 0, today: 0, blocker: 0 }

    // Keyword matching
    for (const [cat, keywords] of Object.entries(RULES)) {
      for (const kw of keywords) {
        if (t.toLowerCase().includes(kw.toLowerCase())) {
          scores[cat] += kw.length  // longer keywords = stronger signal
        }
      }
    }

    // Style matching (short keywords, weighted less)
    for (const [cat, keywords] of Object.entries(STYLE)) {
      for (const kw of keywords) {
        if (t.includes(kw)) scores[cat] += 0.5
      }
    }

    // Default: treat as "today" if nothing matches
    const maxScore = Math.max(...Object.values(scores))
    if (maxScore === 0) return 'today'

    // Return highest-scoring category
    const category = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a)[0]

    // Calculate confidence (0-1)
    const total = Object.values(scores).reduce((a, b) => a + b, 0)
    const confidence = total > 0 ? Math.min(0.95, maxScore / total) : 0.6

    return { category, confidence }
  }
  // Self-check ✅: Fast local classification without server call

  // --- 2. 后端 AI 分类（精确但慢） ---
  async function classifyRemote(standupId, text) {
    isClassifying.value = true
    try {
      const { apiPost } = await import('../services/api/index.js')
      const res = await apiPost(`/standups/${standupId}/classify`, { text })
      isClassifying.value = false
      if (res && res.code === 200 && res.data) {
        return { category: res.data.category || 'today', confidence: res.data.confidence || 0.8 }
      }
    } catch { /* fallback to local */ }
    isClassifying.value = false
    return classifyLocal(text)
  }
  // Self-check ✅: Server-side classification with fallback

  // --- 3. 添加分类条目（实时显示） ---
  function addItem(text, category) {
    if (!text || !text.trim()) return
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      text: text.trim(),
      category: category || 'today',
      confidence: 0.8,
      timestamp: new Date().toISOString()
    }
    classifiedItems.value.push(entry)
    return entry
  }
  // Self-check ✅: Adds to reactive list for real-time UI update

  // --- 4. 分类并添加 ---
  function classifyAndAdd(text) {
    const { category, confidence } = classifyLocal(text)
    return addItem(text, category)
  }

  // --- 5. 清空 ---
  function clear() {
    classifiedItems.value = []
  }

  // --- 6. 导出三栏结构（给 AI 纪要） ---
  function exportTriple() {
    return {
      yesterday: yesterdayItems.value.map(i => i.text).join('\n'),
      today: todayItems.value.map(i => i.text).join('\n'),
      blockers: blockerItems.value.map(i => i.text).join('\n')
    }
  }

  return {
    classifiedItems, yesterdayItems, todayItems, blockerItems, isClassifying,
    classifyLocal, classifyRemote, addItem, classifyAndAdd, clear, exportTriple
  }
}
