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
    const [showHowToPlay, setShowHowToPlay] = useState(false);

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

                        <button
                            className="secondary-btn"
                            onClick={() => setShowHowToPlay(true)}
                        >
                            How to Play
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

                    {showHowToPlay && (
                        <div className="modal-overlay" onClick={() => setShowHowToPlay(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
                                <button className="close-btn" onClick={() => setShowHowToPlay(false)}>×</button>
                                <h2 className="modal-title">How to Play</h2>
                                <div className="how-to-play-content" style={{ textAlign: "left", padding: "0 20px" }}>
                                    <p><strong>Goal:</strong> Be the first player to become the <strong>King</strong> and survive!</p>

                                    <h3>Controls</h3>
                                    <ul style={{ marginBottom: "20px" }}>
                                        <li><strong>W, A, S, D</strong>: Move your character</li>
                                        <li><strong>Space</strong>: Use Special Ability</li>
                                        <li><strong>Mouse</strong>: Aim your attacks</li>
                                        <li><strong>Left Click</strong>: Auto-attacks are automatic, but click to focus!</li>
                                    </ul>

                                    <h3>Classes & Abilities</h3>
                                    <table style={{ width: "100%", borderCollapse: "collapse", color: "#ecf0f1" }}>
                                        <thead>
                                            <tr style={{ borderBottom: "1px solid #7f8c8d" }}>
                                                <th style={{ padding: "10px", textAlign: "left" }}>Piece</th>
                                                <th style={{ padding: "10px", textAlign: "left" }}>Kills Req</th>
                                                <th style={{ padding: "10px", textAlign: "left" }}>Special Move</th>
                                                <th style={{ padding: "10px", textAlign: "left" }}>Description</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={{ padding: "8px" }}>Pawn</td>
                                                <td style={{ padding: "8px" }}>0 - 5</td>
                                                <td style={{ padding: "8px" }}>-</td>
                                                <td style={{ padding: "8px" }}>Basic unit. Survive to upgrade.</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: "8px" }}>Knight</td>
                                                <td style={{ padding: "8px" }}>5 - 11</td>
                                                <td style={{ padding: "8px" }}>Jump</td>
                                                <td style={{ padding: "8px" }}>Leaps into the air (Invulnerable). Deals AOE damage on landing.</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: "8px" }}>Bishop</td>
                                                <td style={{ padding: "8px" }}>11 - 18</td>
                                                <td style={{ padding: "8px" }}>Laser</td>
                                                <td style={{ padding: "8px" }}>Fires a long-range piercing beam.</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: "8px" }}>Rook</td>
                                                <td style={{ padding: "8px" }}>18 - 26</td>
                                                <td style={{ padding: "8px" }}>Dash</td>
                                                <td style={{ padding: "8px" }}>Quickly dashes forward, damaging enemies in path.</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: "8px" }}>Queen</td>
                                                <td style={{ padding: "8px" }}>26 - 36</td>
                                                <td style={{ padding: "8px" }}>Multi-Attack</td>
                                                <td style={{ padding: "8px" }}>Fires projectiles in all directions.</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: "8px" }}>King</td>
                                                <td style={{ padding: "8px" }}>36+</td>
                                                <td style={{ padding: "8px" }}>Win</td>
                                                <td style={{ padding: "8px" }}>The final form. You win the game!</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
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
