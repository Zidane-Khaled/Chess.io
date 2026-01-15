const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev simplicity
        methods: ["GET", "POST"]
    }
});

let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_game', () => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            // Find opponent
            const opponent = waitingPlayer;
            waitingPlayer = null;

            const roomId = `room_${opponent.id}_${socket.id}`;
            socket.join(roomId);
            opponent.join(roomId);

            // Assign roles/colors
            io.to(opponent.id).emit('game_start', {
                roomId,
                playerId: opponent.id,
                opponentId: socket.id,
                x: 100,
                y: 100,
                color: '#3498db' // Blue
            });

            io.to(socket.id).emit('game_start', {
                roomId,
                playerId: socket.id,
                opponentId: opponent.id,
                x: 600,
                y: 500,
                color: '#e74c3c' // Red
            });

            console.log(`Game started in ${roomId}`);
        } else {
            waitingPlayer = socket;
            socket.emit('waiting');
            console.log('Player waiting:', socket.id);
        }
    });

    socket.on('player_update', (data) => {
        // Relay to everyone in the room except sender
        socket.to(data.roomId).emit('player_update', {
            id: socket.id,
            ...data
        });
    });

    socket.on('shoot', (data) => {
        socket.to(data.roomId).emit('shoot', {
            id: socket.id,
            ...data
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        // Notify opponent if in game (simple broadcast for now, ideally track rooms)
        // For this simple version, we rely on the client stopping updates or manual handling
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
