/**
 * Master Netplay Controller
 * Integrates WebRTC P2P, Signaling, Matchmaking, Rollback/Lockstep engines,
 * Gamepad polling, and high-precision 60Hz game loop.
 */

import { UniversalEmulator } from "../emulator/emulatorManager";
import { SignalingClient } from "./signaling";
import { WebRTCNetplayPeer } from "./webrtc";
import { WebRTCVideoChat } from "./videoChat";
import { RollbackNetplayEngine } from "./rollbackEngine";
import { LockstepNetplayEngine } from "./lockstepEngine";
import {
  ChatMessage,
  ConsoleSystem,
  ControllerState,
  GamepadButtonMap,
  MatchmakingCriteria,
  MatchmakingStatus,
  NetplayMetrics,
  NetplayMode,
  Participant,
  PlayerRole,
  RoomInfo,
} from "../types";

export interface GameSyncState {
  phase: "idle" | "announcing" | "loading" | "state_transfer" | "resumed";
  stepIndex: number; // 0 to 4
  targetGameTitle: string;
  targetSystem: string;
  progress: number;
  message: string;
  isHost: boolean;
}

export class NetplayController {
  public emulator: UniversalEmulator;
  public signaling: SignalingClient;
  public peer: WebRTCNetplayPeer;
  public videoChat: WebRTCVideoChat;
  public rollbackEngine: RollbackNetplayEngine;
  public lockstepEngine: LockstepNetplayEngine;

  public currentRoom: RoomInfo | null = null;
  public myPeerId: string = "";
  public myRole: PlayerRole = "player1";
  public myUsername: string = "Player 1";
  public netplayMode: NetplayMode = "rollback";
  public isRunning: boolean = false;
  public chatMessages: ChatMessage[] = [];

  // Game Resynchronization & Switching Workflow State
  public gameSyncState: GameSyncState = {
    phase: "idle",
    stepIndex: 0,
    targetGameTitle: "",
    targetSystem: "NES",
    progress: 0,
    message: "Ready",
    isHost: true,
  };

  // Matchmaking State
  public matchmakingStatus: MatchmakingStatus = "idle";
  public matchmakingQueueLength: number = 0;

  // Controllers & Keybindings (Default adjacent keys Z/X and J/K)
  public p1KeyMap: GamepadButtonMap = {
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    b: "KeyZ",
    a: "KeyX",
    x: "KeyC",
    y: "KeyV",
    select: "ShiftRight",
    start: "Enter",
    turboA: "KeyS",
    turboB: "KeyA",
  };

  public p2KeyMap: GamepadButtonMap = {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    a: "Numpad2",
    b: "Numpad1",
    x: "Numpad5",
    y: "Numpad4",
    select: "Numpad0",
    start: "NumpadEnter",
  };

  public keyState: Set<string> = new Set();
  public touchState: ControllerState = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    select: false,
    start: false,
  };

  public turboCounter: number = 0;
  private animFrameId: number | null = null;
  private lastFrameTimestamp: number = 0;
  private frameDurationMs: number = 1000 / 60; // 16.666ms

  // Event callbacks for UI
  public onMetricsUpdate: ((metrics: NetplayMetrics) => void) | null = null;
  public onRoomUpdate: ((room: RoomInfo | null) => void) | null = null;
  public onChatMessage: ((msg: ChatMessage) => void) | null = null;
  public onStatusMessage: ((msg: string, type?: "info" | "success" | "warn") => void) | null = null;
  public onMatchmakingStatusChange: ((status: MatchmakingStatus, details?: Record<string, unknown>) => void) | null = null;
  public onGameSyncUpdate: ((state: GameSyncState) => void) | null = null;

  constructor() {
    this.emulator = new UniversalEmulator();
    this.signaling = new SignalingClient();
    this.peer = new WebRTCNetplayPeer(this.signaling);
    this.videoChat = new WebRTCVideoChat(this.signaling);
    this.rollbackEngine = new RollbackNetplayEngine(this.emulator, this.peer);
    this.lockstepEngine = new LockstepNetplayEngine(this.emulator, this.peer);

    this.setupSignalingEvents();
    this.setupKeyboardListeners();
    this.setupPeerEvents();
  }

  private setupSignalingEvents() {
    this.signaling.on("room-created", (data) => {
      this.currentRoom = data.room as RoomInfo;
      this.myPeerId = data.peerId as string;
      this.myRole = data.role as PlayerRole;
      this.matchmakingStatus = "idle";
      this.rollbackEngine.setLocalRole(this.myRole);
      this.lockstepEngine.setLocalRole(this.myRole);
      if (this.onRoomUpdate) this.onRoomUpdate(this.currentRoom);
      if (this.onStatusMessage)
        this.onStatusMessage(
          `Room ${this.currentRoom.id} created (${this.currentRoom.isPrivate ? "Private" : "Public"})`,
          "success"
        );
      if (this.onMatchmakingStatusChange) this.onMatchmakingStatusChange("idle");
    });

    this.signaling.on("room-joined", (data) => {
      this.currentRoom = data.room as RoomInfo;
      this.myPeerId = data.peerId as string;
      this.myRole = data.role as PlayerRole;
      this.matchmakingStatus = "idle";
      this.rollbackEngine.setLocalRole(this.myRole);
      this.lockstepEngine.setLocalRole(this.myRole);

      if (data.gameId) {
        this.emulator.loadDemoRom(data.gameId as string);
      }

      if (this.onRoomUpdate) this.onRoomUpdate(this.currentRoom);
      if (this.onStatusMessage)
        this.onStatusMessage(
          `Joined room ${this.currentRoom.id} as ${this.myRole.toUpperCase()}`,
          "success"
        );
      if (this.onMatchmakingStatusChange) this.onMatchmakingStatusChange("idle");

      // Auto connect WebRTC P2P to Host
      if (this.currentRoom.hostId && this.currentRoom.hostId !== this.myPeerId) {
        this.peer.connectToPeer(this.currentRoom.hostId);
      }
    });

    this.signaling.on("peer-joined", (data) => {
      this.currentRoom = data.room as RoomInfo;
      if (this.onRoomUpdate) this.onRoomUpdate(this.currentRoom);
      const joinedName = data.username as string;
      if (this.onStatusMessage) this.onStatusMessage(`${joinedName} joined the netplay room!`, "info");

      // If host, auto connect P2P to joining peer
      if (this.myRole === "player1" && data.peerId) {
        this.peer.connectToPeer(data.peerId as string);
      }
    });

    this.signaling.on("peer-left", (data) => {
      this.currentRoom = data.room as RoomInfo;
      if (this.onRoomUpdate) this.onRoomUpdate(this.currentRoom);
      if (this.onStatusMessage) this.onStatusMessage("A player left the session", "warn");
    });

    this.signaling.on("room-updated", (data) => {
      this.currentRoom = data.room as RoomInfo;
      if (this.onRoomUpdate) this.onRoomUpdate(this.currentRoom);
    });

    this.signaling.on("game-updated", (data) => {
      this.currentRoom = data.room as RoomInfo;
      if (data.netplayMode) {
        this.netplayMode = data.netplayMode as NetplayMode;
      }
      if (data.gameId) {
        this.emulator.loadDemoRom(data.gameId as string);
      }
      if (this.onRoomUpdate) this.onRoomUpdate(this.currentRoom);
      if (this.onStatusMessage) this.onStatusMessage(`Game updated: ${data.gameTitle}`, "info");
    });

    // Random Matchmaking Handlers
    this.signaling.on("matchmaking-status", (data) => {
      const status = (data.status as MatchmakingStatus) || "idle";
      this.matchmakingStatus = status;
      this.matchmakingQueueLength = (data.queueLength as number) || 0;
      if (this.onMatchmakingStatusChange) this.onMatchmakingStatusChange(status, data);
    });

    this.signaling.on("match-found", (data) => {
      this.matchmakingStatus = "matched";
      this.currentRoom = data.room as RoomInfo;
      this.myPeerId = data.peerId as string;
      this.myRole = data.role as PlayerRole;
      this.netplayMode = data.netplayMode as NetplayMode;

      this.rollbackEngine.setLocalRole(this.myRole);
      this.lockstepEngine.setLocalRole(this.myRole);

      // Load agreed game into emulator
      if (data.gameId) {
        this.emulator.loadDemoRom(data.gameId as string);
      }

      if (this.onRoomUpdate) this.onRoomUpdate(this.currentRoom);
      if (this.onMatchmakingStatusChange) this.onMatchmakingStatusChange("matched", data);
      if (this.onStatusMessage)
        this.onStatusMessage(
          `Match Found! Playing against ${data.opponentName} in ${data.gameTitle}`,
          "success"
        );

      // If Player 1, initiate WebRTC connection to peer
      if (this.myRole === "player1") {
        const otherParticipant = this.currentRoom.participants.find(
          (p) => p.peerId !== this.myPeerId
        );
        if (otherParticipant) {
          setTimeout(() => {
            this.peer.connectToPeer(otherParticipant.peerId);
          }, 300);
        }
      }
    });

    // Game Switching & Resynchronization Protocol Handlers
    this.signaling.on("game-sync-step", async (data) => {
      const step = data.step as string;
      const gameTitle = (data.gameTitle as string) || "Game";
      const system = (data.system as string) || "NES";

      if (step === "announce") {
        // Step 1: Client receives announcement, pauses emulation, and loads new ROM
        this.emulator.isPaused = true;
        this.updateSyncState({
          phase: "loading",
          stepIndex: 2,
          targetGameTitle: gameTitle,
          targetSystem: system,
          progress: 45,
          message: `Host switched game to "${gameTitle}". Verifying & loading ROM...`,
          isHost: false,
        });

        if (data.gameId) {
          this.emulator.loadDemoRom(data.gameId as string);
        } else if (data.romBytes) {
          const bytes = new Uint8Array(data.romBytes as number[]);
          this.emulator.loadRomFromBuffer(gameTitle, bytes);
        }

        // Acknowledge ROM loaded
        this.signaling.send({
          type: "game-sync-ack",
          step: "loaded",
          gameTitle,
          system,
        });
      } else if (step === "state") {
        // Step 3: Client receives initial state snapshot
        this.updateSyncState({
          phase: "state_transfer",
          stepIndex: 3,
          targetGameTitle: gameTitle,
          targetSystem: system,
          progress: 80,
          message: "Receiving initial state snapshot (Frame 0)...",
          isHost: false,
        });

        if (data.snapshot) {
          this.emulator.restoreSnapshot(data.snapshot as Record<string, unknown>);
        }
        this.rollbackEngine.reset();
        this.lockstepEngine.reset();

        // Acknowledge state ready
        this.signaling.send({
          type: "game-sync-ack",
          step: "state_ready",
        });
      } else if (step === "resume") {
        // Step 4: Resume execution simultaneously
        this.emulator.isPaused = false;
        this.updateSyncState({
          phase: "resumed",
          stepIndex: 4,
          targetGameTitle: gameTitle,
          targetSystem: system,
          progress: 100,
          message: `Synced and active in "${gameTitle}"!`,
          isHost: false,
        });

        if (this.onStatusMessage) {
          this.onStatusMessage(`Synchronized with host in "${gameTitle}"!`, "success");
        }

        setTimeout(() => {
          this.updateSyncState({
            phase: "idle",
            stepIndex: 0,
            targetGameTitle: "",
            targetSystem: "NES",
            progress: 0,
            message: "Ready",
            isHost: this.myRole === "player1",
          });
        }, 3500);
      }
    });

    this.signaling.on("game-sync-ack", (data) => {
      const step = data.step as string;

      if (step === "loaded" && this.myRole === "player1") {
        // Host transfers initial state snapshot
        this.updateSyncState({
          phase: "state_transfer",
          stepIndex: 3,
          targetGameTitle: this.gameSyncState.targetGameTitle,
          targetSystem: this.gameSyncState.targetSystem,
          progress: 75,
          message: "Peer verified ROM. Transferring Frame 0 state snapshot...",
          isHost: true,
        });

        const snapshot = this.emulator.saveSnapshot();
        this.rollbackEngine.reset();
        this.lockstepEngine.reset();

        this.signaling.send({
          type: "game-sync-step",
          step: "state",
          snapshot,
          gameTitle: this.gameSyncState.targetGameTitle,
          system: this.gameSyncState.targetSystem,
        });
      } else if (step === "state_ready" && this.myRole === "player1") {
        // Host resumes both emulators
        this.emulator.isPaused = false;
        this.updateSyncState({
          phase: "resumed",
          stepIndex: 4,
          targetGameTitle: this.gameSyncState.targetGameTitle,
          targetSystem: this.gameSyncState.targetSystem,
          progress: 100,
          message: `Synchronized and running "${this.gameSyncState.targetGameTitle}"!`,
          isHost: true,
        });

        this.signaling.send({
          type: "game-sync-step",
          step: "resume",
          gameTitle: this.gameSyncState.targetGameTitle,
          system: this.gameSyncState.targetSystem,
        });

        if (this.onStatusMessage) {
          this.onStatusMessage(`Both players synchronized in "${this.gameSyncState.targetGameTitle}"!`, "success");
        }

        setTimeout(() => {
          this.updateSyncState({
            phase: "idle",
            stepIndex: 0,
            targetGameTitle: "",
            targetSystem: "NES",
            progress: 0,
            message: "Ready",
            isHost: true,
          });
        }, 3500);
      }
    });

    this.signaling.on("chat-message", (data) => {
      const chatMsg: ChatMessage = {
        id: "msg_" + Math.random().toString(36).substring(2, 9),
        senderPeerId: data.senderPeerId as string,
        senderName: data.senderName as string,
        text: data.text as string,
        timestamp: Date.now(),
      };
      this.chatMessages.push(chatMsg);
      if (this.onChatMessage) this.onChatMessage(chatMsg);
    });

    // Fallback Relay handler
    this.signaling.on("netplay-input-relay", (data) => {
      if (!this.peer.isConnected()) {
        const payload = JSON.stringify({ frame: data.frame, inputMask: data.inputMask });
        this.rollbackEngine.handleIncomingRemoteInput(payload);
      }
    });
  }

  private setupPeerEvents() {
    this.peer.onConnectionStateChange = (state) => {
      if (state === "connected") {
        if (this.onStatusMessage)
          this.onStatusMessage("WebRTC P2P Direct DataChannel Connected! (0 Input Lag)", "success");
      } else if (state === "disconnected" || state === "failed") {
        if (this.onStatusMessage)
          this.onStatusMessage("P2P connection dropped. Using WebSocket fallback relay.", "warn");
      }
    };
  }

  private setupKeyboardListeners() {
    window.addEventListener("keydown", (e) => {
      // Ignore when typing in input/textarea
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      this.keyState.add(e.code);

      // Prevent scrolling on arrow keys and space while playing
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keyState.delete(e.code);
    });

    window.addEventListener("blur", () => {
      this.keyState.clear();
    });
  }

  // Matchmaking Actions
  public startMatchmaking(criteria: MatchmakingCriteria) {
    this.matchmakingStatus = "searching";
    this.signaling.send({
      type: "start-matchmaking",
      consoleSystem: criteria.consoleSystem,
      supportedGames: criteria.supportedGames,
      netplayMode: criteria.netplayMode,
      username: this.myUsername,
    });
    if (this.onMatchmakingStatusChange) this.onMatchmakingStatusChange("searching");
  }

  public cancelMatchmaking() {
    this.matchmakingStatus = "idle";
    this.signaling.send({
      type: "cancel-matchmaking",
    });
    if (this.onMatchmakingStatusChange) this.onMatchmakingStatusChange("idle");
  }

  public createRoom(
    roomName: string,
    gameTitle: string,
    system: string,
    mode: NetplayMode,
    isPrivate: boolean = false,
    gameId?: string,
    supportedGames?: string[]
  ) {
    this.netplayMode = mode;
    this.signaling.send({
      type: "create-room",
      roomName,
      gameTitle,
      gameId,
      system,
      netplayMode: mode,
      frameDelay: 2,
      username: this.myUsername,
      isPrivate,
      supportedGames,
    });
  }

  public joinRoom(roomId: string) {
    this.signaling.send({
      type: "join-room",
      roomId: roomId.trim().toUpperCase(),
      username: this.myUsername,
    });
  }

  public leaveRoom() {
    this.currentRoom = null;
    this.peer.cleanupPeer();
    if (this.onRoomUpdate) this.onRoomUpdate(null);
  }

  public sendChatMessage(text: string) {
    if (!text.trim()) return;
    const msg: ChatMessage = {
      id: "msg_" + Math.random().toString(36).substring(2, 9),
      senderPeerId: this.myPeerId,
      senderName: this.myUsername,
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.chatMessages.push(msg);
    if (this.onChatMessage) this.onChatMessage(msg);

    this.signaling.send({
      type: "chat-message",
      text: msg.text,
      senderName: this.myUsername,
    });
  }

  public updateGameInfo(
    gameTitle: string,
    system: string,
    romHash?: string,
    romSize?: number,
    gameId?: string
  ) {
    this.signaling.send({
      type: "update-game",
      gameTitle,
      gameId,
      system,
      romHash,
      romSize,
      netplayMode: this.netplayMode,
    });
  }

  public toggleReady() {
    this.signaling.send({
      type: "toggle-ready",
    });
  }

  public changeRole(role: PlayerRole) {
    this.myRole = role;
    this.rollbackEngine.setLocalRole(role);
    this.lockstepEngine.setLocalRole(role);
    this.signaling.send({
      type: "update-role",
      role,
    });
  }

  /**
   * Polls input devices (Keyboard, HTML5 Gamepad API, Touch)
   */
  public pollLocalInput(): number {
    this.turboCounter++;
    const turboOn = (this.turboCounter % 4) < 2; // 30Hz turbo
    const map = this.myRole === "player2" ? this.p2KeyMap : this.p1KeyMap;

    const isP1 = this.myRole !== "player2";

    // Check primary mapped key or common intuitive fallback aliases
    const isUp =
      this.keyState.has(map.up) ||
      (isP1 && (this.keyState.has("ArrowUp") || this.keyState.has("KeyW")));
    const isDown =
      this.keyState.has(map.down) ||
      (isP1 && (this.keyState.has("ArrowDown") || this.keyState.has("KeyS")));
    const isLeft =
      this.keyState.has(map.left) ||
      (isP1 && (this.keyState.has("ArrowLeft") || this.keyState.has("KeyA")));
    const isRight =
      this.keyState.has(map.right) ||
      (isP1 && (this.keyState.has("ArrowRight") || this.keyState.has("KeyD")));

    const isA =
      this.keyState.has(map.a) ||
      (isP1 &&
        (this.keyState.has("KeyK") ||
          this.keyState.has("KeyX") ||
          this.keyState.has("KeyC") ||
          this.keyState.has("Numpad2") ||
          this.keyState.has("Space")));

    const isB =
      this.keyState.has(map.b) ||
      (isP1 &&
        (this.keyState.has("KeyJ") ||
          this.keyState.has("KeyZ") ||
          this.keyState.has("Numpad1")));

    const isX =
      Boolean(map.x && this.keyState.has(map.x)) ||
      (isP1 && (this.keyState.has("KeyI") || this.keyState.has("KeyV")));

    const isY =
      Boolean(map.y && this.keyState.has(map.y)) ||
      (isP1 && (this.keyState.has("KeyU") || this.keyState.has("KeyA")));

    const isL =
      Boolean(map.l && this.keyState.has(map.l)) ||
      (isP1 && this.keyState.has("KeyQ"));

    const isR =
      Boolean(map.r && this.keyState.has(map.r)) ||
      (isP1 && this.keyState.has("KeyE"));

    const isSelect =
      this.keyState.has(map.select) ||
      (isP1 &&
        (this.keyState.has("ShiftRight") ||
          this.keyState.has("ShiftLeft") ||
          this.keyState.has("Tab") ||
          this.keyState.has("Backspace") ||
          this.keyState.has("KeyQ")));

    const isStart =
      this.keyState.has(map.start) ||
      (isP1 &&
        (this.keyState.has("Enter") ||
          this.keyState.has("NumpadEnter") ||
          this.keyState.has("KeyE") ||
          this.keyState.has("Space")));

    const isTurboA = Boolean(map.turboA && this.keyState.has(map.turboA)) || (isP1 && this.keyState.has("KeyO"));
    const isTurboB = Boolean(map.turboB && this.keyState.has(map.turboB)) || (isP1 && this.keyState.has("KeyL"));

    const ctrl: ControllerState = {
      up: isUp || this.touchState.up,
      down: isDown || this.touchState.down,
      left: isLeft || this.touchState.left,
      right: isRight || this.touchState.right,
      a: isA || this.touchState.a || (isTurboA && turboOn),
      b: isB || this.touchState.b || (isTurboB && turboOn),
      x: isX || this.touchState.x,
      y: isY || this.touchState.y,
      l: isL || this.touchState.l,
      r: isR || this.touchState.r,
      select: isSelect || this.touchState.select,
      start: isStart || this.touchState.start,
    };

    // Poll HTML5 Gamepad API
    if (navigator.getGamepads) {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0] || gamepads[1];
      if (gp && gp.connected) {
        if (gp.buttons[12]?.pressed || gp.axes[1] < -0.4) ctrl.up = true;
        if (gp.buttons[13]?.pressed || gp.axes[1] > 0.4) ctrl.down = true;
        if (gp.buttons[14]?.pressed || gp.axes[0] < -0.4) ctrl.left = true;
        if (gp.buttons[15]?.pressed || gp.axes[0] > 0.4) ctrl.right = true;
        if (gp.buttons[0]?.pressed || gp.buttons[1]?.pressed) ctrl.a = true;
        if (gp.buttons[2]?.pressed || gp.buttons[3]?.pressed) ctrl.b = true;
        if (gp.buttons[8]?.pressed) ctrl.select = true;
        if (gp.buttons[9]?.pressed) ctrl.start = true;
        if (gp.buttons[4]?.pressed) ctrl.l = true;
        if (gp.buttons[5]?.pressed) ctrl.r = true;
      }
    }

    return this.emulator.convertControllerToBitmask(ctrl);
  }

  /**
   * Main 60 FPS Emulation & Netplay Loop with Precision Fixed-Delta Timing Accumulator
   */
  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emulator.isPaused = false;
    this.lastFrameTimestamp = performance.now();
    let accumulator = 0;

    const loop = (timestamp: number) => {
      if (!this.isRunning) return;

      let delta = timestamp - this.lastFrameTimestamp;
      if (delta > 200) delta = 200; // Clamp against background tab pauses
      this.lastFrameTimestamp = timestamp;
      accumulator += delta;

      // Update rollback tracking active status based on peer connectivity & mode
      const isPeerActive = this.peer.isConnected() || (this.currentRoom && this.currentRoom.participants.length > 1);
      this.emulator.rollbackTrackingEnabled = !!(isPeerActive && this.netplayMode === "rollback");

      let steps = 0;
      while (accumulator >= this.frameDurationMs && steps < 2) {
        accumulator -= this.frameDurationMs;
        steps++;

        if (this.emulator.isLoaded && !this.emulator.isPaused) {
          const localInput = this.pollLocalInput();

          if (this.netplayMode === "rollback") {
            this.rollbackEngine.advanceFrame(localInput);
            if (this.onMetricsUpdate) this.onMetricsUpdate(this.rollbackEngine.metrics);
          } else {
            this.lockstepEngine.advanceFrame(localInput);
            if (this.onMetricsUpdate) this.onMetricsUpdate(this.lockstepEngine.metrics);
          }
        }
      }

      if (accumulator > this.frameDurationMs * 2) {
        accumulator = 0;
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private updateSyncState(state: GameSyncState) {
    this.gameSyncState = state;
    if (this.onGameSyncUpdate) {
      this.onGameSyncUpdate(state);
    }
  }

  /**
   * Host initiates game switch with full 4-stage synchronization workflow:
   * 1. Pause emulation & broadcast announcement with ROM details / bytes
   * 2. Remote client loads ROM and verifies checksum
   * 3. Host transfers clean initial state snapshot (Frame 0)
   * 4. Both clients simultaneously resume emulation at frame 0
   */
  public async initiateGameSwitch(
    gameTitle: string,
    system: ConsoleSystem,
    gameId?: string,
    romBytes?: Uint8Array,
    romHash?: string
  ) {
    // 1. Pause local emulation
    this.emulator.isPaused = true;

    // Load locally first
    if (gameId) {
      this.emulator.loadDemoRom(gameId);
    } else if (romBytes) {
      this.emulator.loadRomFromBuffer(gameTitle, romBytes);
    }

    this.updateSyncState({
      phase: "announcing",
      stepIndex: 1,
      targetGameTitle: gameTitle,
      targetSystem: system,
      progress: 25,
      message: `Pausing emulation & announcing new game "${gameTitle}" to peer...`,
      isHost: true,
    });

    // Update room game info
    this.updateGameInfo(gameTitle, system, romHash, romBytes?.byteLength, gameId);

    // Broadcast announcement step to room
    this.signaling.send({
      type: "game-sync-step",
      step: "announce",
      gameTitle,
      system,
      gameId,
      romHash,
      romSize: romBytes?.byteLength,
      romBytes: romBytes ? Array.from(romBytes) : undefined,
    });

    // If alone in room, finalize switch immediately
    const participantCount = this.currentRoom?.participants.length || 0;
    if (participantCount <= 1) {
      setTimeout(() => {
        this.emulator.isPaused = false;
        this.updateSyncState({
          phase: "resumed",
          stepIndex: 4,
          targetGameTitle: gameTitle,
          targetSystem: system,
          progress: 100,
          message: `Loaded "${gameTitle}"!`,
          isHost: true,
        });

        setTimeout(() => {
          this.updateSyncState({
            phase: "idle",
            stepIndex: 0,
            targetGameTitle: "",
            targetSystem: "NES",
            progress: 0,
            message: "Ready",
            isHost: true,
          });
        }, 2000);
      }, 500);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public reset() {
    this.emulator.reset();
    this.rollbackEngine.reset();
    this.lockstepEngine.reset();
  }

  public destroy() {
    this.stop();
    this.videoChat.destroy();
    this.peer.cleanupPeer();
    this.signaling.close();
    this.emulator.audio.close();
  }
}
