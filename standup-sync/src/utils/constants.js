// 用户角色
export const ROLES = {
  TECH_LEAD: 'tech_lead',
  SCRUM_MASTER: 'scrum_master',
  DEVELOPER: 'developer',
  OBSERVER: 'observer'
}

export const ROLE_LABELS = {
  [ROLES.TECH_LEAD]: '团长',
  [ROLES.SCRUM_MASTER]: '主持人',
  [ROLES.DEVELOPER]: '开发者',
  [ROLES.OBSERVER]: '观察者'
}

// 优先级
export const PRIORITIES = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
}

export const PRIORITY_CONFIG = {
  [PRIORITIES.HIGH]: { label: '高', type: 'danger', color: '#F56C6C' },
  [PRIORITIES.MEDIUM]: { label: '中', type: 'warning', color: '#E6A23C' },
  [PRIORITIES.LOW]: { label: '低', type: 'success', color: '#67C23A' }
}

// 待办状态
export const TODO_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled'
}

export const TODO_STATUS_LABELS = {
  [TODO_STATUS.PENDING]: '待处理',
  [TODO_STATUS.IN_PROGRESS]: '进行中',
  [TODO_STATUS.DONE]: '已完成',
  [TODO_STATUS.CANCELLED]: '已取消'
}

// 发言状态
export const SPEAKER_STATUS = {
  WAITING: 'waiting',
  SPEAKING: 'speaking',
  DONE: 'done',
  SKIPPED: 'skipped'
}

export const SPEAKER_STATUS_CONFIG = {
  [SPEAKER_STATUS.WAITING]: { label: '等待中', type: 'info', color: '#909399' },
  [SPEAKER_STATUS.SPEAKING]: { label: '发言中', type: 'primary', color: '#4094ED' },
  [SPEAKER_STATUS.DONE]: { label: '已发言', type: 'success', color: '#67C23A' },
  [SPEAKER_STATUS.SKIPPED]: { label: '已跳过', type: 'warning', color: '#E6A23C' }
}

// 站会状态
export const STANDUP_STATUS = {
  IDLE: 'idle',
  COUNTING: 'counting',
  SPEAKING: 'speaking',
  OVERTIME: 'overtime',
  FINISHED: 'finished',
  CANCELLED: 'cancelled'
}

// 站会模式
export const STANDUP_MODE = {
  LIVE: 'live',
  ASYNC: 'async'
}

// 阻碍类型
export const BLOCKER_TYPES = {
  TECH: '技术问题',
  RESOURCE: '资源问题',
  COMMUNICATION: '沟通问题'
}

// WebSocket 消息类型
export const WS_MSG = {
  // Client → Server
  JOIN: 'standup:join',
  LEAVE: 'standup:leave',
  START_SPEAK: 'standup:speak:start',
  SUBMIT_SPEECH: 'standup:speech:submit',
  SKIP_SPEAKER: 'standup:speaker:skip',
  REORDER: 'standup:order:reorder',
  TIMER_START: 'standup:timer:start',
  TIMER_PAUSE: 'standup:timer:pause',
  TIMER_RESET: 'standup:timer:reset',
  OVERTIME_CONFIRM: 'standup:overtime:confirm',
  END_STANDUP: 'standup:end',
  ASYNC_SUBMIT: 'standup:async:submit',

  // Server → Client
  STATE_SYNC: 'standup:state:sync',
  MEMBER_STATUS: 'standup:member:status',
  MEMBER_JOINED: 'standup:member:joined',
  MEMBER_LEFT: 'standup:member:left',
  SPEAKER_CHANGED: 'standup:speaker:changed',
  SPEAKER_SKIPPED: 'standup:speaker:skipped',
  SPEECH_SUBMITTED: 'standup:speech:submitted',
  ORDER_UPDATED: 'standup:order:updated',
  TIMER_SYNC: 'standup:timer:sync',
  TIMER_WARNING: 'standup:timer:warning',
  TIMER_OVERTIME: 'standup:timer:overtime',
  STANDUP_ENDED: 'standup:ended',
  STANDUP_CANCELLED: 'standup:cancelled',
  ASYNC_RECEIVED: 'standup:async:received',
  ASYNC_ALL_DONE: 'standup:async:all:done',
  ERROR: 'standup:error',

  // WebRTC signaling
  WEBRTC_OFFER:  'standup:webrtc:offer',
  WEBRTC_ANSWER: 'standup:webrtc:answer',
  WEBRTC_ICE:    'standup:webrtc:ice',
  WEBRTC_JOIN:   'standup:webrtc:join',
  WEBRTC_LEAVE:  'standup:webrtc:leave',
  WEBRTC_SPEAK:  'standup:webrtc:speak',

  // Team-level real-time events (server → client broadcasts)
  TEAM_UPDATED:        'team:updated',
  TEAM_MEMBER_JOINED:  'team:member:joined',
  TEAM_MEMBER_REMOVED: 'team:member:removed',
  TEAM_MEMBER_ROLE:    'team:member:role-changed',
  TEAM_DISSOLVED:      'team:dissolved',
  STANDUP_CREATED:     'standup:created',
  STANDUP_LIST_CHANGED:'standup:list-changed',
  STANDUP_LIVE_STATE:  'standup:live-state',
  TODO_CREATED:        'todo:created',
  TODO_UPDATED:        'todo:updated',
  TODO_DELETED:        'todo:deleted'
}
