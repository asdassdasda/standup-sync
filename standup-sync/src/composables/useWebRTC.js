// ========================================================
// WebRTC Voice Call Composable
// Free STUN: Google stun.l.google.com:19302
// Signaling: via existing WebSocket (wsService)
// ========================================================
import { ref, reactive, onUnmounted } from 'vue'
import { wsService } from '../services/websocket/wsService'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

const SIG = {
  OFFER:  'standup:webrtc:offer',
  ANSWER: 'standup:webrtc:answer',
  ICE:    'standup:webrtc:ice',
  JOIN:   'standup:webrtc:join',
  LEAVE:  'standup:webrtc:leave',
  SPEAK:  'standup:webrtc:speak'
}

export function useWebRTC() {
  const callStatus = ref('idle')
  const isMuted = ref(false)
  const localStream = ref(null)
  const remoteStreams = reactive({})
  const connectedPeers = ref(0)
  const errorMsg = ref('')

  let peerConnections = {}
  let myUserId = null
  let roomId = null
  let _unsubscribers = []

  function _log(msg) { console.log('[WebRTC]', msg) }
  function _err(msg) { console.error('[WebRTC]', msg); errorMsg.value = msg }

  // --- joinCall ---
  async function joinCall(standupId, userId) {
    if (callStatus.value !== 'idle') return false
    if (!wsService.isConnected) {
      _err('请先开启站会（需要WebSocket连接）')
      return false
    }

    callStatus.value = 'connecting'
    myUserId = String(userId)
    roomId = standupId
    _log(`Joining call room=${roomId} user=${myUserId}`)

    // 1. Get microphone
    try {
      localStream.value = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      _log('Microphone acquired')
    } catch (e) {
      _err('无法访问麦克风: ' + (e.message || '请检查权限'))
      callStatus.value = 'idle'
      return false
    }

    // 2. Register signaling handlers BEFORE sending JOIN (to catch responses)
    _unsubscribers.forEach(fn => fn())
    _unsubscribers = [
      wsService.on(SIG.OFFER, _handleOffer),
      wsService.on(SIG.ANSWER, _handleAnswer),
      wsService.on(SIG.ICE, _handleICE),
      wsService.on(SIG.JOIN, _handlePeerJoin),
      wsService.on(SIG.LEAVE, _handlePeerLeave),
      wsService.on(SIG.SPEAK, _handlePeerSpeak)
    ]

    // 3. Notify room — other peers will send us offers
    wsService.send(SIG.JOIN, { userId: myUserId })
    _log('JOIN sent, waiting for peers...')

    callStatus.value = 'in-call'
    return true
  }

  // --- leaveCall ---
  function leaveCall() {
    if (callStatus.value === 'idle') return  // Already left, don't double-cleanup
    wsService.send(SIG.LEAVE, { userId: myUserId })
    Object.values(peerConnections).forEach(pc => { try { pc.close() } catch {} })
    peerConnections = {}
    if (localStream.value) {
      localStream.value.getTracks().forEach(t => t.stop())
      localStream.value = null
    }
    _unsubscribers.forEach(fn => fn())
    _unsubscribers = []
    // Remove all remote audio elements
    Object.keys(remoteStreams).forEach(k => {
      const el = document.getElementById(`remote-audio-${k}`)
      if (el) el.remove()
      delete remoteStreams[k]
    })
    callStatus.value = 'idle'
    connectedPeers.value = 0
    _log('Left call')
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
    if (localStream.value) {
      localStream.value.getAudioTracks().forEach(t => { t.enabled = !isMuted.value })
    }
  }

  // --- Signaling handlers ---
  async function _handlePeerJoin(payload) {
    const peerId = String(payload.userId)
    if (peerId === myUserId) return
    if (peerConnections[peerId]) return
    _log(`Peer joined: ${peerId}, creating offer...`)
    try {
      await _createPeerConnection(peerId)
      const offer = await peerConnections[peerId].createOffer()
      await peerConnections[peerId].setLocalDescription(offer)
      wsService.send(SIG.OFFER, { sdp: offer, toUserId: peerId, fromUserId: myUserId })
      _log(`Offer sent to ${peerId}`)
    } catch (e) {
      _err('Offer failed: ' + e.message)
    }
  }

  async function _handleOffer(payload) {
    const peerId = String(payload.fromUserId)
    if (peerId === myUserId) return
    _log(`Offer from ${peerId}`)
    try {
      if (!peerConnections[peerId]) await _createPeerConnection(peerId)
      await peerConnections[peerId].setRemoteDescription(new RTCSessionDescription(payload.sdp))
      const answer = await peerConnections[peerId].createAnswer()
      await peerConnections[peerId].setLocalDescription(answer)
      wsService.send(SIG.ANSWER, { sdp: answer, toUserId: peerId, fromUserId: myUserId })
      _log(`Answer sent to ${peerId}`)
    } catch (e) {
      _err('Answer failed: ' + e.message)
    }
  }

  async function _handleAnswer(payload) {
    const peerId = String(payload.fromUserId)
    if (peerId === myUserId || !peerConnections[peerId]) return
    _log(`Answer from ${peerId}`)
    try {
      await peerConnections[peerId].setRemoteDescription(new RTCSessionDescription(payload.sdp))
    } catch (e) {
      _err('Set remote failed: ' + e.message)
    }
  }

  async function _handleICE(payload) {
    const peerId = String(payload.fromUserId)
    if (peerId === myUserId || !peerConnections[peerId]) return
    try {
      await peerConnections[peerId].addIceCandidate(new RTCIceCandidate(payload.candidate))
    } catch (e) { /* ignore invalid ICE */ }
  }

  function _handlePeerLeave(payload) {
    const peerId = String(payload.userId)
    if (peerConnections[peerId]) {
      peerConnections[peerId].close()
      delete peerConnections[peerId]
    }
    delete remoteStreams[peerId]
    const el = document.getElementById(`remote-audio-${peerId}`)
    if (el) el.remove()
    connectedPeers.value = Object.values(peerConnections).filter(p => p.connectionState === 'connected').length
    _log(`Peer left: ${peerId}`)
  }

  function _handlePeerSpeak() { /* UI indicator */ }

  // --- PC factory ---
  async function _createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    _log(`PC created for ${peerId}`)

    if (localStream.value) {
      localStream.value.getTracks().forEach(track => pc.addTrack(track, localStream.value))
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsService.send(SIG.ICE, { candidate: event.candidate, toUserId: peerId, fromUserId: myUserId })
      }
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0]
        remoteStreams[peerId] = stream
        _log(`Remote stream from ${peerId}, creating audio...`)

        // Create and play audio element imperatively
        const existingAudio = document.getElementById(`remote-audio-${peerId}`)
        if (existingAudio) existingAudio.remove()

        const audio = document.createElement('audio')
        audio.id = `remote-audio-${peerId}`
        audio.srcObject = stream
        audio.autoplay = true
        audio.playsinline = true
        audio.controls = false
        document.body.appendChild(audio)

        // Force play (handle autoplay policy)
        audio.play().then(() => {
          _log(`Audio playing from ${peerId}`)
        }).catch(e => {
          _log(`Audio play failed (autoplay policy): ${e.message}`)
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      _log(`ICE ${peerId}: ${pc.iceConnectionState}`)
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        connectedPeers.value = Object.values(peerConnections).filter(p =>
          p.iceConnectionState === 'connected' || p.iceConnectionState === 'completed'
        ).length
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        _log(`Connection to ${peerId} ${pc.connectionState}`)
      }
    }

    peerConnections[peerId] = pc
    return pc
  }

  onUnmounted(() => { if (callStatus.value !== 'idle') leaveCall() })

  return {
    callStatus, isMuted, localStream, remoteStreams, connectedPeers, errorMsg,
    joinCall, leaveCall, toggleMute
  }
}
