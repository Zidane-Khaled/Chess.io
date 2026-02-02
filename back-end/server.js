const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const BotPlayer = require('./BotPlayer');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev simplicity
        methods: ["GET", "POST"]
    }
});

// Configurable player count
const MAX_PLAYERS = 20;
const LOBBY_COUNTDOWN = 60; // 60 seconds

const CANVAS_WIDTH = 1500;
const CANVAS_HEIGHT = 1500;

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

// Lobby system
let currentLobby = null;

class Lobby {
    constructor() {
        this.players = [];
        this.countdown = LOBBY_COUNTDOWN;
        this.timerId = null;
        this.roomId = `room_${Date.now()}`;
        this.startTime = Date.now();
    }

    addPlayer(socket) {
        if (this.players.length >= MAX_PLAYERS) return false;

        this.players.push(socket);
        socket.join(this.roomId);

        // Broadcast lobby update to all players
        this.broadcastLobbyStatus();

        // Start timer if first player
        if (this.players.length === 1) {
            this.startCountdown();
        }

        // Start game immediately if lobby is full
        if (this.players.length === MAX_PLAYERS) {
            this.startGame();
        }

        return true;
    }

    broadcastLobbyStatus() {
        io.to(this.roomId).emit('lobby_update', {
            playerCount: this.players.length,
            maxPlayers: MAX_PLAYERS,
            countdown: this.countdown,
            players: this.players.map(p => p.id)
        });
    }

    startCountdown() {
        this.timerId = setInterval(() => {
            this.countdown--;
            this.broadcastLobbyStatus();

            if (this.countdown <= 0) {
                this.startGame();
            }
        }, 1000);
    }

    startGame() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }

        // Fill remaining slots with bots
        const numBots = MAX_PLAYERS - this.players.length;
        const bots = [];

        for (let i = 0; i < numBots; i++) {
            const botId = `bot_${i}_${Date.now()}`;
            const spawnX = 100 + Math.random() * (CANVAS_WIDTH - 200);
            const spawnY = 100 + Math.random() * (CANVAS_HEIGHT - 200);

            const bot = new BotPlayer(botId, spawnX, spawnY, CANVAS_WIDTH, CANVAS_HEIGHT);
            bots.push(bot);
        }

        // Initialize game state
        const pawnStats = PIECE_CONFIG['pawn'];
        const gameState = {
            players: {},
            bots: bots,
            startTime: Date.now()
        };

        // Assign colors
        const colors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#e67e22', '#34495e', '#16a085', '#27ae60',
            '#2980b9', '#8e44ad', '#2c3e50', '#f1c40f', '#e74c3c',
            '#95a5a6', '#d35400', '#c0392b', '#bdc3c7', '#7f8c8d'
        ];

        // Add human players
        this.players.forEach((socket, index) => {
            const spawnX = 100 + Math.random() * (CANVAS_WIDTH - 200);
            const spawnY = 100 + Math.random() * (CANVAS_HEIGHT - 200);

            gameState.players[socket.id] = {
                id: socket.id,
                x: spawnX,
                y: spawnY,
                angle: 0,
                color: colors[index % colors.length],
                hp: pawnStats.hp,
                maxHp: pawnStats.hp,
                kills: 0,
                piece: 'pawn',
                abilityReady: true,
                lastAbilityTime: 0,
                invulnerableUntil: 0,
                isBot: false
            };
        });

        // Add bots to player list
        bots.forEach(bot => {
            gameState.players[bot.id] = bot;
        });

        games[this.roomId] = gameState;

        // Send game start to all human players
        this.players.forEach(socket => {
            const playerData = gameState.players[socket.id];
            const allPlayers = Object.values(gameState.players).map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                color: p.color,
                hp: p.hp,
                maxHp: p.maxHp,
                kills: p.kills,
                piece: p.piece,
                isBot: p.isBot || false
            }));

            socket.emit('game_start', {
                roomId: this.roomId,
                playerId: socket.id,
                playerData: playerData,
                allPlayers: allPlayers
            });
        });

        // Start bot AI loop
        this.startBotAI();

        console.log(`Game started in ${this.roomId} with ${this.players.length} humans and ${numBots} bots`);

        // Reset lobby for next game
        currentLobby = null;
    }

    startBotAI() {
        const game = games[this.roomId];
        if (!game) return;

        // Update bots every 100ms
        const botInterval = setInterval(() => {
            const gameState = games[this.roomId];
            if (!gameState) {
                clearInterval(botInterval);
                return;
            }

            gameState.bots.forEach(bot => {
                if (bot.hp > 0) {
                    bot.update(gameState, this.roomId, io, checkLinearHit, checkAreaHit);
                }
            });
        }, 100);

        // Store interval for cleanup
        game.botInterval = botInterval;
    }

    removePlayer(socket) {
        const index = this.players.indexOf(socket);
        if (index !== -1) {
            this.players.splice(index, 1);
            socket.leave(this.roomId);
            this.broadcastLobbyStatus();

            // Cancel lobby if no players left
            if (this.players.length === 0) {
                if (this.timerId) clearInterval(this.timerId);
                currentLobby = null;
            }
        }
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_game', () => {
        // Create lobby if none exists
        if (!currentLobby) {
            currentLobby = new Lobby();
        }

        // Add player to lobby
        const joined = currentLobby.addPlayer(socket);
        if (!joined) {
            socket.emit('lobby_full');
        }
    });

    socket.on('player_update', (data) => {
        const game = games[data.roomId];
        if (!game || !game.players[socket.id]) return;

        const p = game.players[socket.id];
        p.x = data.x;
        p.y = data.y;
        p.angle = data.angle;

        // Broadcast to all players in room
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
        if (now - p.lastAbilityTime < config.abilityCd) return;

        p.lastAbilityTime = now;

        switch (p.piece) {
            case 'knight':
                p.invulnerableUntil = now + 1500;
                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'jump', x: p.x, y: p.y });
                break;
            case 'bishop':
                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'laser', x: p.x, y: p.y, angle: p.angle });
                checkLinearHit(game, p, 40, 600, data.roomId);
                break;
            case 'rook':
                const dashDist = 300;
                p.x += Math.cos(p.angle) * dashDist;
                p.y += Math.sin(p.angle) * dashDist;
                p.x = Math.max(50, Math.min(CANVAS_WIDTH - 50, p.x));
                p.y = Math.max(50, Math.min(CANVAS_HEIGHT - 50, p.y));

                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'dash', x: p.x, y: p.y, angle: p.angle });
                io.in(data.roomId).emit('player_teleport', { id: p.id, x: p.x, y: p.y });
                checkLinearHit(game, p, 50, dashDist, data.roomId);
                break;
            case 'queen':
                io.in(data.roomId).emit('ability_effect', { id: p.id, type: 'multi', x: p.x, y: p.y });
                checkAreaHit(game, p, 200, 40, data.roomId);
                break;
        }

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

        if (Date.now() < attacker.invulnerableUntil) return;

        const config = PIECE_CONFIG[attacker.piece];
        let attackRange = attacker.piece === 'bishop' || attacker.piece === 'queen' ? 400 : 100;
        const attackAngle = Math.PI / 4;

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

        // Remove from lobby if waiting
        if (currentLobby) {
            currentLobby.removePlayer(socket);
        }

        // Remove from active games
        Object.keys(games).forEach(roomId => {
            const game = games[roomId];
            if (game.players[socket.id]) {
                delete game.players[socket.id];

                // Check if game should end
                const humanPlayers = Object.values(game.players).filter(p => !p.isBot);
                if (humanPlayers.length === 0) {
                    // Clean up game
                    if (game.botInterval) clearInterval(game.botInterval);
                    delete games[roomId];
                }
            }
        });
    });
});

function handleKill(game, killer, victim, roomId) {
    killer.kills += 1;
    victim.hp = PIECE_CONFIG[victim.piece].hp;

    // Check Upgrade
    const killerConfig = PIECE_CONFIG[killer.piece];
    if (killerConfig.next && killer.kills >= killerConfig.killsReq) {
        killer.piece = killerConfig.next;
        const newConfig = PIECE_CONFIG[killer.piece];
        killer.hp = newConfig.hp;
        killer.maxHp = newConfig.hp;
        killer.kills = 0;

        io.in(roomId).emit('upgrade', {
            id: killer.id,
            piece: killer.piece,
            hp: killer.hp,
            maxHp: killer.maxHp
        });

        // Win Condition - check if only one player left at King level
        if (killer.piece === 'king') {
            io.in(roomId).emit('game_over', { winnerId: killer.id });
            // Clean up
            if (game.botInterval) clearInterval(game.botInterval);
            delete games[roomId];
            return;
        }
    }

    // Respawn victim
    let safe = false, attempts = 0;
    while (!safe && attempts < 20) {
        victim.x = 100 + Math.random() * (CANVAS_WIDTH - 200);
        victim.y = 100 + Math.random() * (CANVAS_HEIGHT - 200);

        // Check distance from all other players
        safe = true;
        Object.values(game.players).forEach(other => {
            if (other.id === victim.id) return;
            const d = Math.sqrt((victim.x - other.x) ** 2 + (victim.y - other.y) ** 2);
            if (d < 200) safe = false;
        });
        attempts++;
    }

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
            if (dist < 20) {
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
    console.log(`MAX_PLAYERS: ${MAX_PLAYERS}, LOBBY_COUNTDOWN: ${LOBBY_COUNTDOWN}s`);
});
