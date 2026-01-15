export interface Player {
    id: string;
    x: number;
    y: number;
    radius: number;
    color: string;
    angle: number;
}

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
}

export type GameState = 'MENU' | 'WAITING' | 'PLAYING';

export interface GameStartData {
    roomId: string;
    playerId: string;
    opponentId: string;
    x: number;
    y: number;
    color: string;
}

export interface PlayerUpdateData {
    id: string;
    roomId: string;
    x: number;
    y: number;
    angle: number;
}

export interface ShootData {
    id: string;
    roomId: string;
    x: number;
    y: number;
    angle: number;
    color: string;
}
