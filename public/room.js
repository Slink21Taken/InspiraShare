// room.js
// Handles: socket.io auth, chat, user list, room URL parsing, share/join helpers.
// Exposes: initRoom(), sendMessage(), addChatMessage(), updateUserList()
// Dispatches: window event "room:ready" with { socket, roomId }

let socket = null;
let roomId = null;
let connecting = false;

// Parse path and query for room and password
function resolveRoomFromUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(window.location.search);
  const pw = query.get('pw') || null;

  if (parts[0] === 'room' && parts[1]) {
    roomId = decodeURIComponent(parts[1]);
  }
  return { roomId, pw };
}

function getDisplayName() {
  const stored = localStorage.getItem('inspire_name');
  if (stored) return stored;
  const name = `Player_${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;
  localStorage.setItem('inspire_name', name);
  return name;
}

export function initRoom() {
  const { roomId: id, pw } = resolveRoomFromUrl();
  if (!id) return; // Not in a room page
  roomId = id;

  if (connecting) return;
  connecting = true;

  // Configure socket.io client (global script /socket.io/socket.io.js must be included)
  socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 500,
    timeout: 20000
  });

  const name = getDisplayName();

  // Attempt auth once connected
  socket.on('connect', () => {
    socket.emit('auth', { room: roomId, password: pw, name });
  });

  socket.on('auth-success', (data) => {
    addChatMessage('System', `Connected to ${roomId}`);
    updateUserList(data.users || []);
    // Inform other modules that room is ready
    window.dispatchEvent(new CustomEvent('room:ready', { detail: { socket, roomId } }));
  });

  socket.on('auth-failed', (reason) => {
    // reason can be: invalid-room, bad-password, not-found, error
    const msg = (reason === 'bad-password')
      ? 'Incorrect password.'
      : (reason === 'not-found')
      ? 'Room not found.'
      : 'Authentication failed.';
    alert(`${msg} Redirecting to landing page.`);
    window.location.href = '/';
  });

  // Presence
  socket.on('user-connected', (data) => {
    addChatMessage('System', `${data.name} joined`);
    updateUserList(data.users || []);
  });

  socket.on('user-disconnected', (data) => {
    if (data?.name) addChatMessage('System', `${data.name} disconnected`);
  });

  // Chat
  socket.on('chat-message', (msg) => {
    addChatMessage(msg.name || 'Player', msg.message || '');
  });

  // Drawing relay (forwarded to drawing.js listeners via window events)
  socket.on('user-draw-start', (payload) => {
    window.dispatchEvent(new CustomEvent('draw:remote-start', { detail: payload }));
  });
  socket.on('user-draw-move', (payload) => {
    window.dispatchEvent(new CustomEvent('draw:remote-move', { detail: payload }));
  });
  socket.on('user-draw-end', (payload) => {
    window.dispatchEvent(new CustomEvent('draw:remote-end', { detail: payload }));
  });

  // Sticky notes
  socket.on('sticky-note-added', (note) => {
    window.dispatchEvent(new CustomEvent('sticky:remote-added', { detail: note }));
  });

  // Connection lifecycle
  socket.on('reconnect_attempt', (attempt) => {
    // Optionally show a subtle UI hint
    // console.debug('Reconnecting...', attempt);
  });
  socket.on('reconnect', () => {
    // Re-auth on successful reconnect
    socket.emit('auth', { room: roomId, password: pw, name });
  });
  socket.on('disconnect', (reason) => {
    addChatMessage('System', `Disconnected: ${reason}`);
  });
  socket.on('connect_error', (err) => {
    console.error('Socket connect error:', err.message);
  });

  // Bind chat input Enter handling
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  connecting = false;
}

// Chat UI helpers
export function addChatMessage(username, text) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  messageDiv.innerHTML = `
    <span class="chat-username">${username}:</span>
    <span class="chat-text">${text}</span>
  `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function sendMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;

  addChatMessage(localStorage.getItem('inspire_name') || 'You', message);
  if (socket && roomId) {
    socket.emit('send-chat-message', roomId, message);
  }
  input.value = '';
}

export function updateUserList(users) {
  const userList = document.getElementById('userList');
  if (!userList) return;
  userList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.className = 'user-item';
    li.innerHTML = `<div class="user-indicator"></div>${u.name || 'Player'}`;
    userList.appendChild(li);
  });
}

// Optional helpers that were in your canvas file but belong to room controls
export function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const pick = (src, n) => Array.from({ length: n }, () => src[Math.floor(Math.random() * src.length)]).join('');
  const id = `${pick(chars, 4)}-${pick(chars, 4)}-${pick(digits, 4)}`;
  const el = document.getElementById('roomIdInput');
  if (el) el.value = id;
}

export function shareRoom() {
  const el = document.getElementById('roomIdInput');
  const id = el ? el.value : roomId || '[Room ID]';
  const shareText = `Join my InspiraShare room!
Room ID: ${id}
Password: [Your Password]`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareText).then(() => {
      addChatMessage('System', 'Room details copied to clipboard!');
    });
  } else {
    alert(shareText);
  }
}

export function joinRoom() {
  const pwEl = document.getElementById('passwordInput');
  const idEl = document.getElementById('roomIdInput');
  const pw = pwEl ? pwEl.value : '';
  const id = idEl ? idEl.value : '';
  if (pw && id) {
    addChatMessage('System', `Joined room: ${id} (Demo mode)`);
  } else {
    addChatMessage('System', 'Please enter both room ID and password!');
  }
}

// Convenience exports for other modules (if needed)
export function getSocket() { return socket; }
export function getRoomId() { return roomId; }
