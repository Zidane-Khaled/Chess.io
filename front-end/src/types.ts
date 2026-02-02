// Piece Definitions
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface Player {
    id: string;
    x: number;
    y: number;
    radius: number;
    color: string;
    angle: number;
    hp: number;
    maxHp: number;
    kills: number;
    piece: PieceType;
    lastAbilityTime: number;
    jumpStartTime?: number;
    isBot?: boolean;
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

export type GameState = 'MENU' | 'LOBBY' | 'PLAYING' | 'GAME_OVER';

export interface LobbyData {
    playerCount: number;
    maxPlayers: number;
    countdown: number;
    players: string[];
}

export interface GameStartData {
    roomId: string;
    playerId: string;
    playerData: Player;
    allPlayers: Player[];
}

export interface PlayerUpdateData {
    id: string;
    roomId: string;
    x: number;
    y: number;
    angle: number;
    hp: number;
    maxHp: number;
    kills: number;
    piece: PieceType;
    lastAbilityTime: number;
}

export interface AttackEffectData {
    type: 'normal' | 'jump' | 'laser' | 'dash' | 'multi'; // Extended for abilities
    x: number;
    y: number;
    angle?: number;
    color?: string;
    id?: string;
}

export interface UpgradeData {
    id: string;
    piece: PieceType;
    hp: number;
    maxHp: number;
}

export interface AbilityEffectData {
    id: string;
    type: 'jump' | 'laser' | 'dash' | 'multi';
    x: number;
    y: number;
    angle?: number;
}
