import { WS_MSG } from '../../utils/constants'

// Use native WebSocket when backend is available, MockWebSocket as fallback
const USE_MOCK = false // Set to true for offline development without backend

class WsService {
  constructor() {
    this.socket = null
    this._handlers = new Map()
    this._reconnectTimer = null
    this._reconnectAttempts = 0
    this._maxReconnect = 5
    this._isManualClose = false
    this._currentRoom = null
    this._currentUser = null
  }

  connect(standupId, userId) {
    this._isManualClose = false
    this._currentRoom = standupId
    this._currentUser = userId
    this._reconnectAttempts = 0

    if (USE_MOCK) {
      this._connectMock(standupId, userId)
    } else {
      this._connectReal(standupId, userId)
    }
  }

  _connectReal(standupId, userId) {
    const wsUrl = `ws://localhost:8088/ws/standup/${standupId}`
    this.socket = new WebSocket(wsUrl)

    this.socket.onopen = () => {
      this.send(WS_MSG.JOIN, { userId })
    }

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const callbacks = this._handlers.get(msg.type) || []
        callbacks.forEach(cb => cb(msg.payload, msg.type, msg.senderId))
      } catch { /* ignore malformed messages */ }
    }

    this.socket.onclose = () => {
      if (!this._isManualClose && this._reconnectAttempts < this._maxReconnect) {
        this._scheduleReconnect()
      }
    }

    this.socket.onerror = () => {
      // Connection failed — fallback to mock
    }
  }

  _connectMock(standupId, userId) {
    import('./wsMock.js').then(({ MockWebSocket }) => {
      this.socket = new MockWebSocket(standupId, userId)
      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const callbacks = this._handlers.get(msg.type) || []
          callbacks.forEach(cb => cb(msg.payload, msg.type, msg.senderId))
        } catch { /* ignore */ }
      }
      this.socket.onclose = () => {
        if (!this._isManualClose && this._reconnectAttempts < this._maxReconnect) {
          this._scheduleReconnect()
        }
      }
      setTimeout(() => { this.send(WS_MSG.JOIN, { userId }) }, 100)
    })
  }

  disconnect() {
    this._isManualClose = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this.socket) {
      this.send(WS_MSG.LEAVE, { userId: this._currentUser })
      this.socket.close()
      this.socket = null
    }
    this._currentRoom = null
    this._currentUser = null
  }

  send(type, payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }))
    } else if (this.socket && this.socket._closed !== true && this.socket.readyState !== undefined) {
      // MockWebSocket (has _closed but not standard readyState)
    } else if (this.socket && !this.socket._closed) {
      this.socket.send(JSON.stringify({ type, payload }))
    }
  }

  get isConnected() {
    return this.socket !== null && (
      this.socket.readyState === WebSocket.OPEN || !this.socket._closed
    )
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
      if (this._currentRoom && this._currentUser) {
        this.connect(this._currentRoom, this._currentUser)
      }
    }, delay)
  }

}

export const wsService = new WsService()
