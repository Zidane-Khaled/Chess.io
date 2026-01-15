import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:3001";

interface Player {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  angle: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'MENU' | 'WAITING' | 'PLAYING'>('MENU');
  const socketRef = useRef<Socket | null>(null);
  const playersRef = useRef<{ [id: string]: Player }>({});
  const localPlayerIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Initialize Socket
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("connect", () => {
      console.log("Connected to server");
    });

    socketRef.current.on("waiting", () => {
      setGameState("WAITING");
    });

    socketRef.current.on("game_start", (data: any) => {
      console.log("Game Start:", data);
      localPlayerIdRef.current = data.playerId;
      roomIdRef.current = data.roomId;

      // Initialize self
      playersRef.current[data.playerId] = {
        id: data.playerId,
        x: data.x,
        y: data.y,
        radius: 15,
        color: data.color,
        angle: 0
      };

      // Initialize opponent (stub, will be updated)
      playersRef.current[data.opponentId] = {
        id: data.opponentId,
        x: -100, // offscreen initially
        y: -100,
        radius: 15,
        color: data.color === '#e74c3c' ? '#3498db' : '#e74c3c', // simple opposite color logic or wait for update
        angle: 0
      };

      setGameState("PLAYING");
    });

    socketRef.current.on("player_update", (data: any) => {
      if (playersRef.current[data.id]) {
        playersRef.current[data.id].x = data.x;
        playersRef.current[data.id].y = data.y;
        playersRef.current[data.id].angle = data.angle;
      } else {
        // Create if missing (e.g. strict opponent init above might be flaky)
        playersRef.current[data.id] = {
          id: data.id,
          x: data.x,
          y: data.y,
          radius: 15,
          color: '#ccc', // fallback
          angle: data.angle
        };
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (gameState !== "PLAYING") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const keys = { w: false, a: false, s: false, d: false };
    const mouse = { x: 0, y: 0 };
    let particles: Particle[] = [];
    const speed = 4;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys) keys[key as keyof typeof keys] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys) keys[key as keyof typeof keys] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        attack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);

    // Socket listeners for game actions inside loop context
    const handleShoot = (data: any) => {
      spawnParticles(data.x, data.y, data.angle, data.color);
    };
    socketRef.current?.on("shoot", handleShoot);

    const spawnParticles = (x: number, y: number, angle: number, color: string) => {
      const pelletCount = 12;
      const spread = Math.PI / 4;
      const velocity = 15;

      for (let i = 0; i < pelletCount; i++) {
        const angleOffset = (Math.random() - 0.5) * spread;
        const fireAngle = angle + angleOffset;
        const spawnDist = 25; // radius + buffer
        const startX = x + Math.cos(angle) * spawnDist;
        const startY = y + Math.sin(angle) * spawnDist;
        const variableSpeed = velocity * (0.8 + Math.random() * 0.4);

        particles.push({
          x: startX,
          y: startY,
          vx: Math.cos(fireAngle) * variableSpeed,
          vy: Math.sin(fireAngle) * variableSpeed,
          life: 20 + Math.random() * 10,
          maxLife: 30,
          color: color,
          size: 2 + Math.random() * 2,
        });
      }
    };

    const attack = () => {
      const myId = localPlayerIdRef.current;
      if (!myId || !playersRef.current[myId]) return;

      const p = playersRef.current[myId];
      spawnParticles(p.x, p.y, p.angle, `hsl(${30 + Math.random() * 30}, 100%, 50%)`); // Local visual

      socketRef.current?.emit("shoot", {
        roomId: roomIdRef.current,
        x: p.x,
        y: p.y,
        angle: p.angle,
        color: p.color
      });
    };

    const update = () => {
      const myId = localPlayerIdRef.current;
      if (myId && playersRef.current[myId]) {
        const p = playersRef.current[myId];
        let moved = false;

        if (keys.w) { p.y -= speed; moved = true; }
        if (keys.s) { p.y += speed; moved = true; }
        if (keys.a) { p.x -= speed; moved = true; }
        if (keys.d) { p.x += speed; moved = true; }

        // Bounds
        p.x = Math.max(p.radius, Math.min(canvas.width - p.radius, p.x));
        p.y = Math.max(p.radius, Math.min(canvas.height - p.radius, p.y));

        // Aim
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        p.angle = Math.atan2(dy, dx);

        // Collision with other players
        Object.values(playersRef.current).forEach(other => {
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

        // Network Sync
        if (roomIdRef.current) {
          socketRef.current?.emit("player_update", {
            roomId: roomIdRef.current,
            x: p.x,
            y: p.y,
            angle: p.angle
          });
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
      }
    };

    const draw = () => {
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Particles
      particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Players
      Object.values(playersRef.current).forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);

        // Body
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 5, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(0, -8, p.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Arrow
        const orbitRadius = p.radius + 20;
        const arrowX = p.x + Math.cos(p.angle) * orbitRadius;
        const arrowY = p.y + Math.sin(p.angle) * orbitRadius;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.id === localPlayerIdRef.current ? "#e74c3c" : "#ccc"; // Red for self
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, 5);
        ctx.lineTo(-5, -5);
        ctx.fill();
        ctx.restore();
      });
    };

    const loop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      socketRef.current?.off("shoot", handleShoot);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameState]);

  const handleStartGame = () => {
    socketRef.current?.emit("join_game");
  };

  return (
    <div style={{ width: "100%", height: "100vh", overflow: "hidden", position: "relative" }}>
      {gameState === 'MENU' && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, width: "100%", height: "100%",
          display: "flex", justifyContent: "center", alignItems: "center",
          backgroundColor: "#2c3e50", flexDirection: "column", gap: "20px"
        }}>
          <h1 style={{ color: "white", fontFamily: "sans-serif" }}>CHESS.IO</h1>
          <button
            onClick={handleStartGame}
            style={{
              padding: "15px 40px", fontSize: "24px", cursor: "pointer",
              backgroundColor: "#27ae60", color: "white", border: "none", borderRadius: "8px"
            }}
          >
            Start Game
          </button>
        </div>
      )}

      {gameState === 'WAITING' && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, width: "100%", height: "100%",
          display: "flex", justifyContent: "center", alignItems: "center",
          backgroundColor: "rgba(44, 62, 80, 0.9)", color: "white", fontFamily: "sans-serif"
        }}>
          <h2>Waiting for opponent...</h2>
        </div>
      )}

      {/* Canvas is always rendered but might be behind UI or just active when PLAYING */}
      <canvas
        ref={canvasRef}
        style={{ display: gameState === 'PLAYING' ? "block" : "none", width: "100%", height: "100%" }}
      />
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
