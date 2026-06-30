export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${mins}`
}

export function formatPercent(value) {
  if (value == null) return '--'
  return `${Math.round(value)}%`
}

export function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function isOverdue(deadline) {
  if (!deadline) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(deadline)
  due.setHours(0, 0, 0, 0)
  return due < today
}

export function getRelativeDeadline(deadline) {
  if (!deadline) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(deadline)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `逾期 ${Math.abs(diffDays)} 天`
  if (diffDays === 0) return '今天截止'
  if (diffDays === 1) return '明天截止'
  if (diffDays <= 7) return `${diffDays} 天后截止`
  return formatDate(deadline)
}
