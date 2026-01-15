import { Socket } from "socket.io-client";
import { Player, Particle } from "../types";

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
    private animationFrameId: number | null = null;
    private isRunning: boolean = false;
    private lastTime: number = 0;

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

        this.bindInput();
        this.bindSocketEvents();
    }

    private bindInput() {
        window.addEventListener("keydown", (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener("keyup", (e) => this.keys[e.key.toLowerCase()] = false);
        window.addEventListener("mousemove", (e) => {
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
        this.socket.on("shoot", (data: any) => {
            // Deprecated, but keeping for backward compatibility if needed, or remove
        });

        this.socket.on("attack_effect", (data: { x: number, y: number, angle: number, color: string }) => {
            this.plasmaBlast(data.x, data.y, data.angle, data.color);
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

        this.socket.on("player_respawn", (data: { id: string, x: number, y: number, hp: number, kills: number }) => {
            if (this.playersRef.current[data.id]) {
                const p = this.playersRef.current[data.id];
                p.x = data.x;
                p.y = data.y;
                p.hp = data.hp;
                p.kills = data.kills;
            }
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

            // Bounds
            p.x = Math.max(p.radius, Math.min(this.canvas.width - p.radius, p.x));
            p.y = Math.max(p.radius, Math.min(this.canvas.height - p.radius, p.y));

            // Aim
            p.angle = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);

            // Collision
            Object.values(this.playersRef.current).forEach(other => {
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
        this.ctx.fillStyle = "#2c3e50";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

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

            // Body
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "rgba(0,0,0,0.5)";
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(0, 5, p.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Head
            this.ctx.beginPath();
            this.ctx.arc(0, -8, p.radius * 0.6, 0, Math.PI * 2);
            this.ctx.fill();

            // Health Bar
            const hpWidth = 40;
            const hpHeight = 6;
            const hpY = -p.radius - 15;

            this.ctx.fillStyle = "#333";
            this.ctx.fillRect(-hpWidth / 2, hpY, hpWidth, hpHeight);

            const hpPercent = Math.max(0, p.hp) / 100;
            this.ctx.fillStyle = hpPercent > 0.5 ? "#2ecc71" : hpPercent > 0.2 ? "#f1c40f" : "#e74c3c";
            this.ctx.fillRect(-hpWidth / 2, hpY, hpWidth * hpPercent, hpHeight);

            // Kill Count (Only for local player)
            if (p.id === this.localPlayerIdRef.current) {
                this.ctx.fillStyle = "#fff";
                this.ctx.font = "bold 12px Arial";
                this.ctx.textAlign = "center";
                this.ctx.fillText(`Kills: ${p.kills ?? 0}`, 0, hpY - 5);
            }

            this.ctx.restore();

            // Arrow
            const arrowX = p.x + Math.cos(p.angle) * (p.radius + 20);
            const arrowY = p.y + Math.sin(p.angle) * (p.radius + 20);

            this.ctx.save();
            this.ctx.translate(arrowX, arrowY);
            this.ctx.rotate(p.angle);
            this.ctx.fillStyle = p.id === this.localPlayerIdRef.current ? "#e74c3c" : "#ccc";
            this.ctx.beginPath();
            this.ctx.moveTo(10, 0);
            this.ctx.lineTo(-5, 5);
            this.ctx.lineTo(-5, -5);
            this.ctx.fill();
            this.ctx.restore();
        });
    }

    private loop(timestamp: number = 0) {
        if (!this.isRunning) return;

        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();
        // @ts-ignore
        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
    }
}
