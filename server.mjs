import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword, verifyPassword, getRoomByRoomnum, insertData, updateDataByRoomnum, getRoomDataByRoomnum, passwordCheck } from './utils.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

console.log("Initialised")
const rooms = { }

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inspiradraw-landing.html'))
})

app.post('/room', async (req, res) => {
  const { room, password } = req.body || {}
  if (!room || typeof room !== 'string') {
    return res.status(400).json({ error: 'Invalid room id' })
  }

  // Check persistent store first
  try {
    const existing = await getRoomByRoomnum(room).catch(() => null)
    if (existing) {
      return res.status(400).json({ error: 'Room already exists' })
    }
  } catch (err) {
    // fallthrough
  }

  if (rooms[room] != null) {
    return res.status(400).json({ error: 'Room already exists' })
  }

  // Persist password if provided
  if (password) {
    try {
      await insertData(password, room)
    } catch (err) {
      console.error('Failed to persist room:', err)
      return res.status(500).json({ error: 'Failed to create room' })
    }
  }

  // Hash password for in-memory storage (use utils.hashPassword for consistency)
  let hashedPassword = null
  if (password) {
    try {
      hashedPassword = await hashPassword(password)
    } catch (err) {
      console.error('Failed to hash password:', err)
      return res.status(500).json({ error: 'Failed to create room' })
    }
  }

  rooms[room] = { 
    users: {},
    password: hashedPassword,
    created: Date.now()
  }

  // Send message that new room was created
  io.emit('room-created', room)
  res.json({ success: true, room })
})

app.get('/room/:roomId', async (req, res) => {
  const roomId = req.params.roomId
  const pw = req.query.pw || null

  // Check persistent store first
  const record = await getRoomByRoomnum(roomId).catch(() => null)

  if (record) {
    // If the record has a password, require `pw` query param and validate
    if (record.password) {
      if (!pw) return res.redirect('/?error=auth')
      const valid = await passwordCheck(roomId, pw).catch(() => false)
      if (!valid) return res.redirect('/?error=auth')
    }
    // Ensure in-memory room exists for runtime
    if (!rooms[roomId]) {
      rooms[roomId] = { users: {}, password: record.password || null, created: Date.now() };

    }
    return res.sendFile(path.join(__dirname, 'public', 'inspirashare-app.html'))
  }

  // If not in persistent store, check in-memory rooms
  const memRoom = rooms[roomId]
  if (memRoom) {
    if (memRoom.password) {
      if (!pw) return res.redirect('/?error=auth')
      const valid = await verifyPassword(memRoom.password, pw).catch(() => false)
      if (!valid) return res.redirect('/?error=auth')
    }
    return res.sendFile(path.join(__dirname, 'public', 'inspirashare-app.html'))
  }

  // Room doesn't exist
  return res.redirect('/')
})

// API endpoint to check if room exists and validate password
app.post('/verify', async (req, res) => {
  const { roomId, password } = req.body || {}
  if (!roomId || typeof roomId !== 'string') return res.status(400).json({ error: 'Invalid request' })

  const record = await getRoomByRoomnum(roomId).catch(() => null)
  if (record) {
    if (record.password) {
      const valid = await passwordCheck(roomId, password).catch(() => false)
      return res.json({ exists: true, validPassword: !!valid })
    }
    return res.json({ exists: true, validPassword: true })
  }

  // fallback to in-memory
  const mem = rooms[roomId]
  if (!mem) return res.json({ exists: false })
  if (mem.password) {
    // In-memory password is hashed; use verifyPassword
    const valid = await verifyPassword(mem.password, password).catch(() => false)
    return res.json({ exists: true, validPassword: !!valid })
  }
  return res.json({ exists: true, validPassword: true })
})

// Cleanup inactive rooms every hour
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000
  Object.entries(rooms).forEach(([roomId, room]) => {
    if (room.created < oneHourAgo && Object.keys(room.users).length === 0) {
      delete rooms[roomId]
    }
  })
}, 3600000)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

// Handle 404
app.use((req, res) => {
  res.redirect('/')
})

io.on('connection', socket => {
  // auth handler: client must call this with { room, password, name }
  socket.on('auth', async ({ room, password, name }) => {
    try {
      if (!room) {
        socket.emit('auth-failed', 'invalid-room');
        return;
      }

      const record = await getRoomByRoomnum(room).catch(() => null);
      if (record) {
        if (record.password) {
          const valid = await passwordCheck(room, password).catch(() => false);
          if (!valid) {
            socket.emit('auth-failed', 'bad-password');
            return;
          }
        }
        if (!rooms[room]) {
          rooms[room] = { users: {}, password: record.password ? true : null, created: Date.now() };
        }
      } else {
        // fallback to in-memory
        const mem = rooms[room];
        if (!mem) {
          socket.emit('auth-failed', 'not-found');
          return;
        }
        // In-memory password is now hashed; use verifyPassword
        if (mem.password) {
          const valid = await verifyPassword(mem.password, password).catch(() => false);
          if (!valid) {
            socket.emit('auth-failed', 'bad-password');
            return;
          }
        }
      }

      // Passed checks: join
      socket.join(room);
      rooms[room].users[socket.id] = { name: name || 'Player', color: '#5eb3d6', isDrawing: false };
      // send success with current users
      socket.emit('auth-success', { users: Object.values(rooms[room].users) });
      socket.to(room).emit('user-connected', { name: name || 'Player', users: Object.values(rooms[room].users) });
    } catch (err) {
      console.error('Auth error', err);
      socket.emit('auth-failed', 'error');
    }
  });
  socket.on('new-user', (room, name) => {
    if (!rooms[room]) {
      socket.emit('room-not-found')
      return
    }
    socket.join(room)
    rooms[room].users[socket.id] = {
      name: name,
      color: '#5eb3d6', // Default color
      isDrawing: false
    }
    io.to(room).emit('user-connected', { name: name, users: Object.values(rooms[room].users) })
  })

  socket.on('send-chat-message', (room, message) => {
    if (!rooms[room]?.users[socket.id]) return
    io.to(room).emit('chat-message', { 
      message: message, 
      name: rooms[room].users[socket.id].name,
      timestamp: Date.now()
    })
  })

  socket.on('draw-start', (room, x, y, color) => {
    if (!rooms[room]?.users[socket.id]) return
    rooms[room].users[socket.id].isDrawing = true
    rooms[room].users[socket.id].color = color
    socket.to(room).emit('user-draw-start', { x, y, color, userId: socket.id })
  })

  socket.on('draw-move', (room, x, y) => {
    if (!rooms[room]?.users[socket.id]?.isDrawing) return
    socket.to(room).emit('user-draw-move', { x, y, userId: socket.id })
  })

  socket.on('draw-end', (room) => {
    if (!rooms[room]?.users[socket.id]) return
    rooms[room].users[socket.id].isDrawing = false
    socket.to(room).emit('user-draw-end', { userId: socket.id })
  })

  socket.on('add-sticky-note', (room, note) => {
    if (!rooms[room]?.users[socket.id]) return
    socket.to(room).emit('sticky-note-added', {
      ...note,
      author: rooms[room].users[socket.id].name
    })
  })

  socket.on('disconnect', () => {
    getUserRooms(socket).forEach(room => {
      const user = rooms[room].users[socket.id]
      io.to(room).emit('user-disconnected', { 
        name: user.name, 
        userId: socket.id 
      })
      delete rooms[room].users[socket.id]
      
      // Clean up empty rooms
      if (Object.keys(rooms[room].users).length === 0) {
        delete rooms[room]
      }
    })
  })
})

function getUserRooms(socket) {
  return Object.entries(rooms).reduce((names, [name, room]) => {
    if (room.users[socket.id] != null) names.push(name)
    return names
  }, [])
}
const PORT = process.env.PORT || 8000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})