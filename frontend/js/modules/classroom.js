// Classroom Module - Handles PeerJS live class functionality

let peer = null;
let localStream = null;
let currentCall = null;
let isStreaming = false;

// Initialize PeerJS
export async function initPeer(peerId, role = 'student') {
  return new Promise((resolve, reject) => {
    peer = new Peer(peerId);
    
    peer.on('open', (id) => {
      console.log(`${role} peer ready:`, id);
      resolve(id);
    });
    
    peer.on('error', (err) => {
      console.error('Peer error:', err);
      reject(err);
    });
  });
}

// Start local stream (camera + mic)
export async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return localStream;
  } catch (error) {
    console.error('Camera error:', error);
    throw error;
  }
}

// Stop local stream
export function stopLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
}

// Instructor: Start broadcast
export async function startBroadcast(peerId) {
  if (!localStream) {
    await startLocalStream();
  }
  isStreaming = true;
  return { success: true, peerId };
}

// Student: Join broadcast
export async function joinBroadcast(instructorPeerId, onStream) {
  if (!peer) return;
  
  const call = peer.call(instructorPeerId, null); // Listen only, no video sent
  
  call.on('stream', (stream) => {
    if (onStream) onStream(stream);
  });
  
  currentCall = call;
  return call;
}

// Leave broadcast
export function leaveBroadcast() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  if (localStream) {
    stopLocalStream();
  }
  isStreaming = false;
}

// Toggle microphone
export function toggleMicrophone(enabled) {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }
}

// Toggle camera
export function toggleCamera(enabled) {
  if (localStream) {
    localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
  }
}

// Display local video in element
export function displayLocalVideo(elementId) {
  const video = document.getElementById(elementId);
  if (video && localStream) {
    video.srcObject = localStream;
    video.play().catch(e => console.log('Autoplay prevented:', e));
  }
}

// Display remote video in element
export function displayRemoteVideo(elementId, stream) {
  const video = document.getElementById(elementId);
  if (video && stream) {
    video.srcObject = stream;
    video.play().catch(e => console.log('Autoplay prevented:', e));
  }
}

// Check if streaming
export function isLive() {
  return isStreaming;
}