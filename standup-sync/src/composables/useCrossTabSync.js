// ========================================================
// Cross-tab Data Sync via BroadcastChannel
// One tab mutates → broadcasts → other tabs re-fetch/sync
// ========================================================

const CHANNEL_NAME = 'standup-sync'

let channel = null
const handlers = new Map()

function getChannel() {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event) => {
      const { store, action, payload } = event.data || {}
      const handler = handlers.get(store)
      if (handler) {
        handler(action, payload)
      }
    }
  }
  return channel
}

export function useCrossTabSync() {
  getChannel()

  function register(storeName, handler) {
    handlers.set(storeName, handler)
  }

  function unregister(storeName) {
    handlers.delete(storeName)
  }

  function broadcast(storeName, action, payload = {}) {
    try {
      channel.postMessage({ store: storeName, action, payload, ts: Date.now() })
    } catch { /* ignore closed channel */ }
  }

  // Ignore own broadcasts — when a store broadcasts, it already applied the change locally.
  // The handler only needs to react to messages from OTHER tabs.
  // Since BroadcastChannel doesn't deliver to the sender, this is automatic.

  return { register, unregister, broadcast }
}
