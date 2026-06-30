import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { generateId } from '../utils/idGenerator'
import { STANDUP_STATUS, STANDUP_MODE, SPEAKER_STATUS, WS_MSG } from '../utils/constants'
import { wsService } from '../services/websocket/wsService'
import { teamWsService } from '../services/websocket/teamWsService'
import { useCrossTabSync } from '../composables/useCrossTabSync'

export const useStandupStore = defineStore('standup', () => {
  // --- Standup list ---
  const standupList = ref([])
  const loading = ref(false)

  // --- Active meetings (support multiple concurrent standups) ---
  const activeMeetings = ref({})   // { [id]: meetingObject }
  const currentMeetingId = ref(null)

  function _emptyMeeting() {
    return {
      id: null, sprintId: null, sprintName: '', teamId: null,
      mode: STANDUP_MODE.LIVE, status: STANDUP_STATUS.IDLE,
      timerSeconds: 900, isOvertime: false, overtimeConfirmed: false,
      speakingOrder: [], currentSpeakerIndex: -1, skippedMembers: [],
      memberStatuses: {}, asyncSubmissions: {},
      createdAt: new Date().toISOString(), createdBy: null
    }
  }

  // Current meeting — always refers to the active meeting object
  const currentMeeting = ref(_emptyMeeting())

  // --- AI Summary ---
  const currentSummary = ref({
    id: null,
    standupId: null,
    doneList: [],
    planList: [],
    blockers: [],
    actionItems: [],
    isArchived: false,
    aiFailed: false,
    fallbackText: ''
  })

  const wsConnected = ref(false)
  let _unsubscribers = []
  let _timerInterval = null

  // --- Cross-tab sync (BroadcastChannel) ---
  const { register, broadcast } = useCrossTabSync()
  register('standup', (action, payload) => {
    if (action === 'list-changed') {
      fetchStandupList()
      // Also remove ended standup from activeMeetings
      if (payload && payload.standupId) {
        delete activeMeetings.value[payload.standupId]
      }
    }
  })

  // --- Team WebSocket listeners (cross-user real-time sync) ---
  let _teamWsUnsubs = []
  function _setupTeamWsListeners() {
    _teamWsUnsubs.forEach(fn => fn())
    _teamWsUnsubs = [
      teamWsService.on(WS_MSG.STANDUP_CREATED, (payload) => {
        // Immediately add to activeMeetings so it appears without refresh
        if (payload && payload.id) {
          const sid = String(payload.id)
          if (!activeMeetings.value[sid]) {
            activeMeetings.value[sid] = {
              id: payload.id,
              sprintId: null,
              sprintName: payload.sprint || '',
              teamId: payload.teamId || null,
              mode: payload.mode || STANDUP_MODE.LIVE,
              status: STANDUP_STATUS.IDLE,
              timerSeconds: 900,
              isOvertime: false, overtimeConfirmed: false,
              speakingOrder: [],
              currentSpeakerIndex: -1, skippedMembers: [],
              memberStatuses: {}, asyncSubmissions: {},
              createdAt: payload.meetingDate || new Date().toISOString(),
              createdBy: null
            }
          }
        }
        fetchStandupList()
      }),
      teamWsService.on(WS_MSG.STANDUP_LIVE_STATE, (payload) => {
        // Another user's meeting state broadcast — update our activeMeetings card
        if (payload && payload.standupId) {
          const sid = String(payload.standupId)
          if (activeMeetings.value[sid]) {
            const m = activeMeetings.value[sid]
            if (payload.status) m.status = payload.status
            if (payload.timerSeconds != null) m.timerSeconds = payload.timerSeconds
            if (payload.currentSpeakerIndex != null) m.currentSpeakerIndex = payload.currentSpeakerIndex
            if (payload.speakingOrder) m.speakingOrder = payload.speakingOrder
            if (payload.doneCount != null) m._doneCount = payload.doneCount
            if (payload.totalCount != null) m._totalCount = payload.totalCount
          }
        }
      }),
      teamWsService.on(WS_MSG.STANDUP_LIST_CHANGED, (payload) => {
        const sid = payload && payload.standupId
        if (sid) {
          // Remove from activeMeetings (other user ended the standup)
          delete activeMeetings.value[sid]
          // If current user is viewing this meeting, reset it
          if (currentMeeting.value.id === sid || String(currentMeeting.value.id) === String(sid)) {
            cleanupStandup()
            currentMeeting.value = _emptyMeeting()
            currentMeetingId.value = null
          }
        }
        // Refresh the list
        fetchStandupList()
      })
    ]
  }
  _setupTeamWsListeners()

  // --- Getters ---
  const currentSpeakerId = computed(() => {
    const order = currentMeeting.value.speakingOrder
    const idx = currentMeeting.value.currentSpeakerIndex
    return idx >= 0 && idx < order.length ? order[idx] : null
  })

  const isAllDone = computed(() => {
    const statuses = currentMeeting.value.memberStatuses
    const order = currentMeeting.value.speakingOrder
    if (!order.length) return false
    return order.every(id => {
      const s = statuses[id]?.status
      return s === SPEAKER_STATUS.DONE || s === SPEAKER_STATUS.SKIPPED
    })
  })

  const doneCount = computed(() => {
    return Object.values(currentMeeting.value.memberStatuses)
      .filter(s => s.status === SPEAKER_STATUS.DONE).length
  })

  const totalCount = computed(() => currentMeeting.value.speakingOrder.length)

  const timerFormatted = computed(() => {
    const s = currentMeeting.value.timerSeconds
    if (s <= 0) return '00:00'
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  })

  const isTimerWarning = computed(() => {
    return currentMeeting.value.timerSeconds <= 120 && currentMeeting.value.timerSeconds > 0
  })

  const currentSpeaker = computed(() => {
    const id = currentSpeakerId.value
    if (!id) return null
    return {
      id,
      status: currentMeeting.value.memberStatuses[id]?.status || SPEAKER_STATUS.WAITING
    }
  })

  // --- Actions ---
  async function fetchStandupList() {
    // Try backend first
    try {
      const { apiGet } = await import('../services/api/index.js')
      const { useTeamStore } = await import('../stores/useTeamStore.js')
      const teamId = useTeamStore().currentTeam?.id
      if (teamId) {
        const res = await apiGet(`/standups?teamId=${teamId}`)
        if (res && res.code === 200 && res.data) {
          // Preserve rich local data by merging with existing list
          const oldMap = {}
          standupList.value.forEach(s => { oldMap[s.id] = s })

          standupList.value = (res.data || []).map(item => {
            const old = oldMap[item.id] || {}
            const startTime = item.createTime ? new Date(item.createTime) : null
            const timeStr = startTime
              ? `${String(startTime.getHours()).padStart(2,'0')}:${String(startTime.getMinutes()).padStart(2,'0')}`
              : (old.time || '')
            return {
              ...item,
              sprintName: item.sprint || old.sprintName || '',
              date: item.meetingDate || item.date || old.date || '',
              time: old.time || timeStr,
              attendance: old.attendance || item.attendance || '',
              attendanceRate: old.attendanceRate != null ? old.attendanceRate : (item.attendanceRate || 0),
              finishRate: old.finishRate != null ? old.finishRate : (item.finishRate || 0),
              blockCount: old.blockCount != null ? old.blockCount : (item.blockCount || 0)
            }
          })
          // Sync activeMeetings with backend: remove archived/finished, seed today's active ones
          Object.keys(activeMeetings.value).forEach(mid => {
            const m = activeMeetings.value[mid]
            const backendItem = res.data.find(s => String(s.id) === String(mid))
            const isArchivedOnBackend = backendItem && backendItem.status === 'archived'
            if (m && (m.status === STANDUP_STATUS.FINISHED || isArchivedOnBackend)) {
              delete activeMeetings.value[mid]
            }
          })
          // Seed activeMeetings from backend for today's non-archived standups
          const todayStr = new Date().toISOString().split('T')[0]
          res.data.forEach(item => {
            const sid = String(item.id)
            const itemDate = item.meetingDate || (item.createTime ? item.createTime.split('T')[0] : '')
            if (item.status !== 'archived' && itemDate === todayStr && !activeMeetings.value[sid]) {
              activeMeetings.value[sid] = {
                id: item.id,
                sprintId: null,
                sprintName: item.sprint || '',
                teamId: item.teamId,
                mode: item.mode || STANDUP_MODE.LIVE,
                status: STANDUP_STATUS.IDLE,
                timerSeconds: item.countdownSeconds || 900,
                isOvertime: false, overtimeConfirmed: false,
                speakingOrder: [],
                currentSpeakerIndex: -1, skippedMembers: [],
                memberStatuses: {}, asyncSubmissions: {},
                createdAt: item.createTime || new Date().toISOString(),
                createdBy: item.createdBy
              }
            }
          })
          return
        }
      }
    } catch { /* fall back to local */ }

    // Only seed with demo data if list is completely empty (first visit)
    if (standupList.value.length === 0) {
      standupList.value = [
        { id: 'st-1', sprintId: 'sprint_1', sprintName: 'Sprint #12', date: '2026-06-25', attendance: '4/5 (80%)', attendanceRate: 80, finishRate: 80, blockCount: 2, status: 'completed' },
        { id: 'st-2', sprintId: 'sprint_1', sprintName: 'Sprint #12', date: '2026-06-24', attendance: '5/5 (100%)', attendanceRate: 100, finishRate: 60, blockCount: 1, status: 'completed' },
        { id: 'st-3', sprintId: 'sprint_1', sprintName: 'Sprint #12', date: '2026-06-23', attendance: '3/5 (60%)', attendanceRate: 60, finishRate: 100, blockCount: 0, status: 'completed' },
        { id: 'st-4', sprintId: 'sprint_0', sprintName: 'Sprint #11', date: '2026-06-22', attendance: '5/5 (100%)', attendanceRate: 100, finishRate: 75, blockCount: 1, status: 'completed' },
        { id: 'st-5', sprintId: 'sprint_0', sprintName: 'Sprint #11', date: '2026-06-21', attendance: '4/5 (80%)', attendanceRate: 80, finishRate: 50, blockCount: 3, status: 'completed' }
      ]
    }
  }

  async function createStandup({ sprintId, sprintName, memberIds, mode }) {
    // Call backend to create the standup in DB → get real numeric ID
    let backendId = null
    try {
      const { apiPost } = await import('../services/api/index.js')
      const { useTeamStore } = await import('../stores/useTeamStore.js')
      const ts = useTeamStore()
      const res = await apiPost('/standups', {
        teamId: ts.currentTeam?.id || 1,
        sprint: sprintName,
        mode: mode || STANDUP_MODE.LIVE,
        memberIds
      })
      if (res && res.code === 200 && res.data) {
        backendId = res.data.id
      }
    } catch { /* use local ID fallback */ }

    const id = backendId || generateId('st-')
    const memberStatuses = {}
    memberIds.forEach(mid => {
      memberStatuses[mid] = {
        status: SPEAKER_STATUS.WAITING,
        yesterday: '',
        today: '',
        blockers: '',
        submittedAt: null
      }
    })

    // Get teamId for this meeting
    let teamId = null
    try {
      const { useTeamStore } = await import('../stores/useTeamStore.js')
      teamId = useTeamStore().currentTeam?.id || 1
    } catch { teamId = 1 }

    const meeting = {
      id, sprintId, sprintName, teamId,
      mode: mode || STANDUP_MODE.LIVE,
      status: STANDUP_STATUS.IDLE,
      timerSeconds: 900, isOvertime: false, overtimeConfirmed: false,
      speakingOrder: [...memberIds], currentSpeakerIndex: -1, skippedMembers: [],
      memberStatuses, asyncSubmissions: {},
      createdAt: new Date().toISOString(),
      createdBy: null
    }

    // Store who created this meeting (for permission checks)
    try {
      const { useUserStore } = await import('../stores/useUserStore.js')
      meeting.createdBy = useUserStore().currentUser?.id
    } catch {}

    // Store in active meetings map
    activeMeetings.value[id] = meeting
    currentMeeting.value = meeting
    currentMeetingId.value = id
    broadcast('standup', 'list-changed')

    return id
  }

  function startStandup() {
    currentMeeting.value.status = STANDUP_STATUS.COUNTING
    startTimer()
    // Connect WebSocket
    wsService.connect(currentMeeting.value.id, 'current-user')
    wsConnected.value = true
    _setupWsHandlers()
    broadcastLiveState()
  }

  // Broadcast live meeting state via team WS for real-time card updates
  function broadcastLiveState() {
    const m = currentMeeting.value
    if (!m || !m.id) return
    teamWsService.send(WS_MSG.STANDUP_LIVE_STATE, {
      standupId: m.id,
      status: m.status,
      timerSeconds: m.timerSeconds,
      currentSpeakerIndex: m.currentSpeakerIndex,
      speakingOrder: m.speakingOrder,
      doneCount: doneCount.value,
      totalCount: totalCount.value
    })
  }

  function nextSpeaker() {
    const order = currentMeeting.value.speakingOrder
    let idx = currentMeeting.value.currentSpeakerIndex + 1
    // Find next non-skipped, non-done speaker
    while (idx < order.length) {
      const sid = order[idx]
      const status = currentMeeting.value.memberStatuses[sid]?.status
      if (status !== SPEAKER_STATUS.DONE && status !== SPEAKER_STATUS.SKIPPED) {
        break
      }
      idx++
    }
    if (idx >= order.length) {
      // All speakers done — meeting stays active, user decides to end or AI-summarize
      currentMeeting.value.currentSpeakerIndex = -1
      currentMeeting.value.status = STANDUP_STATUS.SPEAKING
      return
    }
    currentMeeting.value.currentSpeakerIndex = idx
    const speakerId = order[idx]
    currentMeeting.value.memberStatuses[speakerId].status = SPEAKER_STATUS.SPEAKING
    currentMeeting.value.status = STANDUP_STATUS.SPEAKING
    wsService.send(WS_MSG.SPEAKER_CHANGED, { speakerId, index: idx })
    broadcastLiveState()
  }

  function skipSpeaker(speakerId) {
    currentMeeting.value.skippedMembers.push(speakerId)
    currentMeeting.value.memberStatuses[speakerId].status = SPEAKER_STATUS.SKIPPED
    wsService.send(WS_MSG.SKIP_SPEAKER, { speakerId })
    nextSpeaker()
  }

  function reinsertSpeaker(memberId) {
    // Remove from skipped list
    const idx = currentMeeting.value.skippedMembers.indexOf(memberId)
    if (idx > -1) currentMeeting.value.skippedMembers.splice(idx, 1)
    // Reset status to waiting
    currentMeeting.value.memberStatuses[memberId].status = SPEAKER_STATUS.WAITING
    // Insert after current speaker if active, or append to end
    const order = currentMeeting.value.speakingOrder
    const curIdx = currentMeeting.value.currentSpeakerIndex
    if (curIdx >= 0 && curIdx < order.length - 1) {
      order.splice(curIdx + 1, 0, memberId)
    } else {
      order.push(memberId)
    }
    wsService.send(WS_MSG.REORDER, { order: [...order] })
  }

  function submitSpeech({ yesterday, today, blockers }) {
    const speakerId = currentSpeakerId.value
    if (!speakerId) return

    currentMeeting.value.memberStatuses[speakerId] = {
      ...currentMeeting.value.memberStatuses[speakerId],
      status: SPEAKER_STATUS.DONE,
      yesterday,
      today,
      blockers,
      submittedAt: new Date().toISOString()
    }

    // Save to backend
    const meetingId = currentMeeting.value.id
    if (meetingId) {
      import('../services/api/index.js').then(({ apiPost }) => {
        apiPost(`/standups/${meetingId}/speeches`, {
          yesterdayWork: yesterday,
          todayPlan: today,
          blockers
        }).catch(() => {})
      })
    }

    wsService.send(WS_MSG.SUBMIT_SPEECH, { speakerId, yesterday, today, blockers })

    nextSpeaker()
    broadcastLiveState()
  }

  function reorderSpeakingOrder(newOrder) {
    currentMeeting.value.speakingOrder = newOrder
    wsService.send(WS_MSG.REORDER, { order: newOrder })
  }

  function startTimer() {
    clearTimerInterval()
    currentMeeting.value.timerSeconds = 900
    currentMeeting.value.isOvertime = false
    _timerInterval = setInterval(() => {
      if (currentMeeting.value.status === STANDUP_STATUS.FINISHED) {
        clearTimerInterval()
        return
      }
      currentMeeting.value.timerSeconds--
      if (currentMeeting.value.timerSeconds <= 0) {
        currentMeeting.value.timerSeconds = 0
        currentMeeting.value.isOvertime = true
        currentMeeting.value.status = STANDUP_STATUS.OVERTIME
        clearTimerInterval()
      }
    }, 1000)
    wsService.send(WS_MSG.TIMER_START, { seconds: 900 })
  }

  function clearTimerInterval() {
    if (_timerInterval) {
      clearInterval(_timerInterval)
      _timerInterval = null
    }
  }

  function confirmOvertime() {
    currentMeeting.value.overtimeConfirmed = true
    currentMeeting.value.isOvertime = false
    // Start counting up
    currentMeeting.value.timerSeconds = 0
    wsService.send(WS_MSG.OVERTIME_CONFIRM, {})
  }

  async function finishStandup() {
    const meetingId = currentMeeting.value.id

    // Call backend API to persist and broadcast to all users
    if (meetingId) {
      try {
        const { apiPost } = await import('../services/api/index.js')
        await apiPost(`/standups/${meetingId}/end`)
      } catch { /* backend unreachable, still clean up locally */ }
    }

    currentMeeting.value.status = STANDUP_STATUS.FINISHED
    clearTimerInterval()
    wsService.send(WS_MSG.END_STANDUP, { standupId: meetingId })
    wsService.disconnect()
    wsConnected.value = false
    _unsubscribers.forEach(unsub => unsub())
    _unsubscribers = []

    const startTime = currentMeeting.value.createdAt ? new Date(currentMeeting.value.createdAt) : new Date()
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const timeStr = `${String(startTime.getHours()).padStart(2,'0')}:${String(startTime.getMinutes()).padStart(2,'0')}`

    // Add to history
    standupList.value.unshift({
      id: currentMeeting.value.id,
      sprintId: currentMeeting.value.sprintId,
      sprintName: currentMeeting.value.sprintName,
      date: dateStr,
      time: timeStr,
      attendance: `${doneCount.value}/${totalCount.value} (${totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0}%)`,
      attendanceRate: totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0,
      finishRate: totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0,
      blockCount: Object.values(currentMeeting.value.memberStatuses).filter(s => s.blockers && s.blockers.trim()).length,
      status: 'completed'
    })

    // Cache the summary for historical viewing
    if (currentSummary.value.id) {
      summaryHistory.value[currentMeeting.value.id] = { ...currentSummary.value, isArchived: true, editable: false }
    }

    // Remove from active meetings
    const mid = currentMeeting.value.id
    if (mid) delete activeMeetings.value[mid]
    currentMeeting.value = _emptyMeeting()
    currentMeetingId.value = null
    broadcast('standup', 'list-changed')
  }

  function resetCurrentMeeting() {
    const mid = currentMeeting.value.id
    if (mid) delete activeMeetings.value[mid]
    currentMeeting.value = _emptyMeeting()
    currentMeetingId.value = null
  }

  async function generateSummary() {
    const meetingId = currentMeeting.value.id
    if (!meetingId) return currentSummary.value

    // Call backend AI API
    try {
      const { apiPost } = await import('../services/api/index.js')
      const res = await apiPost(`/standups/${meetingId}/summary/generate`)
      if (res && res.code === 200 && res.data) {
        const d = res.data
        const names = await _loadMemberNames()
        currentSummary.value = {
          id: generateId('sum_'),
          standupId: meetingId,
          doneList: _normalizeItems(d.doneList, 'd').map(item => ({ ...item, text: _resolveUserNames(item.text, names), editable: true })),
          planList: _normalizeItems(d.planList, 'p').map(item => ({ ...item, text: _resolveUserNames(item.text, names), editable: true })),
          blockers: _normalizeItems(d.blockers, 'b').map(item => ({ ...item, text: _resolveUserNames(item.text, names), editable: true })),
          actionItems: _normalizeItems(d.actionItems, 'a').map(item => ({ ...item, editable: true })),
          isArchived: false,
          aiFailed: false,
          fallbackText: d.fallbackText || ''
        }
        return currentSummary.value
      }
    } catch (e) {
      // API call failed — use local build
    }

    // Local fallback
    const statuses = currentMeeting.value.memberStatuses
    const members = Object.entries(statuses)
    const doneList = members.filter(([, s]) => s.yesterday).map(([id, s], i) => ({ id: generateId('d_'), text: `${id}: ${s.yesterday}`, order: i, editable: true }))
    const planList = members.filter(([, s]) => s.today).map(([id, s], i) => ({ id: generateId('p_'), text: `${id}: ${s.today}`, order: i, editable: true }))
    const blockers = members.filter(([, s]) => s.blockers && s.blockers.trim()).map(([id, s], i) => ({ id: generateId('b_'), text: `【问题】${s.blockers}`, type: '技术问题', reporter: id, order: i, editable: true }))
    const actionItems = members.filter(([, s]) => s.blockers && s.blockers.trim()).map(([id], i) => ({ id: generateId('a_'), text: '处理待办事项', priority: 'high', assignee: id, deadline: '明天', order: i, editable: true }))

    currentSummary.value = {
      id: generateId('sum_'), standupId: meetingId,
      doneList, planList, blockers,
      actionItems: actionItems.length ? actionItems : [
        { id: generateId('a_'), text: 'Code Review 代码', priority: 'medium', assignee: '李四', deadline: '无截止', order: 0, editable: true }
      ],
      isArchived: false, aiFailed: true,
      fallbackText: 'AI 服务未连接，展示本地整理结果'
    }
    return currentSummary.value
  }

  function updateSummaryItem(section, itemId, text) {
    const list = currentSummary.value[section]
    if (!list) return
    const item = list.find(i => i.id === itemId)
    if (item) item.text = text
  }

  function reorderSummaryItems(section, newOrder) {
    currentSummary.value[section] = newOrder
  }

  function archiveSummary() {
    currentSummary.value.isArchived = true
  }

  // Light cleanup: just disconnect WS and clear timers (for page navigation)
  function cleanupStandup() {
    clearTimerInterval()
    wsService.disconnect()
    wsConnected.value = false
    _unsubscribers.forEach(unsub => unsub())
    _unsubscribers = []
    // Only reset currentMeeting pointer, DON'T delete from activeMeetings
    // The meeting is still active, user just navigated away
    currentMeeting.value = _emptyMeeting()
    currentMeetingId.value = null
  }

  // Full cleanup: remove from activeMeetings (for when meeting is actually ended)
  function _fullCleanup() {
    clearTimerInterval()
    wsService.disconnect()
    wsConnected.value = false
    _unsubscribers.forEach(unsub => unsub())
    _unsubscribers = []
    if (currentMeeting.value.id) {
      delete activeMeetings.value[currentMeeting.value.id]
    }
    currentMeeting.value = _emptyMeeting()
    currentMeetingId.value = null
  }

  // Summary history cache
  const summaryHistory = ref({})

  // Helper: normalize string[] or object[] to {id, text, order, editable}[]
  function _normalizeItems(items, prefix) {
    if (!items || !items.length) return []
    return items.map((item, i) => {
      if (typeof item === 'string') {
        return { id: `${prefix}_${i}`, text: item, order: i, editable: false }
      }
      return { id: item.id || `${prefix}_${i}`, text: item.text || item.content || '', order: item.order || i, editable: false }
    })
  }

  // Helper: resolve "用户123" → real name
  function _resolveUserNames(text, names) {
    if (!text || !names) return text
    return text.replace(/用户(\d+)/g, (match, uid) => names[uid] || match)
  }

  // Load member name map — maps both team_member.id AND user.id to name
  async function _loadMemberNames() {
    try {
      const { useTeamStore } = await import('../stores/useTeamStore.js')
      const teamStore = useTeamStore()
      const map = {}
      teamStore.activeMembers.forEach(m => {
        if (m.id) map[String(m.id)] = m.name
        if (m.userId) map[String(m.userId)] = m.name
      })
      return map
    } catch { return {} }
  }

  async function loadHistoricalSummary(standupId) {
    // 1. Check cache
    if (summaryHistory.value[standupId]) {
      currentSummary.value = summaryHistory.value[standupId]
      return
    }

    // 2. Try backend summary API
    try {
      const { apiGet } = await import('../services/api/index.js')
      const res = await apiGet(`/standups/${standupId}/summary`)
      if (res && res.code === 200 && res.data) {
        const names = await _loadMemberNames()
        const d = res.data
        const s = {
          id: `sum_${standupId}`, standupId,
          doneList: _normalizeItems(d.doneList, 'd').map(item => ({ ...item, text: _resolveUserNames(item.text, names) })),
          planList: _normalizeItems(d.planList, 'p').map(item => ({ ...item, text: _resolveUserNames(item.text, names) })),
          blockers: _normalizeItems(d.blockers, 'b').map(item => ({ ...item, text: _resolveUserNames(item.text, names) })),
          actionItems: _normalizeItems(d.actionItems, 'a'),
          isArchived: d.isArchived !== undefined ? !!d.isArchived : true,
          aiFailed: false,
          fallbackText: ''
        }
        summaryHistory.value[standupId] = s
        currentSummary.value = s
        return
      }
    } catch { /* continue */ }

    // 3. Try backend standup detail → build summary from speeches
    try {
      const { apiGet } = await import('../services/api/index.js')
      const res = await apiGet(`/standups/${standupId}`)
      if (res && res.code === 200 && res.data && res.data.records) {
        const names = await _loadMemberNames()
        const records = res.data.records || []
        const doneList = records.filter(r => r.yesterdayWork).map((r, i) => ({
          id: `d_${i}`, text: _resolveUserNames(`用户${r.userId}: ${r.yesterdayWork}`, names), order: i, editable: false
        }))
        const planList = records.filter(r => r.todayPlan).map((r, i) => ({
          id: `p_${i}`, text: _resolveUserNames(`用户${r.userId}: ${r.todayPlan}`, names), order: i, editable: false
        }))
        const blockers = records.filter(r => r.blockers).map((r, i) => ({
          id: `b_${i}`, text: _resolveUserNames(`用户${r.userId}: ${r.blockers}`, names), type: '', reporter: String(r.userId), order: i, editable: false
        }))
        const s = { id: `sum_${standupId}`, standupId, doneList, planList, blockers, actionItems: [], isArchived: true, aiFailed: false, fallbackText: '' }
        summaryHistory.value[standupId] = s
        currentSummary.value = s
        return
      }
    } catch { /* continue */ }

    // 4. Look through local standup list for basic info
    const local = standupList.value.find(s => s.id === standupId)
    if (local) {
      const s = {
        id: `sum_${standupId}`, standupId,
        doneList: [], planList: [], blockers: [], actionItems: [],
        isArchived: true, aiFailed: false,
        fallbackText: `站会日期: ${local.date}\nSprint: ${local.sprintName}\n出勤率: ${local.attendanceRate}%\n完成率: ${local.finishRate}%\n阻碍: ${local.blockCount} 个`
      }
      summaryHistory.value[standupId] = s
      currentSummary.value = s
      return
    }

    // 5. Nothing found
    currentSummary.value = {
      id: `sum_${standupId}`, standupId,
      doneList: [], planList: [], blockers: [], actionItems: [],
      isArchived: true, aiFailed: true,
      fallbackText: '该站会数据不可用，可能已被删除或尚未生成纪要'
    }
  }

  function _setupWsHandlers() {
    _unsubscribers.push(
      wsService.on(WS_MSG.MEMBER_STATUS, (payload) => {
        if (currentMeeting.value.memberStatuses[payload.speakerId]) {
          currentMeeting.value.memberStatuses[payload.speakerId].status = payload.status
        }
      }),
      wsService.on(WS_MSG.SPEECH_SUBMITTED, (payload) => {
        if (currentMeeting.value.memberStatuses[payload.speakerId]) {
          currentMeeting.value.memberStatuses[payload.speakerId] = {
            status: SPEAKER_STATUS.DONE,
            yesterday: payload.yesterday,
            today: payload.today,
            blockers: payload.blockers,
            submittedAt: new Date().toISOString()
          }
        }
      }),
      wsService.on(WS_MSG.SPEAKER_CHANGED, (payload) => {
        currentMeeting.value.currentSpeakerIndex = payload.index
      }),
      wsService.on(WS_MSG.SPEAKER_SKIPPED, (payload) => {
        if (currentMeeting.value.memberStatuses[payload.speakerId]) {
          currentMeeting.value.memberStatuses[payload.speakerId].status = SPEAKER_STATUS.SKIPPED
        }
      }),
      wsService.on(WS_MSG.ORDER_UPDATED, (payload) => {
        currentMeeting.value.speakingOrder = payload.order
      }),
      wsService.on(WS_MSG.TIMER_SYNC, (payload) => {
        currentMeeting.value.timerSeconds = payload.seconds
      }),
      wsService.on(WS_MSG.STANDUP_ENDED, () => {
        cleanupStandup()
      }),
      wsService.on(WS_MSG.STANDUP_CANCELLED, () => {
        cleanupStandup()
      }),
      wsService.on(WS_MSG.MEMBER_JOINED, (payload) => {
        // Another member joined the room — in production this would update UI
      }),
      wsService.on(WS_MSG.MEMBER_LEFT, (payload) => {
        // Another member left the room
      }),
      wsService.on(WS_MSG.TIMER_WARNING, () => {
        currentMeeting.value.timerSeconds = 120
      }),
      wsService.on(WS_MSG.ERROR, (payload) => {
        console.error('WS Error:', payload.message)
      })
    )
  }

  function loadMeeting(meetingId) {
    const m = activeMeetings.value[meetingId]
    if (m) {
      currentMeeting.value = m
      currentMeetingId.value = meetingId
      return true
    }
    return false
  }

  return {
    standupList, loading, activeMeetings, currentMeeting, currentMeetingId, currentSummary, wsConnected,
    currentSpeakerId, isAllDone, doneCount, totalCount, timerFormatted, isTimerWarning, currentSpeaker,
    fetchStandupList, createStandup, startStandup, nextSpeaker, skipSpeaker,
    submitSpeech, reorderSpeakingOrder, reinsertSpeaker, startTimer, confirmOvertime,
    finishStandup, broadcastLiveState, generateSummary, updateSummaryItem, reorderSummaryItems,
    archiveSummary, cleanupStandup, loadHistoricalSummary, resetCurrentMeeting, loadMeeting
  }
}, {
  persist: {
    key: 'standup',
    pick: ['standupList', 'summaryHistory'],
    serializer: {
      serialize: (state) => JSON.stringify(state),
      deserialize: (raw) => {
        try { return JSON.parse(raw) } catch { return {} }
      }
    }
  }
})
