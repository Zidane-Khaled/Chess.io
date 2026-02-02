import React, { useEffect, useRef, useState } from "react";
import "./App.css";
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
        joinGame,
        isConnected
    } = useGameSocket();

    const [showComingSoon, setShowComingSoon] = useState(false);

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
                <div className="start-page">
                    <h1 className="title">CHESS.IO</h1>
                    <p className="subtitle">Beta version – works on local server</p>

                    <div className="btn-container">
                        <button
                            className="primary-btn"
                            onClick={joinGame}
                            disabled={!isConnected}
                        >
                            {isConnected ? "Start Play" : "Server Offline"}
                        </button>
                        {!isConnected && <div className="error-text">Cannot connect to backend server</div>}

                        <button
                            className="secondary-btn"
                            onClick={() => setShowComingSoon(true)}
                        >
                            What’s Coming Next
                        </button>
                    </div>

                    <div className="author">Created by Zidane Khaled</div>

                    {showComingSoon && (
                        <div className="modal-overlay" onClick={() => setShowComingSoon(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()}>
                                <button className="close-btn" onClick={() => setShowComingSoon(false)}>×</button>
                                <h2 className="modal-title">Future Features</h2>
                                <ul className="feature-list">
                                    <li>Create accounts & Play Online</li>
                                    <li>Team vs Team Matches</li>
                                    <li>Improved Animations & Abilities</li>
                                </ul>
                            </div>
                        </div>
                    )}
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
