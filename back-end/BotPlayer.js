const PIECE_CONFIG = {
    pawn: { hp: 100, dmg: 20, killsReq: 5, next: 'knight', ability: null },
    knight: { hp: 80, dmg: 25, killsReq: 6, next: 'bishop', ability: 'jump', abilityCd: 5000 },
    bishop: { hp: 100, dmg: 30, killsReq: 7, next: 'rook', ability: 'laser', abilityCd: 7000 },
    rook: { hp: 120, dmg: 35, killsReq: 8, next: 'queen', ability: 'dash', abilityCd: 10000 },
    queen: { hp: 160, dmg: 40, killsReq: 10, next: 'king', ability: 'multi', abilityCd: 15000 },
    king: { hp: 999, dmg: 999, killsReq: 999, next: null, ability: null }
};

class BotPlayer {
    constructor(id, x, y, mapWidth, mapHeight) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.color = '#95a5a6'; // Gray color for bots
        this.hp = PIECE_CONFIG.pawn.hp;
        this.maxHp = PIECE_CONFIG.pawn.hp;
        this.kills = 0;
        this.piece = 'pawn';
        this.abilityReady = true;
        this.lastAbilityTime = 0;
        this.invulnerableUntil = 0;
        this.isBot = true;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.radius = 25;

        // AI State
        this.targetId = null;
        this.updateInterval = 100; // Update AI every 100ms
        this.lastUpdateTime = Date.now();
        this.speed = 3;
        this.detectionRange = 800; // Range to detect targets
        this.attackRange = 100;
        this.attackCooldown = 500; // Attack every 500ms
        this.lastAttackTime = 0;
    }

    /**
     * Find the closest target (player or bot) to attack
     */
    findClosestTarget(game) {
        let closestDist = Infinity;
        let closestTarget = null;

        Object.values(game.players).forEach(target => {
            if (target.id === this.id) return; // Don't target self
            if (target.hp <= 0) return; // Don't target dead players

            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < closestDist && dist < this.detectionRange) {
                closestDist = dist;
                closestTarget = target;
            }
        });

        return closestTarget;
    }

    /**
     * Update bot movement toward target
     */
    updateMovement(target) {
        if (!target) {
            // Random wandering if no target
            if (Math.random() < 0.02) { // 2% chance to change direction
                this.angle = Math.random() * Math.PI * 2;
            }
            this.x += Math.cos(this.angle) * this.speed * 0.3; // Slower wandering
            this.y += Math.sin(this.angle) * this.speed * 0.3;
        } else {
            // Move toward target
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            this.angle = Math.atan2(dy, dx);

            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
        }

        // Clamp to map bounds
        this.x = Math.max(this.radius, Math.min(this.mapWidth - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(this.mapHeight - this.radius, this.y));
    }

    /**
     * Attempt to attack the target if in range
     */
    tryAttack(game, target, roomId, io, checkLinearHit, checkAreaHit, handleKill) {
        if (!target) return false;

        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) return false;
        if (now < this.invulnerableUntil) return false; // Can't attack while jumping

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const config = PIECE_CONFIG[this.piece];
        let attackRange = this.piece === 'bishop' || this.piece === 'queen' ? 400 : 100;
        const attackAngle = Math.PI / 4;

        if (dist <= attackRange) {
            const angleToTarget = Math.atan2(dy, dx);
            let angleDiff = angleToTarget - this.angle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            if (Math.abs(angleDiff) < attackAngle / 2) {
                this.lastAttackTime = now;

                // Broadcast attack effect
                io.in(roomId).emit('attack_effect', {
                    x: this.x,
                    y: this.y,
                    angle: this.angle,
                    color: this.color,
                    type: 'normal'
                });

                // Deal damage to all targets in range
                Object.values(game.players).forEach(potentialTarget => {
                    if (potentialTarget.id === this.id) return;
                    if (Date.now() < potentialTarget.invulnerableUntil) return;

                    const tdx = potentialTarget.x - this.x;
                    const tdy = potentialTarget.y - this.y;
                    const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

                    if (tdist <= attackRange) {
                        const angleToTgt = Math.atan2(tdy, tdx);
                        let tAngleDiff = angleToTgt - this.angle;
                        while (tAngleDiff > Math.PI) tAngleDiff -= 2 * Math.PI;
                        while (tAngleDiff < -Math.PI) tAngleDiff += 2 * Math.PI;

                        if (Math.abs(tAngleDiff) < attackAngle / 2) {
                            potentialTarget.hp -= config.dmg;

                            if (potentialTarget.hp <= 0) {
                                handleKill(game, this, potentialTarget, roomId);
                            } else {
                                io.in(roomId).emit('health_update', {
                                    id: potentialTarget.id,
                                    hp: potentialTarget.hp
                                });
                            }
                        }
                    }
                });

                return true; // Attack performed
            }
        }

        return false;
    }

    /**
     * Try to use ability if available
     */
    tryAbility(game, roomId, io, checkLinearHit, checkAreaHit) {
        const config = PIECE_CONFIG[this.piece];
        if (!config.ability) return false;

        const now = Date.now();
        if (now - this.lastAbilityTime < config.abilityCd) return false;

        // Random chance to use ability when available (70% chance)
        if (Math.random() > 0.7) return false;

        this.lastAbilityTime = now;

        switch (this.piece) {
            case 'knight': // Jump (Invulnerable)
                this.invulnerableUntil = now + 1500;
                io.in(roomId).emit('ability_effect', { id: this.id, type: 'jump', x: this.x, y: this.y });

                // Deal AOE damage when landing (1.5s delay)
                setTimeout(() => {
                    if (game.players[this.id]) { // Ensure bot is still in game
                        checkAreaHit(game, this, 200, 40, roomId);
                    }
                }, 1500);
                break;
            case 'bishop': // Laser
                io.in(roomId).emit('ability_effect', { id: this.id, type: 'laser', x: this.x, y: this.y, angle: this.angle });
                checkLinearHit(game, this, 40, 600, roomId);
                break;
            case 'rook': // Dash
                const dashDist = 300;
                this.x += Math.cos(this.angle) * dashDist;
                this.y += Math.sin(this.angle) * dashDist;
                this.x = Math.max(50, Math.min(this.mapWidth - 50, this.x));
                this.y = Math.max(50, Math.min(this.mapHeight - 50, this.y));

                io.in(roomId).emit('ability_effect', { id: this.id, type: 'dash', x: this.x, y: this.y, angle: this.angle });
                io.in(roomId).emit('player_teleport', { id: this.id, x: this.x, y: this.y });
                checkLinearHit(game, this, 50, dashDist, roomId);
                break;
            case 'queen': // Multi-attack
                io.in(roomId).emit('ability_effect', { id: this.id, type: 'multi', x: this.x, y: this.y });
                checkAreaHit(game, this, 200, 40, roomId);
                break;
        }

        // Broadcast stats update
        io.to(roomId).emit('player_update', {
            id: this.id,
            x: this.x, y: this.y, angle: this.angle,
            hp: this.hp, maxHp: this.maxHp, kills: this.kills, piece: this.piece,
            lastAbilityTime: this.lastAbilityTime
        });

        return true;
    }

    /**
     * Main AI update loop
     */
    update(game, roomId, io, checkLinearHit, checkAreaHit, handleKill) {
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = now;

        // Find closest target
        const target = this.findClosestTarget(game);
        this.targetId = target ? target.id : null;

        // Update movement
        this.updateMovement(target);

        // Try to use ability (bots use abilities strategically)
        this.tryAbility(game, roomId, io, checkLinearHit, checkAreaHit);

        // Try to attack
        this.tryAttack(game, target, roomId, io, checkLinearHit, checkAreaHit, handleKill);

        // Broadcast position update
        io.to(roomId).emit('player_update', {
            id: this.id,
            x: this.x,
            y: this.y,
            angle: this.angle,
            hp: this.hp,
            maxHp: this.maxHp,
            kills: this.kills,
            piece: this.piece,
            lastAbilityTime: this.lastAbilityTime
        });
    }
}

module.exports = BotPlayer;
