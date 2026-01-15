import React, { useEffect, useRef } from "react";
import { useGameSocket } from "./hooks/useGameSocket";
import { GameEngine } from "./game/GameEngine";

const App = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const {
        socketRef,
        playerDataRef,
        localPlayerIdRef,
        roomIdRef,
        gameState,
        joinGame
    } = useGameSocket();

    const engineRef = useRef<GameEngine | null>(null);

    useEffect(() => {
        if (gameState === "PLAYING" && canvasRef.current && socketRef.current) {
            // Initialize Game Engine
            engineRef.current = new GameEngine(
                canvasRef.current,
                socketRef.current,
                playerDataRef,
                localPlayerIdRef,
                roomIdRef
            );
            engineRef.current.start();
        } else {
            engineRef.current?.destroy();
            engineRef.current = null;
        }

        return () => {
            engineRef.current?.destroy();
        };
    }, [gameState]); // Re-run when game state changes (Menu -> Waiting -> Playing)

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
                        onClick={joinGame}
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

            <canvas
                ref={canvasRef}
                style={{ display: gameState === 'PLAYING' ? "block" : "none", width: "100%", height: "100%" }}
            />
        </div>
    );
};

export default App;
