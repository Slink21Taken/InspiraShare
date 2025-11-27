import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { hashPassword, verifyPassword, getRoomByRoomnum, insertData, passwordCheck } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
const rooms = {};
const authTokens = {};
const TOKEN_TTL_MS = 15 * 60 * 1000;

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setAuthCookie(res, token) {
  res.cookie('room_token', token, {
    httpOnly: true,
    secure: false, //for localhost ofc
    sameSite: 'Strict',
    maxAge: TOKEN_TTL_MS
  });
}

function getUserRooms(socket) {
  return Object.entries(rooms).reduce((names, [name, room]) => {
    if (room.users[socket.id] != null) names.push(name);
    return names;
  }, []);
}
setInterval(() => {
  const now = Date.now();
  Object.entries(authTokens).forEach(([token, meta]) => {
    if (meta.expires < now) delete authTokens[token];
  });
}, 5 * 60 * 1000);


console.log("init db");

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inspiradraw-landing.html'));
});
app.post('/verify', async (req, res) => {
  const { roomId, password } = req.body || {};
  if (!roomId || !password) {
    return res.status(400).json({ error: 'Missing roomId or password' });
  }

  try {
    const record = await getRoomByRoomnum(roomId);

    if (record) {
      const valid = await passwordCheck(roomId, password);
      if (!valid) {
        return res.json({ exists: true, validPassword: false });
      }
      if (!rooms[roomId]) {
        rooms[roomId] = {
          users: {},
          password: record.password,
          created: Date.now(),
          recordId: record.id
        };
      }
    } else {
      const commit = await insertData(password, roomId);
      if (!commit) {
        return res.status(500).json({ error: 'Failed to create room' });
      }
      const hashed = await hashPassword(password);
      rooms[roomId] = {
        users: {},
        password: hashed,
        created: Date.now(),
        recordId: commit.id
      };
    }
    const token = makeToken();
    authTokens[token] = { roomId, expires: Date.now() + TOKEN_TTL_MS };
    setAuthCookie(res, token);

    return res.json({
      exists: true,
      validPassword: true,
      redirect: `/room/${encodeURIComponent(roomId)}`
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});
app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (!rooms[roomId]) return res.redirect('/?error=auth');
  res.sendFile(path.join(__dirname, 'public', 'inspirashare-app.html'));
});



//oh lord help me
io.on('connection', socket => {

  socket.on('auth', ({ room, name }) => {
    if (!room || !rooms[room]) {
      socket.emit('auth-failed', 'not-found');
      return;
    }
    socket.join(room);
    rooms[room].users[socket.id] = { 
      name: name || 'Player', 
      color: '#5eb3d6', 
      isDrawing: false 
    };
    
    socket.emit('auth-success', { users: Object.values(rooms[room].users) });
    socket.to(room).emit('user-connected', { name: name || 'Player', users: Object.values(rooms[room].users) });
  });

  socket.on('send-chat-message', (room, message) => {
    if (!rooms[room]?.users[socket.id]) return;
    io.to(room).emit('chat-message', { 
      message, 
      name: rooms[room].users[socket.id].name,
      timestamp: Date.now()
    });
  });

  socket.on('draw-start', (room, x, y, color) => {
    if (!rooms[room]?.users[socket.id]) return;
    rooms[room].users[socket.id].isDrawing = true;
    rooms[room].users[socket.id].color = color;
    socket.to(room).emit('user-draw-start', { x, y, color, userId: socket.id });
  });

  socket.on('draw-move', (room, x, y) => {
    if (!rooms[room]?.users[socket.id]?.isDrawing) return;
    socket.to(room).emit('user-draw-move', { x, y, userId: socket.id });
  });

  socket.on('draw-end', (room) => {
    if (!rooms[room]?.users[socket.id]) return;
    rooms[room].users[socket.id].isDrawing = false;
    socket.to(room).emit('user-draw-end', { userId: socket.id });
  });

  socket.on('add-sticky-note', (room, note) => {
    if (!rooms[room]?.users[socket.id]) return;
    socket.to(room).emit('sticky-note-added', {
      ...note,
      author: rooms[room].users[socket.id].name
    });
  });

  socket.on('disconnect', () => {
    getUserRooms(socket).forEach(room => {
      const user = rooms[room].users[socket.id];
      if (user) {
        io.to(room).emit('user-disconnected', { 
          name: user.name,
          userId: socket.id 
        });
        delete rooms[room].users[socket.id];
      }
      if (Object.keys(rooms[room].users).length === 0) {
        delete rooms[room];
      }
    });
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));