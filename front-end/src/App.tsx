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
        lobbyData,
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
    }, [gameState]);

    return (
        <div style={{ width: "100%", height: "100vh", overflow: "hidden", position: "relative" }}>
            {gameState === 'MENU' && (
                <div style={{
                    position: "absolute",
                    top: 0, left: 0, width: "100%", height: "100%",
                    display: "flex", justifyContent: "center", alignItems: "center",
                    backgroundColor: "#2c3e50", flexDirection: "column", gap: "20px"
                }}>
                    <h1 style={{ color: "white", fontFamily: "sans-serif", fontSize: "48px", marginBottom: "10px" }}>CHESS.IO</h1>
                    <p style={{ color: "#bdc3c7", fontFamily: "sans-serif", fontSize: "18px" }}>Battle Royale - 20 Players</p>
                    <button
                        onClick={joinGame}
                        style={{
                            padding: "15px 40px", fontSize: "24px", cursor: "pointer",
                            backgroundColor: "#27ae60", color: "white", border: "none", borderRadius: "8px"
                        }}
                    >
                        Join Game
                    </button>
                </div>
            )}

            {gameState === 'LOBBY' && lobbyData && (
                <div style={{
                    position: "absolute",
                    top: 0, left: 0, width: "100%", height: "100%",
                    display: "flex", justifyContent: "center", alignItems: "center",
                    backgroundColor: "rgba(44, 62, 80, 0.95)", color: "white", fontFamily: "sans-serif",
                    flexDirection: "column", gap: "30px"
                }}>
                    <h2 style={{ fontSize: "36px", marginBottom: "10px" }}>Waiting in Lobby</h2>

                    <div style={{ fontSize: "24px", color: "#3498db" }}>
                        Players: {lobbyData.playerCount} / {lobbyData.maxPlayers}
                    </div>

                    <div style={{ fontSize: "48px", fontWeight: "bold", color: lobbyData.countdown <= 10 ? "#e74c3c" : "#2ecc71" }}>
                        {lobbyData.countdown}s
                    </div>

                    <div style={{ fontSize: "16px", color: "#95a5a6" }}>
                        {lobbyData.countdown > 0
                            ? `Game starts in ${lobbyData.countdown} seconds...`
                            : "Starting game..."}
                    </div>

                    <div style={{ fontSize: "14px", color: "#7f8c8d", marginTop: "20px" }}>
                        {lobbyData.maxPlayers - lobbyData.playerCount > 0
                            ? `${lobbyData.maxPlayers - lobbyData.playerCount} bot(s) will fill the remaining slots`
                            : "Lobby is full!"}
                    </div>
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
