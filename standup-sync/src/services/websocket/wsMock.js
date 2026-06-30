// Mock WebSocket that simulates multi-user real-time behavior
// All instances with the same standupId share messages

const rooms = new Map() // standupId -> Set<MockWebSocket>

const READY_STATES = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }

export class MockWebSocket {
  constructor(standupId, userId) {
    this.standupId = standupId
    this.userId = userId
    this.readyState = READY_STATES.OPEN
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    this._listeners = {}
    this._closed = false

    if (!rooms.has(standupId)) {
      rooms.set(standupId, new Set())
    }
    rooms.get(standupId).add(this)

    // Simulate async connection
    setTimeout(() => {
      if (this.onopen) this.onopen({ type: 'open' })
    }, 50)
  }

  send(data) {
    if (this._closed) return
    const parsed = JSON.parse(data)
    const msg = {
      type: parsed.type,
      payload: parsed.payload,
      senderId: this.userId,
      timestamp: Date.now()
    }
    // Broadcast to all sockets in the same room, except sender
    const room = rooms.get(this.standupId)
    if (room) {
      room.forEach(socket => {
        if (socket !== this && !socket._closed) {
          socket._receive(msg)
        }
      })
    }
    // Also deliver to self for state sync messages
    this._receive(msg)
  }

  _receive(msg) {
    if (this.onmessage) {
      setTimeout(() => {
        this.onmessage({ data: JSON.stringify(msg) })
      }, 30 + Math.random() * 50) // small jitter for realism
    }
  }

  close() {
    this._closed = true
    this.readyState = READY_STATES.CLOSED
    const room = rooms.get(this.standupId)
    if (room) {
      room.delete(this)
      if (room.size === 0) rooms.delete(this.standupId)
    }
    if (this.onclose) {
      setTimeout(() => this.onclose({ type: 'close' }), 10)
    }
  }

  static broadcast(standupId, msg) {
    const room = rooms.get(standupId)
    if (room) {
      room.forEach(socket => {
        if (!socket._closed) socket._receive(msg)
      })
    }
  }

  static getRoomSize(standupId) {
    const room = rooms.get(standupId)
    return room ? room.size : 0
  }
}
