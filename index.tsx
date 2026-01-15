
import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Game State
    let animationFrameId: number;
    const keys = { w: false, a: false, s: false, d: false };
    const mouse = { x: 0, y: 0 };
    
    const player = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      radius: 15,
      speed: 4,
      color: "#ecf0f1",
      angle: 0, // direction pawn is facing (controlled by mouse)
    };

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

    let particles: Particle[] = [];

    // Resize handling
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // Input Listeners
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
      if (e.button === 0) { // Left click
        attack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);

    // Mechanics
    const attack = () => {
      const pelletCount = 12;
      const spread = Math.PI / 4; // 45 degrees spread
      const speed = 15;

      for (let i = 0; i < pelletCount; i++) {
        const angleOffset = (Math.random() - 0.5) * spread;
        const fireAngle = player.angle + angleOffset;
        
        // Spawn slightly in front of the player
        const spawnDist = player.radius + 10;
        const startX = player.x + Math.cos(player.angle) * spawnDist;
        const startY = player.y + Math.sin(player.angle) * spawnDist;

        // Random speed variation for shotgun feel
        const variableSpeed = speed * (0.8 + Math.random() * 0.4);

        particles.push({
          x: startX,
          y: startY,
          vx: Math.cos(fireAngle) * variableSpeed,
          vy: Math.sin(fireAngle) * variableSpeed,
          life: 20 + Math.random() * 10, // Short life
          maxLife: 30,
          color: `hsl(${30 + Math.random() * 30}, 100%, 50%)`, // Orange/Yellow
          size: 2 + Math.random() * 2,
        });
      }
    };

    const update = () => {
      // Movement
      if (keys.w) player.y -= player.speed;
      if (keys.s) player.y += player.speed;
      if (keys.a) player.x -= player.speed;
      if (keys.d) player.x += player.speed;

      // Keep in bounds
      player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

      // Aiming
      const dx = mouse.x - player.x;
      const dy = mouse.y - player.y;
      player.angle = Math.atan2(dy, dx);

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }
    };

    const draw = () => {
      // Clear
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Particles (Shotgun Blast)
      particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Draw Player (Pawn style: Body + Head)
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      
      // Body (Trapezoid-ish / Base circle)
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(0, 5, player.radius, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(0, -8, player.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();

      // Draw Directional Arrow
      const orbitRadius = player.radius + 20;
      const arrowX = player.x + Math.cos(player.angle) * orbitRadius;
      const arrowY = player.y + Math.sin(player.angle) * orbitRadius;

      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(player.angle); // Rotate to point outwards/towards mouse
      
      ctx.fillStyle = "#e74c3c"; // Red arrow
      ctx.beginPath();
      ctx.moveTo(10, 0);   // Tip
      ctx.lineTo(-5, 5);   // Bottom Right
      ctx.lineTo(-5, -5);  // Bottom Left
      ctx.closePath();
      ctx.fill();
      ctx.restore();
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
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
