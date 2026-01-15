export interface Player {
    id: string;
    x: number;
    y: number;
    radius: number;
    color: string;
    angle: number;
    hp: number;
    kills: number;
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
    hp: number;
    kills: number;
}

// Reuse Player for full updates if convenient, or keep separate
export interface PlayerUpdateData {
    id: string;
    roomId: string;
    x: number;
    y: number;
    angle: number;
    hp: number;
    kills: number;
}

export interface AttackEffectData {
    x: number;
    y: number;
    angle: number;
    color: string;
}
