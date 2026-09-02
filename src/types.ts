/**
 * Types & Interfaces for Retro ROM Emulator & WebRTC Rollback Netplay
 */

export type ConsoleSystem = "NES" | "SNES" | "GBA" | "GB" | "GBC";

export type NetplayMode = "rollback" | "lockstep";

export type PlayerRole = "player1" | "player2" | "spectator";

export type ScreenFilter = "pixel-perfect" | "crt-scanlines" | "lcd-grid" | "smooth-bilinear" | "gameboy-green";

export interface GamepadButtonMap {
  up: string;
  down: string;
  left: string;
  right: string;
  a: string;
  b: string;
  x?: string;
  y?: string;
  l?: string;
  r?: string;
  select: string;
  start: string;
  turboA?: string;
  turboB?: string;
}

export interface ControllerState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  l: boolean;
  r: boolean;
  select: boolean;
  start: boolean;
}

export interface NetplayInputFrame {
  frame: number;
  player1: number; // 8-bit or 16-bit bitmask
  player2: number;
  isPredictedP1?: boolean;
  isPredictedP2?: boolean;
  timestamp: number;
}

export interface NetplayMetrics {
  ping: number; // ms RTT
  jitter: number; // ms
  packetLoss: number; // %
  rollbacksPerSec: number;
  maxRollbackFrames: number;
  localFrame: number;
  remoteFrame: number;
  frameAdvantage: number;
  desyncCount: number;
  p2pConnected: boolean;
  connectionType: "webrtc-p2p" | "websocket-relay" | "local" | "disconnected";
}

export interface Participant {
  peerId: string;
  username: string;
  role: PlayerRole;
  isReady: boolean;
  ping: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  hostId: string;
  gameTitle: string;
  system: ConsoleSystem;
  romHash?: string;
  romSize?: number;
  netplayMode: NetplayMode;
  frameDelay: number;
  participants: Participant[];
  createdAt: number;
  isPrivate?: boolean;
  inviteToken?: string;
  supportedGames?: string[];
}

export interface MatchmakingCriteria {
  consoleSystem: ConsoleSystem | "ANY";
  supportedGames: string[];
  netplayMode: NetplayMode;
  username?: string;
}

export type MatchmakingStatus = "idle" | "searching" | "matched" | "connecting";

export interface MatchmakingStats {
  queueLength: number;
  activeRooms: number;
  onlinePlayers: number;
}

export interface DemoROM {
  id: string;
  title: string;
  system: ConsoleSystem;
  description: string;
  genre: string;
  twoPlayer: boolean;
  url?: string;
  embedded?: boolean;
  author: string;
  badge: string;
}

export interface EmulationSaveState {
  id: string;
  slot: number;
  title: string;
  timestamp: number;
  screenshot?: string;
  stateData: Uint8Array | string;
}

export interface ChatMessage {
  id: string;
  senderPeerId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface ServerRomFile {
  filename: string;
  title: string;
  system: ConsoleSystem;
  size: number;
  url: string;
  modifiedAt: number;
}

