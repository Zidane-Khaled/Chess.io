import { useRef, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameStartData, GameState, Player, PlayerUpdateData } from '../types';

const SOCKET_URL = "http://localhost:3001";

export const useGameSocket = () => {
    const [gameState, setGameState] = useState<GameState>('MENU');
    const socketRef = useRef<Socket | null>(null);
    const roomIdRef = useRef<string | null>(null);
    const localPlayerIdRef = useRef<string | null>(null);

    // Direct refs for game engine to consume without re-renders
    const playersRef = useRef<{ [id: string]: Player }>({});

    useEffect(() => {
        socketRef.current = io(SOCKET_URL);

        const socket = socketRef.current;

        socket.on("connect", () => {
            console.log("Connected to server");
        });

        socket.on("waiting", () => {
            setGameState("WAITING");
        });

        socket.on("game_start", (data: GameStartData) => {
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
                angle: 0,
                hp: data.hp,
                maxHp: data.maxHp,
                kills: data.kills,
                piece: data.piece,
                lastAbilityTime: data.lastAbilityTime
            };

            // Initialize opponent
            playersRef.current[data.opponentId] = {
                id: data.opponentId,
                x: -100, // offscreen
                y: -100,
                radius: 15,
                color: data.color === '#e74c3c' ? '#3498db' : '#e74c3c', // Logic handled by server usually, but keeping fallback
                angle: 0,
                hp: 100, // Fallback, will be updated by player_update immediately, but ideally we should get this from start data if opponent is e.g. a King
                maxHp: 100,
                kills: 0,
                piece: 'pawn',
                lastAbilityTime: 0
            };

            setGameState("PLAYING");
        });

        socket.on("player_update", (data: PlayerUpdateData) => {
            if (playersRef.current[data.id]) {
                const p = playersRef.current[data.id];
                p.x = data.x;
                p.y = data.y;
                p.angle = data.angle;
            }
        });

        // 'shoot' event is technically visual, can be handled by engine listeners directly or piped through here.
        // For decoupled design, we'll let the engine attach its own specific listener if needed, 
        // OR we expose a callback registry. For simplicity, we expose the socket.

        return () => {
            socket.disconnect();
        };
    }, []);

    const joinGame = () => {
        socketRef.current?.emit("join_game");
    };

    return {
        socketRef,
        playerDataRef: playersRef,
        localPlayerIdRef,
        roomIdRef,
        gameState,
        joinGame
    };
};
