import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'SOLARIS server', timestamp: new Date().toISOString() });
});

app.get('/api/scenarios', (_req, res) => {
  res.json({
    scenarios: [
      { id: 'student-cubesat', name: 'Student CubeSat', objective: 'Earth observation' },
      { id: 'space-weather', name: 'Space Weather Sentinel', objective: 'Space weather' },
      { id: 'lunar-mapper', name: 'Lunar Ice Mapper', objective: 'Lunar science' },
    ],
  });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = (roomCode || 'SOLA').toUpperCase().slice(0, 4);
    socket.join(code);
    socket.data.playerName = playerName || 'Mission Planner';
    socket.emit('room-joined', { roomCode: code, playerName: socket.data.playerName });
    io.to(code).emit('room-update', {
      roomCode: code,
      players: Array.from(io.sockets.adapter.rooms.get(code)?.values() ?? []),
    });
  });

  socket.on('chat-message', ({ roomCode, message }) => {
    io.to((roomCode || 'SOLA').toUpperCase().slice(0, 4)).emit('chat-message', {
      sender: socket.data.playerName || 'Mission Planner',
      message,
    });
  });
});

const port = Number(process.env.PORT ?? 3001);
server.listen(port, '0.0.0.0', () => {
  console.log(`SOLARIS server running on http://localhost:${port}`);
});
