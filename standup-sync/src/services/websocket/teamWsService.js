// ========================================================
// Team-level WebSocket Service
// Connects to /ws/team/{teamId} for real-time data sync
// across all team members (different browsers/devices)
// ========================================================

class TeamWsService {
  constructor() {
    this.socket = null
    this._handlers = new Map()
    this._reconnectTimer = null
    this._reconnectAttempts = 0
    this._maxReconnect = 5
    this._isManualClose = false
    this._teamId = null
  }

  connect(teamId) {
    if (this.socket && this._teamId === teamId && this.isConnected) return
    this.disconnect()
    this._isManualClose = false
    this._teamId = teamId
    this._reconnectAttempts = 0

    const wsUrl = `ws://localhost:8088/ws/team/${teamId}`
    this.socket = new WebSocket(wsUrl)

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const callbacks = this._handlers.get(msg.type) || []
        callbacks.forEach(cb => cb(msg.payload, msg.type))
      } catch { /* ignore malformed */ }
    }

    this.socket.onclose = () => {
      if (!this._isManualClose && this._reconnectAttempts < this._maxReconnect) {
        this._scheduleReconnect()
      }
    }
  }

  disconnect() {
    this._isManualClose = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this._teamId = null
  }

  get isConnected() {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN
  }

  send(type, payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }))
    }
  }

  on(type, callback) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, [])
    }
    this._handlers.get(type).push(callback)
    return () => {
      const handlers = this._handlers.get(type)
      if (handlers) {
        const idx = handlers.indexOf(callback)
        if (idx > -1) handlers.splice(idx, 1)
      }
    }
  }

  _scheduleReconnect() {
    this._reconnectAttempts++
    const delay = Math.min(2000 * Math.pow(2, this._reconnectAttempts - 1), 30000)
    this._reconnectTimer = setTimeout(() => {
      if (this._teamId) this.connect(this._teamId)
    }, delay)
  }
}

export const teamWsService = new TeamWsService()
