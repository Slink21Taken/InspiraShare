// room.js
// Handles socket.io auth, chat, user list, and dispatches events for drawing/sticky notes.

let socket = null;
let roomId = null;

// Parse path for room id
function resolveRoomFromUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) {
    return { roomId: decodeURIComponent(parts[1]) };
  }
  return { roomId: null };
}

function getDisplayName() {
  const stored = localStorage.getItem('inspire_name');
  if (stored) return stored;
  const name = `Player_${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;
  localStorage.setItem('inspire_name', name);
  return name;
}

function initRoom() {
  const { roomId: id } = resolveRoomFromUrl();
  if (!id) return;
  roomId = id;

  // Configure socket.io client
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
    socket.emit('auth', { room: roomId, name });
  });

  socket.on('auth-success', (data) => {
    addChatMessage('System', `Connected to ${roomId}`);
    updateUserList(data.users || []);
    window.dispatchEvent(new CustomEvent('room:ready', { detail: { socket, roomId } }));
  });

  socket.on('auth-failed', (reason) => {
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
    updateUserList(data.users || []);
  });

  // Chat
  socket.on('chat-message', (msg) => {
    addChatMessage(msg.name || 'Player', msg.message || '');
  });

  // Drawing relay
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

  socket.on('disconnect', (reason) => {
  addChatMessage('System', `Disconnected: ${reason}`);
  updateUserList([]); // clear UI list
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
}

// Chat UI helpers
function addChatMessage(username, text) {
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

function sendMessage() {
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

function updateUserList(users) {
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

// Exports
window.initRoom = initRoom;
window.addChatMessage = addChatMessage;
window.sendMessage = sendMessage;
window.updateUserList = updateUserList;
