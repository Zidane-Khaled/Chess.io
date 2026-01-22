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
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Piece Configuration
const PIECE_CONFIG = {
    pawn: { hp: 100, dmg: 20, killsReq: 5, next: 'knight', ability: null },
    knight: { hp: 80, dmg: 25, killsReq: 6, next: 'bishop', ability: 'jump', abilityCd: 5000 },
    bishop: { hp: 100, dmg: 30, killsReq: 7, next: 'rook', ability: 'laser', abilityCd: 7000 },
    rook: { hp: 120, dmg: 35, killsReq: 8, next: 'queen', ability: 'dash', abilityCd: 10000 },
    queen: { hp: 160, dmg: 40, killsReq: 10, next: 'king', ability: 'multi', abilityCd: 15000 },
    king: { hp: 999, dmg: 999, killsReq: 999, next: null, ability: null }
};

// Game state storage
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

            // Initialize game state with Pawn stats
            const pawnStats = PIECE_CONFIG['pawn'];
            games[roomId] = {
                players: {
                    [opponent.id]: {
                        id: opponent.id,
                        x: 100, y: 100,
                        angle: 0,
                        color: '#3498db',
                        hp: pawnStats.hp,
                        maxHp: pawnStats.hp,
                        kills: 0,
                        piece: 'pawn',
                        abilityReady: true,
                        lastAbilityTime: 0,
                        invulnerableUntil: 0
                    },
                    [socket.id]: {
                        id: socket.id,
                        x: 600, y: 500,
                        angle: Math.PI,
                        color: '#e74c3c',
                        hp: pawnStats.hp,
                        maxHp: pawnStats.hp,
                        kills: 0,
                        piece: 'pawn',
                        abilityReady: true,
                        lastAbilityTime: 0,
                        invulnerableUntil: 0
                    }
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
        if (!game || !game.players[socket.id]) return;

        const p = game.players[socket.id];
        // Validate move
        p.x = data.x;
        p.y = data.y;
        p.angle = data.angle;

        // Broadcast to opponent with authoritative data
        socket.to(data.roomId).emit('player_update', {
            id: socket.id,
            x: p.x,
            y: p.y,
            angle: p.angle,
            hp: p.hp,
            maxHp: p.maxHp,
            kills: p.kills,
            piece: p.piece,
            lastAbilityTime: p.lastAbilityTime
        });
    });

    socket.on('ability', (data) => {
        const game = games[data.roomId];
        if (!game) return;
        const p = game.players[socket.id];
        if (!p) return;

        const config = PIECE_CONFIG[p.piece];
        if (!config.ability) return;

        const now = Date.now();
        if (now - p.lastAbilityTime < config.abilityCd) return; // Cooldown

        p.lastAbilityTime = now;

        switch (p.piece) {
            case 'knight': // Jump (Invulnerable)
                p.invulnerableUntil = now + 1500;
                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'jump', x: p.x, y: p.y });
                break;
            case 'bishop': // Laser
                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'laser', x: p.x, y: p.y, angle: p.angle });
                checkLinearHit(game, p, 40, 600, data.roomId);
                break;
            case 'rook': // Dash (Damage path)
                const dashDist = 300;
                p.x += Math.cos(p.angle) * dashDist;
                p.y += Math.sin(p.angle) * dashDist;
                // Clamp bounds
                p.x = Math.max(50, Math.min(CANVAS_WIDTH - 50, p.x));
                p.y = Math.max(50, Math.min(CANVAS_HEIGHT - 50, p.y));

                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'dash', x: p.x, y: p.y, angle: p.angle });
                io.in(data.roomId).emit('player_teleport', { id: p.id, x: p.x, y: p.y });
                checkLinearHit(game, p, 50, dashDist, data.roomId);
                break;
            case 'queen': // Multi-attack
                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'multi', x: p.x, y: p.y });
                checkAreaHit(game, p, 200, 40, data.roomId);
                break;
        }

        // Broadcast stats update (cooldown)
        io.to(data.roomId).emit('player_update', {
            id: socket.id,
            x: p.x, y: p.y, angle: p.angle,
            hp: p.hp, maxHp: p.maxHp, kills: p.kills, piece: p.piece,
            lastAbilityTime: p.lastAbilityTime
        });
    });

    socket.on('attack', (data) => {
        const game = games[data.roomId];
        if (!game) return;

        const attacker = game.players[socket.id];
        if (!attacker) return;

        const config = PIECE_CONFIG[attacker.piece];
        // Dynamic range/stats based on piece
        let attackRange = attacker.piece === 'bishop' || attacker.piece === 'queen' ? 400 : 100;
        const attackAngle = Math.PI / 4;

        // Visual effect
        io.in(data.roomId).emit('attack_effect', {
            x: attacker.x,
            y: attacker.y,
            angle: attacker.angle,
            color: attacker.color,
            type: 'normal'
        });

        Object.values(game.players).forEach(target => {
            if (target.id === socket.id) return;
            if (Date.now() < target.invulnerableUntil) return;

            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= attackRange) {
                const angleToTarget = Math.atan2(dy, dx);
                let angleDiff = angleToTarget - attacker.angle;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                if (Math.abs(angleDiff) < attackAngle / 2) {
                    target.hp -= config.dmg;

                    if (target.hp <= 0) {
                        handleKill(game, attacker, target, data.roomId);
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

function handleKill(game, killer, victim, roomId) {
    // Stats update
    killer.kills += 1;
    victim.hp = PIECE_CONFIG[victim.piece].hp;

    // Check Upgrade
    const killerConfig = PIECE_CONFIG[killer.piece];
    if (killerConfig.next && killer.kills >= killerConfig.killsReq) {
        killer.piece = killerConfig.next;
        const newConfig = PIECE_CONFIG[killer.piece];
        killer.hp = newConfig.hp;
        killer.maxHp = newConfig.hp;
        killer.kills = 0; // Reset kills for next rank

        io.in(roomId).emit('upgrade', {
            id: killer.id,
            piece: killer.piece,
            hp: killer.hp,
            maxHp: killer.maxHp
        });

        // Win Condition
        if (killer.piece === 'king') {
            io.in(roomId).emit('game_over', { winnerId: killer.id });
            return;
        }
    }

    // Respawn Victim
    let safe = false, attempts = 0;
    while (!safe && attempts < 10) {
        victim.x = 50 + Math.random() * (CANVAS_WIDTH - 100);
        victim.y = 50 + Math.random() * (CANVAS_HEIGHT - 100);
        const other = Object.values(game.players).find(p => p.id !== victim.id);
        const d = Math.sqrt((victim.x - other.x) ** 2 + (victim.y - other.y) ** 2);
        if (d > 150) safe = true;
        attempts++;
    }

    // Broad Cast events
    io.in(roomId).emit('player_respawn', {
        id: victim.id,
        x: victim.x,
        y: victim.y,
        hp: victim.hp,
        kills: victim.kills
    });

    io.in(roomId).emit('score_update', {
        id: killer.id,
        kills: killer.kills
    });
}

function checkLinearHit(game, attacker, damage, range, roomId, instantKill = false) {
    Object.values(game.players).forEach(target => {
        if (target.id === attacker.id) return;
        if (Date.now() < target.invulnerableUntil) return;

        const vx = Math.cos(attacker.angle);
        const vy = Math.sin(attacker.angle);
        const tx = target.x - attacker.x;
        const ty = target.y - attacker.y;

        const dot = tx * vx + ty * vy;

        if (dot > 0 && dot < range) {
            const px = attacker.x + dot * vx;
            const py = attacker.y + dot * vy;

            const dist = Math.sqrt((target.x - px) ** 2 + (target.y - py) ** 2);
            if (dist < 20) { // Approx radius
                const dmg = instantKill ? target.hp : damage;
                target.hp -= dmg;
                if (target.hp <= 0) handleKill(game, attacker, target, roomId);
                else io.in(roomId).emit('health_update', { id: target.id, hp: target.hp });
            }
        }
    });
}

function checkAreaHit(game, attacker, range, damage, roomId) {
    Object.values(game.players).forEach(target => {
        if (target.id === attacker.id) return;
        if (Date.now() < target.invulnerableUntil) return;

        const dist = Math.sqrt((target.x - attacker.x) ** 2 + (target.y - attacker.y) ** 2);
        if (dist <= range) {
            target.hp -= damage;
            if (target.hp <= 0) handleKill(game, attacker, target, roomId);
            else io.in(roomId).emit('health_update', { id: target.id, hp: target.hp });
        }
    });
}

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
