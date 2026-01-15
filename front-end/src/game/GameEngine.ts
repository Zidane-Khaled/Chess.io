import { Socket } from "socket.io-client";
import { Player, Particle, ShootData } from "../types";

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
        this.socket.on("shoot", (data: ShootData) => {
            this.spawnParticles(data.x, data.y, data.angle, data.color);
        });
    }

    public destroy() {
        this.stop();
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
        this.loop();
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    }

    private spawnParticles(x: number, y: number, angle: number, color: string) {
        const pelletCount = 12;
        const spread = Math.PI / 4;
        const velocity = 15;

        for (let i = 0; i < pelletCount; i++) {
            const fireAngle = angle + (Math.random() - 0.5) * spread;
            const startX = x + Math.cos(angle) * 25;
            const startY = y + Math.sin(angle) * 25;
            const speed = velocity * (0.8 + Math.random() * 0.4);

            this.particles.push({
                x: startX,
                y: startY,
                vx: Math.cos(fireAngle) * speed,
                vy: Math.sin(fireAngle) * speed,
                life: 20 + Math.random() * 10,
                maxLife: 30,
                color: color,
                size: 2 + Math.random() * 2,
            });
        }
    }

    private attack() {
        const myId = this.localPlayerIdRef.current;
        if (!myId || !this.playersRef.current[myId]) return;

        const p = this.playersRef.current[myId];
        this.spawnParticles(p.x, p.y, p.angle, `hsl(${30 + Math.random() * 30}, 100%, 50%)`);

        if (this.roomIdRef.current) {
            this.socket.emit("shoot", {
                roomId: this.roomIdRef.current,
                x: p.x,
                y: p.y,
                angle: p.angle,
                color: p.color
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
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });

        // Players
        Object.values(this.playersRef.current).forEach(p => {
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
            this.ctx.restore();

            // Arrow
            const arrowX = p.x + Math.cos(p.angle) * (p.radius + 20);
            const arrowY = p.y + Math.sin(p.angle) * (p.radius + 20);

            this.ctx.save();
            // Since we already translated to p.x, p.y, we need to undo or use absolute
            this.ctx.restore(); // Restore to world space for arrow calc if easier, OR:

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

    private loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
}
