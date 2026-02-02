import { Socket } from "socket.io-client";
import * as React from 'react';
import { Player, Particle } from "../types";

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

export class GameEngine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private socket: Socket;
    private playersRef: React.MutableRefObject<{ [id: string]: Player }>;
    private localPlayerIdRef: React.MutableRefObject<string | null>;
    private roomIdRef: React.MutableRefObject<string | null>;

    private particles: Particle[] = [];
    private keys: { [key: string]: boolean } = { w: false, a: false, s: false, d: false };
    private mouse: { x: number; y: number } = { x: 0, y: 0 };
    private zoomLevel: number = 1.6; // Configurable zoom level
    private animationFrameId: number | null = null;
    private isRunning: boolean = false;
    private lastTime: number = 0;

    private images: { [key: string]: HTMLImageElement } = {};
    private loadedImages = 0;
    private totalImages = 6;

    constructor(
        canvas: HTMLCanvasElement,
        socket: Socket,
        playersRef: React.MutableRefObject<{ [id: string]: Player }>,
        localPlayerIdRef: React.MutableRefObject<string | null>,
        roomIdRef: React.MutableRefObject<string | null>
    ) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.socket = socket;
        this.playersRef = playersRef;
        this.roomIdRef = roomIdRef;
        this.localPlayerIdRef = localPlayerIdRef;

        this.resize();
        this.bindInput();
        this.bindSocketEvents();
        window.addEventListener("resize", () => this.resize());
        this.resize();

        this.loadImages();
    }

    private loadImages() {
        const pieces = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
        pieces.forEach(piece => {
            const img = new Image();
            img.src = `/assets/pieces/${piece}.svg`;
            img.onload = () => this.loadedImages++;
            this.images[piece] = img;
        });
    }

    private bindInput() {
        window.addEventListener("keydown", (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.code === 'Space') this.activateAbility();
        });
        window.addEventListener("keyup", (e) => this.keys[e.key.toLowerCase()] = false);
        window.addEventListener("mousemove", (e) => {
            // Mouse position relative to canvas
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        window.addEventListener("mousedown", (e) => {
            if (e.button === 0 && this.isRunning) this.attack();
        });
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }

    private bindSocketEvents() {
        this.socket.on("shoot", () => { }); // Deprecated

        this.socket.on("attack_effect", (data: { x: number, y: number, angle: number, color: string }) => {
            this.plasmaBlast(data.x, data.y, data.angle, data.color);
        });

        this.socket.on("ability_effect", (data: any) => {
            if (data.type === 'jump') {
                this.spawnEffect(data.x, data.y, 'jump');
                if (data.id && this.playersRef.current[data.id]) {
                    this.playersRef.current[data.id].jumpStartTime = Date.now();
                }
            }
            if (data.type === 'laser') this.spawnEffect(data.x, data.y, 'laser', data.angle);
            if (data.type === 'dash') this.spawnEffect(data.x, data.y, 'dash', data.angle);
            if (data.type === 'multi') this.spawnEffect(data.x, data.y, 'multi');
        });

        this.socket.on("health_update", (data: { id: string, hp: number }) => {
            if (this.playersRef.current[data.id]) {
                this.playersRef.current[data.id].hp = data.hp;
            }
        });

        this.socket.on("score_update", (data: { id: string, kills: number }) => {
            if (this.playersRef.current[data.id]) {
                this.playersRef.current[data.id].kills = data.kills;
            }
        });

        this.socket.on("upgrade", (data: any) => {
            if (this.playersRef.current[data.id]) {
                const p = this.playersRef.current[data.id];
                p.piece = data.piece;
                p.hp = data.hp;
                p.maxHp = data.maxHp;
                this.spawnEffect(p.x, p.y, 'upgrade');
            }
        });

        this.socket.on("player_respawn", (data: { id: string, x: number, y: number, hp: number, kills: number }) => {
            if (this.playersRef.current[data.id]) {
                const p = this.playersRef.current[data.id];
                p.x = data.x;
                p.y = data.y;
                p.hp = data.hp;
                p.kills = data.kills;
            }
        });

        this.socket.on("player_teleport", (data: any) => {
            if (this.playersRef.current[data.id]) {
                const p = this.playersRef.current[data.id];
                p.x = data.x;
                p.y = data.y;
            }
        });

        this.socket.on("player_update", (data: any) => {
            if (this.playersRef.current[data.id]) {
                const p = this.playersRef.current[data.id];
                p.x = data.x;
                p.y = data.y;
                p.angle = data.angle;
                p.hp = data.hp;
                p.maxHp = data.maxHp;
                p.kills = data.kills;
                p.piece = data.piece;
                p.lastAbilityTime = data.lastAbilityTime;
            }
        });

        this.socket.on("game_over", (data: any) => {
            alert(`Game Over! Winner: ${data.winnerId}`);
            location.reload();
        });
    }

    public destroy() {
        this.stop();
        this.socket.off("attack_effect");
        this.socket.off("health_update");
        this.socket.off("score_update");
        this.socket.off("player_respawn");
        // Cleanup listeners if necessary (though strictly window listeners should be removed)
        // For a cleaner implementation, we should store bound functions to remove them
    }

    private resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    }

    private activateAbility() {
        if (!this.isRunning) return;
        if (this.roomIdRef.current) {
            this.socket.emit("ability", { roomId: this.roomIdRef.current });
        }
    }

    private spawnEffect(x: number, y: number, type: string, angle: number = 0) {
        switch (type) {
            case 'jump':
                this.particles.push({ x, y, vx: 0, vy: 0, life: 30, maxLife: 30, color: '#f1c40f', size: 30 });
                break;
            case 'laser':
                for (let i = 0; i < 20; i++) {
                    this.particles.push({
                        x: x + Math.cos(angle) * i * 20, y: y + Math.sin(angle) * i * 20,
                        vx: 0, vy: 0, life: 10, maxLife: 10, color: '#e74c3c', size: 5
                    });
                }
                break;
            case 'dash':
                for (let i = 0; i < 10; i++) {
                    this.particles.push({
                        x: x - Math.cos(angle) * i * 10, y: y - Math.sin(angle) * i * 10,
                        vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 20, maxLife: 20, color: '#3498db', size: 8
                    });
                }
                break;
            case 'multi':
                for (let i = 0; i < 16; i++) {
                    const a = i * Math.PI / 8;
                    this.particles.push({
                        x, y, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, life: 20, maxLife: 20, color: '#9b59b6', size: 10
                    });
                }
                break;
            case 'upgrade':
                this.particles.push({ x, y, vx: 0, vy: -2, life: 50, maxLife: 50, color: '#ffffff', size: 50 });
                break;
        }
    }

    private plasmaBlast(x: number, y: number, angle: number, color: string) {
        // Single cohesive blast visual
        // Main core
        this.particles.push({
            x: x + Math.cos(angle) * 30,
            y: y + Math.sin(angle) * 30,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            life: 10,
            maxLife: 10,
            color: color,
            size: 15,
        });

        // Glow/Trailing effects
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: x + Math.cos(angle) * 20 + (Math.random() - 0.5) * 10,
                y: y + Math.sin(angle) * 20 + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * 5 + (Math.random() - 0.5) * 5,
                vy: Math.sin(angle) * 5 + (Math.random() - 0.5) * 5,
                life: 5 + Math.random() * 5,
                maxLife: 10,
                color: "#ffffff",
                size: 2 + Math.random() * 3,
            });
        }
    }

    private attack() {
        const myId = this.localPlayerIdRef.current;
        if (!myId || !this.playersRef.current[myId]) return;

        // Visual feedback immediately for responsiveness (optional, but good)
        // We rely on server broadcast for final truth, but local prediction helps
        // For now, let's wait for server event to avoid double particles or desync visual

        if (this.roomIdRef.current) {
            this.socket.emit("attack", {
                roomId: this.roomIdRef.current
            });
        }
    }

    private update() {
        const myId = this.localPlayerIdRef.current;
        const speed = 4;

        if (myId && this.playersRef.current[myId]) {
            const p = this.playersRef.current[myId];

            // Movement
            if (this.keys.w) p.y -= speed;
            if (this.keys.s) p.y += speed;
            if (this.keys.a) p.x -= speed;
            if (this.keys.d) p.x += speed;

            // Bounds (Map Size)
            p.x = Math.max(p.radius, Math.min(MAP_WIDTH - p.radius, p.x));
            p.y = Math.max(p.radius, Math.min(MAP_HEIGHT - p.radius, p.y));

            // Mouse Aim
            // With zoom and center pivot, world coordinates of mouse are:
            // WorldX = (ScreenX - ScreenWidth/2) / Zoom + PlayerX
            // WorldY = (ScreenY - ScreenHeight/2) / Zoom + PlayerY

            const screenCX = this.canvas.width / 2;
            const screenCY = this.canvas.height / 2;

            const worldMouseX = (this.mouse.x - screenCX) / this.zoomLevel + p.x;
            const worldMouseY = (this.mouse.y - screenCY) / this.zoomLevel + p.y;

            p.angle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);

            // Collision
            Object.values(this.playersRef.current).forEach((other: Player) => {
                if (other.id === myId) return;
                const dist = Math.sqrt((p.x - other.x) ** 2 + (p.y - other.y) ** 2);
                const minDist = p.radius + other.radius;
                if (dist < minDist) {
                    const angle = Math.atan2(p.y - other.y, p.x - other.x);
                    const push = minDist - dist;
                    p.x += Math.cos(angle) * push;
                    p.y += Math.sin(angle) * push;
                }
            });

            // Network
            if (this.roomIdRef.current) {
                this.socket.emit("player_update", {
                    roomId: this.roomIdRef.current,
                    x: p.x,
                    y: p.y,
                    angle: p.angle
                });
            }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    private draw() {
        // Clear screen
        this.ctx.fillStyle = "#1e1e1e"; // Dark background for outside map
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();

        // --- CAMERA TRANSFORM ---
        // 1. Center the coordinate system on screen
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        // 2. Apply Zoom
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        // 3. Translate world so local player is at origin (0,0) of this new context
        // We find local player first
        const myId = this.localPlayerIdRef.current;
        let camX = 0, camY = 0;
        if (myId && this.playersRef.current[myId]) {
            camX = this.playersRef.current[myId].x;
            camY = this.playersRef.current[myId].y;
        }

        this.ctx.translate(-camX, -camY);

        // Draw Map Background
        this.ctx.fillStyle = "#2c3e50"; // Playable area color
        this.ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

        // Draw Map Grid
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        this.ctx.lineWidth = 1;
        const gridSize = 100;
        for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, MAP_HEIGHT);
            this.ctx.stroke();
        }
        for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(MAP_WIDTH, y);
            this.ctx.stroke();
        }

        // Draw Map Borders
        this.ctx.strokeStyle = "#e74c3c";
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

        // Particles
        this.particles.forEach(p => {
            this.ctx.save();
            this.ctx.globalAlpha = p.life / p.maxLife;
            // Plasma effect: simpler, glowing
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = p.color;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });

        // Players
        Object.values(this.playersRef.current).forEach((p: Player) => {
            this.ctx.save();
            this.ctx.translate(p.x, p.y);

            // Piece Image
            const pieceName = p.piece || 'pawn';
            const img = this.images[pieceName];
            if (img && this.loadedImages >= this.totalImages) {
                // Draw image centered, no rotation
                // Jump Animation Scale
                const jumpDuration = 1500;
                let scale = 1;
                if (p.jumpStartTime) {
                    const elapsed = Date.now() - p.jumpStartTime;
                    if (elapsed < jumpDuration) {
                        // Sine wave scale: 1 -> 1.5 -> 1
                        scale = 1 + Math.sin((elapsed / jumpDuration) * Math.PI) * 0.5;
                    } else {
                        p.jumpStartTime = undefined;
                    }
                }

                this.ctx.scale(scale, scale);
                this.ctx.drawImage(img, -p.radius, -p.radius, p.radius * 2, p.radius * 2);
            } else {
                // Fallback
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Health Bar
            const hpWidth = 40;
            const hpHeight = 6;
            const hpY = -p.radius - 15;

            this.ctx.fillStyle = "#333";
            this.ctx.fillRect(-hpWidth / 2, hpY, hpWidth, hpHeight);

            // Normalize HP based on MaxHP if available, else 100
            const maxHp = p.maxHp || 100;
            const hpPercent = Math.max(0, p.hp) / maxHp;

            this.ctx.fillStyle = hpPercent > 0.5 ? "#2ecc71" : hpPercent > 0.2 ? "#f1c40f" : "#e74c3c";
            this.ctx.fillRect(-hpWidth / 2, hpY, hpWidth * hpPercent, hpHeight);

            // Kill Count (Only for local player)
            if (p.id === this.localPlayerIdRef.current) {
                this.ctx.fillStyle = "#fff";
                this.ctx.font = "bold 12px Arial";
                this.ctx.textAlign = "center";
                this.ctx.fillText(`Kills: ${p.kills ?? 0} / ${this.getNextKillReq(p.piece)}`, 0, hpY - 5);

                // Ability Cooldown
                const abilityInfo = this.getAbilityInfo(p.piece);
                if (abilityInfo) {
                    const now = Date.now();
                    const last = p.lastAbilityTime || 0;
                    const elapsed = now - last;
                    const remaining = Math.max(0, abilityInfo.cd - elapsed);
                    const percent = Math.min(1, elapsed / abilityInfo.cd);

                    // Draw Cooldown Bar underneath Health Bar
                    const cdWidth = 30;
                    const cdHeight = 4;
                    const cdY = hpY + hpHeight + 2;

                    this.ctx.fillStyle = "#555";
                    this.ctx.fillRect(-cdWidth / 2, cdY, cdWidth, cdHeight);

                    this.ctx.fillStyle = percent >= 1 ? "#3498db" : "#e67e22";
                    this.ctx.fillRect(-cdWidth / 2, cdY, cdWidth * percent, cdHeight);
                }
            } else {
                // Show bot indicator for other players
                /* 
                if (p.isBot) {
                    this.ctx.fillStyle = "#95a5a6";
                    this.ctx.font = "bold 10px Arial";
                    this.ctx.textAlign = "center";
                    this.ctx.fillText("BOT", 0, hpY - 5);
                }
                */
            }

            this.ctx.restore();
        });

        // Restore camera translation
        this.ctx.restore();
    }

    private getNextKillReq(piece: string): string {
        switch (piece) {
            case 'pawn': return '5';
            case 'knight': return '6';
            case 'bishop': return '7';
            case 'rook': return '8';
            case 'queen': return '10';
            default: return '-';
        }
    }

    private getAbilityInfo(piece: string) {
        switch (piece) {
            case 'knight': return { cd: 5000 };
            case 'bishop': return { cd: 7000 };
            case 'rook': return { cd: 10000 };
            case 'queen': return { cd: 15000 };
            default: return null;
        }
    }

    private loop(timestamp: number = 0) {
        if (!this.isRunning) return;

        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update();
        this.draw();
        // @ts-ignore
        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
    }
}
