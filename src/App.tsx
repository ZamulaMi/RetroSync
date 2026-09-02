/**
 * Retro ROM Emulator & WebRTC Rollback Netplay Application
 */

import React, { useEffect, useMemo, useState } from "react";
import { NetplayController, GameSyncState } from "./netplay/netplayController";
import { Header } from "./components/Header";
import { EmulatorView } from "./components/EmulatorView";
import { NetplayHUD } from "./components/NetplayHUD";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { ControlsModal } from "./components/ControlsModal";
import { ArchitectureModal } from "./components/ArchitectureModal";
import { GameMenuModal } from "./components/GameMenuModal";
import {
  ChatMessage,
  ConsoleSystem,
  DemoROM,
  GamepadButtonMap,
  GamePlayMode,
  MatchmakingCriteria,
  MatchmakingStatus,
  NetplayMetrics,
  NetplayMode,
  PlayerRole,
  RoomInfo,
  ScreenFilter,
} from "./types";
import { DEMO_ROMS } from "./emulator/demoRoms";

export default function App() {
  const controller = useMemo(() => new NetplayController(), []);

  // Primary Gameplay Mode: "local_2p" (1 PC, 2 separate controls) or "online" (random or friend room)
  const [gamePlayMode, setGamePlayMode] = useState<GamePlayMode>("local_2p");

  // Application State
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [myRole, setMyRole] = useState<PlayerRole>("player1");
  const [myUsername, setMyUsername] = useState<string>("Player 1");
  const [netplayMode, setNetplayMode] = useState<NetplayMode>("rollback");
  const [system, setSystem] = useState<ConsoleSystem>("NES");
  const [gameTitle, setGameTitle] = useState<string>("Retro 2P Combat Arena (NES)");
  const [screenFilter, setScreenFilter] = useState<ScreenFilter>("pixel-perfect");
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeSaveSlot, setActiveSaveSlot] = useState<number>(1);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [p2pConnected, setP2pConnected] = useState<boolean>(false);
  const [matchmakingStatus, setMatchmakingStatus] = useState<MatchmakingStatus>("idle");

  // Game Resynchronization Workflow State
  const [syncState, setSyncState] = useState<GameSyncState>({
    phase: "idle",
    stepIndex: 0,
    targetGameTitle: "",
    targetSystem: "NES",
    progress: 0,
    message: "Ready",
    isHost: true,
  });

  // Keymaps
  const [p1KeyMap, setP1KeyMap] = useState<GamepadButtonMap>(controller.p1KeyMap);
  const [p2KeyMap, setP2KeyMap] = useState<GamepadButtonMap>(controller.p2KeyMap);

  // Modals
  const [showControlsModal, setShowControlsModal] = useState<boolean>(false);
  const [showArchModal, setShowArchModal] = useState<boolean>(false);
  const [showMenuModal, setShowMenuModal] = useState<boolean>(false);

  // Metrics
  const [metrics, setMetrics] = useState<NetplayMetrics>({
    ping: 0,
    jitter: 0,
    packetLoss: 0,
    rollbacksPerSec: 0,
    maxRollbackFrames: 0,
    localFrame: 0,
    remoteFrame: 0,
    frameAdvantage: 0,
    desyncCount: 0,
    p2pConnected: false,
    connectionType: "local",
  });

  // Setup callbacks
  useEffect(() => {
    controller.onRoomUpdate = (updatedRoom) => {
      if (updatedRoom) {
        setRoom({ ...updatedRoom });
        setMyRole(controller.myRole);
        setGameTitle(updatedRoom.gameTitle);
        setSystem(updatedRoom.system);
        setNetplayMode(updatedRoom.netplayMode);
      } else {
        setRoom(null);
      }
    };

    controller.onChatMessage = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    controller.onMetricsUpdate = (newMetrics) => {
      setMetrics({ ...newMetrics });
      setP2pConnected(newMetrics.p2pConnected);
    };

    controller.onMatchmakingStatusChange = (status) => {
      setMatchmakingStatus(status);
    };

    controller.onGameSyncUpdate = (newSyncState) => {
      setSyncState({ ...newSyncState });
      if (newSyncState.targetGameTitle) {
        setGameTitle(newSyncState.targetGameTitle);
      }
      if (newSyncState.targetSystem) {
        setSystem(newSyncState.targetSystem as ConsoleSystem);
      }
    };

    // Load initial 2-player demo ROM
    controller.emulator.loadDemoRom("nes-netplay-arena-2p");

    // Check URL parameters for direct room join: ?room=XYZ
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get("room");
    if (roomParam) {
      setGamePlayMode("online");
      controller.gamePlayMode = "online";
      setTimeout(() => {
        controller.joinRoom(roomParam);
      }, 500);
    }

    return () => {
      controller.destroy();
    };
  }, [controller]);

  // Sync username changes to controller
  useEffect(() => {
    controller.myUsername = myUsername;
  }, [controller, myUsername]);

  // Volume & Audio handlers
  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    controller.emulator.audio.setVolume(vol);
    if (isMuted && vol > 0) {
      setIsMuted(false);
      controller.emulator.audio.setMute(false);
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    controller.emulator.audio.setMute(nextMute);
  };

  const handleToggleFullscreen = () => {
    const el = document.getElementById("app-root-container") || document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // ROM Loading & Switching handlers
  const handleLoadRomBytes = (fileName: string, bytes: Uint8Array, hash: string, sys: ConsoleSystem) => {
    const success = controller.emulator.loadRomFromBuffer(fileName, bytes);
    if (success) {
      setSystem(sys);
      setGameTitle(fileName);
      controller.updateGameInfo(fileName, sys, hash, bytes.byteLength);
    }
  };

  const handleLoadDemoRom = (demo: DemoROM) => {
    const success = controller.emulator.loadDemoRom(demo.id);
    if (success) {
      setSystem(demo.system);
      setGameTitle(demo.title);
      controller.updateGameInfo(demo.title, demo.system, undefined, undefined, demo.id);
    }
  };

  const handleInitiateGameSwitch = (
    newTitle: string,
    newSys: ConsoleSystem,
    gameId?: string,
    romBytes?: Uint8Array,
    romHash?: string
  ) => {
    controller.initiateGameSwitch(newTitle, newSys, gameId, romBytes, romHash);
  };

  // Save State handlers
  const handleSaveState = (slot: number) => {
    controller.emulator.createSaveState(slot);
  };

  const handleLoadState = (slot: number) => {
    controller.emulator.loadSaveState(slot);
  };

  // Mode switcher handler
  const handleSelectGamePlayMode = (mode: GamePlayMode) => {
    setGamePlayMode(mode);
    controller.gamePlayMode = mode;
  };

  // Netplay Actions
  const handleCreateRoom = (
    name: string,
    mode: NetplayMode,
    isPrivate: boolean,
    selectedSystem: ConsoleSystem,
    title: string,
    gameId?: string,
    supportedGames?: string[]
  ) => {
    setGamePlayMode("online");
    controller.gamePlayMode = "online";
    controller.createRoom(
      name,
      title || gameTitle,
      selectedSystem || system,
      mode,
      isPrivate,
      gameId,
      supportedGames
    );
  };

  const handleJoinRoom = (roomId: string) => {
    setGamePlayMode("online");
    controller.gamePlayMode = "online";
    controller.joinRoom(roomId);
  };

  const handleLeaveRoom = () => {
    controller.leaveRoom();
  };

  const handleStartMatchmaking = (criteria: MatchmakingCriteria) => {
    setGamePlayMode("online");
    controller.gamePlayMode = "online";
    controller.startMatchmaking(criteria);
  };

  const handleCancelMatchmaking = () => {
    controller.cancelMatchmaking();
  };

  const handleChangeRole = (role: PlayerRole) => {
    controller.changeRole(role);
  };

  const handleToggleReady = () => {
    controller.toggleReady();
  };

  const handleSendMessage = (text: string) => {
    controller.sendChatMessage(text);
  };

  const handleUpdateP1KeyMap = (map: GamepadButtonMap) => {
    setP1KeyMap(map);
    controller.p1KeyMap = map;
  };

  const handleUpdateP2KeyMap = (map: GamepadButtonMap) => {
    setP2KeyMap(map);
    controller.p2KeyMap = map;
  };

  return (
    <div
      id="app-root-container"
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white"
    >
      {/* Top Header */}
      <Header
        gamePlayMode={gamePlayMode}
        onSelectGamePlayMode={handleSelectGamePlayMode}
        room={room}
        volume={volume}
        isMuted={isMuted}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        filter={screenFilter}
        onFilterChange={setScreenFilter}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenControls={() => setShowControlsModal(true)}
        onOpenArchitecture={() => setShowArchModal(true)}
        p2pConnected={p2pConnected}
      />

      {/* Main 3-Column Workspace Layout */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT DYNAMIC SIDE PANEL: ROM Library & Host Game Change / Resync Protocol */}
        <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-4 order-2 lg:order-1">
          <LeftPanel
            room={room}
            myRole={myRole}
            currentTitle={gameTitle}
            currentSystem={system}
            syncState={syncState}
            onLoadRomBytes={handleLoadRomBytes}
            onInitiateGameSwitch={handleInitiateGameSwitch}
            onOpenMenu={() => {
              controller.emulator.isPaused = true;
              setShowMenuModal(true);
            }}
          />
        </div>

        {/* CENTRAL AREA: Dedicated Emulator <canvas> Screen & Live Netplay Telemetry */}
        <div className="lg:col-span-6 xl:col-span-6 flex flex-col gap-4 order-1 lg:order-2">
          <EmulatorView
            controller={controller}
            system={system}
            currentTitle={gameTitle}
            filter={screenFilter}
            onSaveState={handleSaveState}
            onLoadState={handleLoadState}
            activeSaveSlot={activeSaveSlot}
            setActiveSaveSlot={setActiveSaveSlot}
            onOpenMenu={() => setShowMenuModal(true)}
          />

          <NetplayHUD
            metrics={metrics}
            mode={netplayMode}
            localRole={myRole}
            onForceResync={() => {
              if (myRole === "player2") {
                controller.peer.sendStatePacket({ type: "request-full-state-sync" });
              }
            }}
          />
        </div>

        {/* RIGHT DYNAMIC SIDE PANEL: Player Status, WebRTC Voice/Video Chat & Netplay Controls */}
        <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-4 order-3 lg:order-3">
          <RightPanel
            gamePlayMode={gamePlayMode}
            setGamePlayMode={handleSelectGamePlayMode}
            controller={controller}
            p1KeyMap={p1KeyMap}
            p2KeyMap={p2KeyMap}
            onOpenControls={() => setShowControlsModal(true)}
            room={room}
            videoChat={controller.videoChat}
            myPeerId={controller.myPeerId}
            myRole={myRole}
            myUsername={myUsername}
            setMyUsername={setMyUsername}
            netplayMode={netplayMode}
            setNetplayMode={setNetplayMode}
            metrics={metrics}
            matchmakingStatus={matchmakingStatus}
            chatMessages={chatMessages}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onLeaveRoom={handleLeaveRoom}
            onStartMatchmaking={handleStartMatchmaking}
            onCancelMatchmaking={handleCancelMatchmaking}
            onChangeRole={handleChangeRole}
            onToggleReady={handleToggleReady}
            onSendMessage={handleSendMessage}
            onForceResync={() => {
              if (myRole === "player2") {
                controller.peer.sendStatePacket({ type: "request-full-state-sync" });
              }
            }}
          />
        </div>
      </main>

      {/* Controller & Keymapping Modal */}
      <ControlsModal
        isOpen={showControlsModal}
        onClose={() => setShowControlsModal(false)}
        p1KeyMap={p1KeyMap}
        p2KeyMap={p2KeyMap}
        onUpdateP1KeyMap={handleUpdateP1KeyMap}
        onUpdateP2KeyMap={handleUpdateP2KeyMap}
      />

      {/* In-Game Main Menu / Game Selector Modal */}
      <GameMenuModal
        isOpen={showMenuModal}
        onClose={() => {
          setShowMenuModal(false);
          controller.emulator.isPaused = false;
        }}
        currentGameTitle={gameTitle}
        currentSystem={system}
        activeSaveSlot={activeSaveSlot}
        setActiveSaveSlot={setActiveSaveSlot}
        onSaveState={handleSaveState}
        onLoadState={handleLoadState}
        onRestartGame={() => {
          controller.reset();
        }}
        onLoadRomBytes={handleLoadRomBytes}
        onOpenControls={() => setShowControlsModal(true)}
        filter={screenFilter}
        onFilterChange={setScreenFilter}
        volume={volume}
        isMuted={isMuted}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
      />

      {/* Netplay Architecture Specification Modal */}
      <ArchitectureModal
        isOpen={showArchModal}
        onClose={() => setShowArchModal(false)}
      />
    </div>
  );
}

