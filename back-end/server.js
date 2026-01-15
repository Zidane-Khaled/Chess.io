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

const MAX_HP = 100;
const DAMAGE = 20;
const CANVAS_WIDTH = 800; // Assuming standard canvas size for server validation bounds
const CANVAS_HEIGHT = 600;

// Game state storage: { [roomId]: { players: { [id]: { x, y, angle, hp, kills, color } } } }
const games = {};

let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_game', () => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const opponent = waitingPlayer;
            waitingPlayer = null;

            const roomId = `room_${opponent.id}_${socket.id}`;
            socket.join(roomId);
            opponent.join(roomId);

            // Initialize game state
            games[roomId] = {
                players: {
                    [opponent.id]: { id: opponent.id, x: 100, y: 100, angle: 0, color: '#3498db', hp: MAX_HP, kills: 0 },
                    [socket.id]: { id: socket.id, x: 600, y: 500, angle: Math.PI, color: '#e74c3c', hp: MAX_HP, kills: 0 }
                }
            };

            // Send initial state to players
            io.to(opponent.id).emit('game_start', {
                roomId,
                playerId: opponent.id,
                opponentId: socket.id,
                ...games[roomId].players[opponent.id]
            });

            io.to(socket.id).emit('game_start', {
                roomId,
                playerId: socket.id,
                opponentId: opponent.id,
                ...games[roomId].players[socket.id]
            });

            console.log(`Game started in ${roomId}`);
        } else {
            waitingPlayer = socket;
            socket.emit('waiting');
            console.log('Player waiting:', socket.id);
        }
    });

    socket.on('player_update', (data) => {
        const game = games[data.roomId];
        if (game && game.players[socket.id]) {
            // Update server state
            const p = game.players[socket.id];
            p.x = data.x;
            p.y = data.y;
            p.angle = data.angle;

            // Relay to opponent
            socket.to(data.roomId).emit('player_update', {
                id: socket.id,
                x: p.x,
                y: p.y,
                angle: p.angle,
                hp: p.hp,
                kills: p.kills
            });
        }
    });

    socket.on('attack', (data) => {
        const game = games[data.roomId];
        if (!game) return;

        const attacker = game.players[socket.id];
        if (!attacker) return;

        // Visual effect for everyone
        io.in(data.roomId).emit('attack_effect', {
            x: attacker.x,
            y: attacker.y,
            angle: attacker.angle,
            color: attacker.color
        });

        // Hit detection
        const ATTACK_RANGE = 100;
        const ATTACK_ANGLE = Math.PI / 4; // 45 degrees spread

        Object.values(game.players).forEach(target => {
            if (target.id === socket.id) return; // Don't hit self

            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= ATTACK_RANGE) {
                const angleToTarget = Math.atan2(dy, dx);
                let angleDiff = angleToTarget - attacker.angle;

                // Normalize angle to -PI to PI
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                if (Math.abs(angleDiff) < ATTACK_ANGLE / 2) {
                    // Hit confirmed
                    target.hp -= DAMAGE;

                    if (target.hp <= 0) {
                        // Kill logic
                        attacker.kills += 1;
                        target.hp = MAX_HP;
                        target.kills = 0; // Reset victim kill count

                        // Respawn logic with collision avoidance
                        let safe = false;
                        let attempts = 0;
                        while (!safe && attempts < 10) {
                            target.x = 50 + Math.random() * (CANVAS_WIDTH - 100);
                            target.y = 50 + Math.random() * (CANVAS_HEIGHT - 100);

                            // Simple collision check against other player
                            const other = Object.values(game.players).find(p => p.id !== target.id);
                            const d = Math.sqrt((target.x - other.x) ** 2 + (target.y - other.y) ** 2);
                            if (d > 100) safe = true; // Ensure 100px buffer
                            attempts++;
                        }

                        // Broadcast events
                        io.in(data.roomId).emit('player_respawn', {
                            id: target.id,
                            x: target.x,
                            y: target.y,
                            hp: target.hp,
                            kills: target.kills // Broadcast reset kills
                        });

                        // Notify killer of their new kill count
                        io.in(data.roomId).emit('score_update', {
                            id: attacker.id,
                            kills: attacker.kills
                        });

                    } else {
                        io.in(data.roomId).emit('health_update', {
                            id: target.id,
                            hp: target.hp
                        });
                    }
                }
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        // Cleanup game state if needed, though for now we just leave it
        // Ideally we delete games[room] when empty
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
