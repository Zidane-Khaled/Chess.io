import { useRef, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameStartData, GameState, Player, LobbyData } from '../types';

const SOCKET_URL = "http://localhost:3001";

export const useGameSocket = () => {
    const [gameState, setGameState] = useState<GameState>('MENU');
    const [lobbyData, setLobbyData] = useState<LobbyData | null>(null);
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

        socket.on("lobby_update", (data: LobbyData) => {
            console.log("Lobby update:", data);
            setLobbyData(data);
            setGameState("LOBBY");
        });

        socket.on("lobby_full", () => {
            alert("Lobby is full! Please try again later.");
            setGameState("MENU");
        });

        socket.on("game_start", (data: GameStartData) => {
            console.log("Game Start:", data);
            localPlayerIdRef.current = data.playerId;
            roomIdRef.current = data.roomId;

            // Clear previous players
            playersRef.current = {};

            // Initialize all players from server data
            data.allPlayers.forEach(playerData => {
                playersRef.current[playerData.id] = {
                    id: playerData.id,
                    x: playerData.x,
                    y: playerData.y,
                    radius: 25,
                    color: playerData.color,
                    angle: 0,
                    hp: playerData.hp,
                    maxHp: playerData.maxHp,
                    kills: playerData.kills,
                    piece: playerData.piece,
                    lastAbilityTime: 0,
                    isBot: playerData.isBot
                };
            });

            setGameState("PLAYING");
            setLobbyData(null);
        });

        socket.on("player_update", (data: any) => {
            if (playersRef.current[data.id]) {
                const p = playersRef.current[data.id];
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
        lobbyData,
        joinGame
    };
};
