import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  LogIn,
  Copy,
  Check,
  Send,
  UserCheck,
  Crown,
  Eye,
  Settings2,
  Share2,
  Zap,
  Radio,
  Lock,
  Globe,
  Loader2,
  Gamepad2,
  LogOut,
  Sparkles,
  Link,
  Hash,
  KeyRound,
  Edit3,
  Clipboard,
} from "lucide-react";
import {
  ChatMessage,
  ConsoleSystem,
  GamepadButtonMap,
  GamePlayMode,
  MatchmakingCriteria,
  MatchmakingStatus,
  NetplayMetrics,
  NetplayMode,
  PlayerRole,
  RoomInfo,
} from "../types";
import { DEMO_ROMS } from "../emulator/demoRoms";
import { PlayerStatus } from "./PlayerStatus";
import { VoiceVideoChat } from "./VoiceVideoChat";
import { WebRTCVideoChat } from "../netplay/videoChat";
import { Local2PlayerPanel } from "./Local2PlayerPanel";
import { NetplayController } from "../netplay/netplayController";
import {
  parseRoomIdentifier,
  buildRoomShareUrl,
  detectRoomIdentifierType,
} from "../utils/roomUtils";

const PRESET_GAMES_BY_SYSTEM: Record<ConsoleSystem, Array<{ id: string; title: string }>> = {
  NES: [
    { id: "nes-battle-city", title: "Battle City (1985)" },
    { id: "nes-super-mario", title: "Super Mario Bros" },
    { id: "nes-netplay-arena-2p", title: "Retro 2P Combat Arena (NES)" },
    { id: "nes-pong-duel", title: "Hyper Pong Championship (NES)" },
  ],
  SNES: [
    { id: "snes-super-strike", title: "Super Famicom 16-Bit Battle (SNES)" },
  ],
  GBA: [
    { id: "gba-micro-combat", title: "GBA 32-Bit Dual Strike (GBA)" },
  ],
  GB: [
    { id: "gb-link-battle", title: "Game Boy Link Duel (GB)" },
  ],
  GBC: [
    { id: "gb-link-battle", title: "Game Boy Link Duel (GB)" },
  ],
};

interface RightPanelProps {
  gamePlayMode: GamePlayMode;
  setGamePlayMode: (mode: GamePlayMode) => void;
  controller: NetplayController;
  p1KeyMap: GamepadButtonMap;
  p2KeyMap: GamepadButtonMap;
  onOpenControls: () => void;
  room: RoomInfo | null;
  videoChat: WebRTCVideoChat;
  myPeerId: string;
  myRole: PlayerRole;
  myUsername: string;
  setMyUsername: (name: string) => void;
  netplayMode: NetplayMode;
  setNetplayMode: (mode: NetplayMode) => void;
  metrics: NetplayMetrics;
  currentSystem?: ConsoleSystem;
  currentGameTitle?: string;
  matchmakingStatus: MatchmakingStatus;
  chatMessages: ChatMessage[];
  onCreateRoom: (
    name: string,
    mode: NetplayMode,
    isPrivate: boolean,
    system: ConsoleSystem,
    gameTitle: string,
    gameId?: string,
    supportedGames?: string[]
  ) => void;
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: () => void;
  onStartMatchmaking: (criteria: MatchmakingCriteria) => void;
  onCancelMatchmaking: () => void;
  onChangeRole: (role: PlayerRole) => void;
  onToggleReady: () => void;
  onSendMessage: (text: string) => void;
  onForceResync: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  gamePlayMode,
  setGamePlayMode,
  controller,
  p1KeyMap,
  p2KeyMap,
  onOpenControls,
  room,
  videoChat,
  myPeerId,
  myRole,
  myUsername,
  setMyUsername,
  netplayMode,
  setNetplayMode,
  metrics,
  currentSystem = "NES",
  currentGameTitle,
  matchmakingStatus,
  chatMessages,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onStartMatchmaking,
  onCancelMatchmaking,
  onChangeRole,
  onToggleReady,
  onSendMessage,
  onForceResync,
}) => {
  // Online Hub Sub-tabs: "room" (Create/Join specific room) or "matchmaking" (Random Queue)
  const [onlineTab, setOnlineTab] = useState<"room" | "matchmaking">("room");
  const [roomActionTab, setRoomActionTab] = useState<"create" | "join">("create");

  // Two separate fields for joining by code or number
  const [joinCode, setJoinCode] = useState("");
  const [joinNumber, setJoinNumber] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  // In-room configuration (selected later)
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState("");
  const [roomSystemChoice, setRoomSystemChoice] = useState<ConsoleSystem>((currentSystem as ConsoleSystem) || "NES");
  const [roomGameChoice, setRoomGameChoice] = useState<string>(
    PRESET_GAMES_BY_SYSTEM[(currentSystem as ConsoleSystem) || "NES"]?.[0]?.id || "nes-netplay-arena-2p"
  );
  const [roomCustomGameTitle, setRoomCustomGameTitle] = useState("");
  const [gameSyncedFeedback, setGameSyncedFeedback] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Sync state when room updates
  useEffect(() => {
    if (room) {
      setRoomNameInput(room.name);
      setRoomSystemChoice((room.system as ConsoleSystem) || "NES");
      if (room.gameId) {
        setRoomGameChoice(room.gameId);
      }
    }
  }, [room?.name, room?.system, room?.gameId]);

  // When room system changes, reset default game choice if not in list
  useEffect(() => {
    const list = PRESET_GAMES_BY_SYSTEM[roomSystemChoice];
    if (list && list.length > 0 && roomGameChoice !== "custom") {
      const exists = list.some((g) => g.id === roomGameChoice);
      if (!exists) {
        setRoomGameChoice(list[0].id);
      }
    }
  }, [roomSystemChoice]);

  // Quick Room Creation without asking for console, game, or name upfront
  const handleQuickCreateRoom = () => {
    const defaultRoomName = `Кімната ${myUsername}`;
    const defaultSystem: ConsoleSystem = (currentSystem as ConsoleSystem) || "NES";
    const defaultGameTitle = currentGameTitle || "Retro 2P Combat Arena (NES)";
    const defaultGameId = "nes-netplay-arena-2p";

    onCreateRoom(
      defaultRoomName,
      netplayMode,
      false,
      defaultSystem,
      defaultGameTitle,
      defaultGameId
    );
  };

  // In-session room name save
  const handleSaveRoomName = () => {
    const trimmed = roomNameInput.trim();
    if (!trimmed || !room) {
      setIsEditingRoomName(false);
      return;
    }
    controller.updateGameInfo(
      room.gameTitle,
      room.system,
      room.romHash,
      room.romSize,
      room.gameId,
      trimmed
    );
    setIsEditingRoomName(false);
  };

  // In-session game & console apply (synchronizes to all players)
  const handleApplyRoomGame = () => {
    if (!room) return;
    let finalTitle = "";
    let finalId: string | undefined = undefined;

    if (roomGameChoice === "custom") {
      finalTitle = roomCustomGameTitle.trim() || `Retro 2P (${roomSystemChoice})`;
    } else {
      const preset = PRESET_GAMES_BY_SYSTEM[roomSystemChoice]?.find((g) => g.id === roomGameChoice);
      const demo = DEMO_ROMS.find((d) => d.id === roomGameChoice);
      finalTitle = preset?.title || demo?.title || `Retro Game (${roomSystemChoice})`;
      finalId = roomGameChoice;
    }

    controller.updateGameInfo(
      finalTitle,
      roomSystemChoice,
      undefined,
      undefined,
      finalId,
      room.name
    );

    setGameSyncedFeedback(true);
    setTimeout(() => setGameSyncedFeedback(false), 2500);
  };

  // Matchmaking state
  const [mmSystem, setMmSystem] = useState<ConsoleSystem | "ANY">("ANY");
  const [searchTimerSeconds, setSearchTimerSeconds] = useState(0);

  useEffect(() => {
    let interval: number | null = null;
    if (matchmakingStatus === "searching") {
      setSearchTimerSeconds(0);
      interval = window.setInterval(() => {
        setSearchTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setSearchTimerSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [matchmakingStatus]);

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.id);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyNumber = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.roomNumber || room.id);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const [smartJoinInput, setSmartJoinInput] = useState("");

  const handleCopyInviteLink = () => {
    if (!room) return;
    const url = buildRoomShareUrl(room.id, room.roomNumber);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (!room) return;
    const url = buildRoomShareUrl(room.id, room.roomNumber);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Retro Netplay Room #${room.roomNumber || room.id}`,
          text: `Приєднуйся до гри "${room.gameTitle}"! Консоль: ${room.system}, Код: ${room.id}`,
          url,
        });
      } catch {
        handleCopyInviteLink();
      }
    } else {
      handleCopyInviteLink();
    }
  };

  const handlePasteJoinFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setSmartJoinInput(text);
          const parsed = parseRoomIdentifier(text);
          if (parsed) {
            setJoinError(null);
          }
        }
      }
    } catch {
      setJoinError("Не вдалося отримати текст з буфера. Вставте за допомогою Ctrl+V");
    }
  };

  const handleJoinByCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setJoinError(null);
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Введіть 4-значний код кімнати (напр. BC85).");
      return;
    }
    const parsed = parseRoomIdentifier(code) || code;
    onJoinRoom(parsed);
  };

  const handleJoinByNumber = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setJoinError(null);
    const num = joinNumber.trim();
    if (!num) {
      setJoinError("Введіть 6-значний номер кімнати (напр. 852401).");
      return;
    }
    const parsed = parseRoomIdentifier(num) || num;
    onJoinRoom(parsed);
  };

  const handleJoinByLink = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setJoinError(null);
    const text = smartJoinInput.trim();
    if (!text) {
      setJoinError("Вставте посилання або номер кімнати.");
      return;
    }
    const parsed = parseRoomIdentifier(text) || text;
    onJoinRoom(parsed);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    if (joinCode.trim()) {
      handleJoinByCode();
      return;
    }
    if (joinNumber.trim()) {
      handleJoinByNumber();
      return;
    }
    if (smartJoinInput.trim()) {
      handleJoinByLink();
      return;
    }

    setJoinError("Введіть код кімнати (напр. BC85) або номер (напр. 852401).");
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput.trim());
    setChatInput("");
  };

  // Find other participant for AV chat
  const opponent = room?.participants.find((p) => p.peerId !== myPeerId);

  return (
    <aside id="right-sidebar-panel" className="w-full flex flex-col gap-3.5">
      {/* PRIMARY MODE SWITCHER TABS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 shadow-xl">
        <div className="grid grid-cols-2 gap-1 text-xs font-bold">
          <button
            id="tab-mode-local-2p"
            onClick={() => setGamePlayMode("local_2p")}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              gamePlayMode === "local_2p"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1 ПК (2 гравці)</span>
          </button>
          <button
            id="tab-mode-online"
            onClick={() => setGamePlayMode("online")}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              gamePlayMode === "online"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Онлайн гра</span>
          </button>
        </div>
      </div>

      {/* MODE 1: LOCAL 2-PLAYER ON SAME PC */}
      {gamePlayMode === "local_2p" && (
        <Local2PlayerPanel
          controller={controller}
          p1KeyMap={p1KeyMap}
          p2KeyMap={p2KeyMap}
          onOpenControls={onOpenControls}
        />
      )}

      {/* MODE 2: ONLINE MULTIPLAYER */}
      {gamePlayMode === "online" && (
        <div className="flex flex-col gap-3.5">
          {/* If in an Active Online Room, show Status, AV Chat & Session Info */}
          {room ? (
            <>
              {/* Active Room Code & Share Banner */}
              <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-3 shadow-xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider block">
                      Активна кімната:
                    </span>
                    {isEditingRoomName ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <input
                          type="text"
                          value={roomNameInput}
                          onChange={(e) => setRoomNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRoomName();
                            if (e.key === "Escape") setIsEditingRoomName(false);
                          }}
                          className="bg-slate-950 border border-indigo-500 rounded px-2 py-0.5 text-xs text-white font-bold focus:outline-none flex-1 max-w-[170px]"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleSaveRoomName}
                          className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                          title="Зберегти назву"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <h2 className="text-sm font-extrabold text-white truncate max-w-[170px]">
                          {room.name}
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            setRoomNameInput(room.name);
                            setIsEditingRoomName(true);
                          }}
                          className="p-0.5 text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
                          title="Змінити назву кімнати"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {/* Console & Game indicators */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-500/50 text-indigo-300 font-bold font-mono text-[10px] shrink-0">
                        {room.system}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-emerald-300 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 truncate max-w-[210px]">
                        <Gamepad2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate">{room.gameTitle}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    id="leave-room-button"
                    onClick={onLeaveRoom}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-[11px] font-semibold transition-all cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Вийти
                  </button>
                </div>

                {/* Room Code & Number Cards with 1-click Copy */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      Код кімнати:
                    </span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-mono text-base font-extrabold text-amber-400 tracking-widest">
                        {room.id}
                      </span>
                      <button
                        id="copy-room-code-btn"
                        onClick={handleCopyCode}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                        title="Скопіювати код"
                      >
                        {copiedCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      Номер кімнати:
                    </span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-mono text-base font-extrabold text-indigo-300 tracking-wider">
                        #{room.roomNumber || room.id}
                      </span>
                      <button
                        id="copy-room-number-btn"
                        onClick={handleCopyNumber}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                        title="Скопіювати номер"
                      >
                        {copiedNumber ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Hash className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 1-Click Copy Direct Link & Share */}
                <div className="flex items-center gap-2">
                  <button
                    id="copy-direct-invite-link-btn"
                    onClick={handleCopyInviteLink}
                    className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" /> Посилання скопійовано!
                      </>
                    ) : (
                      <>
                        <Link className="w-3.5 h-3.5" /> Скопіювати посилання
                      </>
                    )}
                  </button>

                  <button
                    id="share-room-button"
                    onClick={handleShare}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                    title="Поділитися кімнатою"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* In-Room Console & Game Selection (Chosen later inside room) */}
              <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-3 shadow-xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Gamepad2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Консоль та гра кімнати
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {room.system} • {room.participants.length} грав.
                  </span>
                </div>

                {/* 1. Консоль */}
                <div>
                  <label className="text-[11px] text-slate-300 font-bold block mb-1">
                    1. Консоль (платформа):
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["NES", "SNES", "GBA", "GB"] as const).map((sys) => (
                      <button
                        key={sys}
                        type="button"
                        onClick={() => {
                          setRoomSystemChoice(sys);
                          const games = PRESET_GAMES_BY_SYSTEM[sys];
                          if (games && games.length > 0) {
                            setRoomGameChoice(games[0].id);
                          }
                        }}
                        className={`py-1.5 rounded-lg font-mono font-bold text-xs border transition-all cursor-pointer ${
                          roomSystemChoice === sys
                            ? "bg-indigo-600 border-indigo-400 text-white shadow-sm"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        {sys}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Гра */}
                <div>
                  <label className="text-[11px] text-slate-300 font-bold block mb-1">
                    2. Гра:
                  </label>
                  <select
                    value={roomGameChoice}
                    onChange={(e) => setRoomGameChoice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {(PRESET_GAMES_BY_SYSTEM[roomSystemChoice] || []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                    <option value="custom">✏️ Власна назва гри...</option>
                  </select>

                  {roomGameChoice === "custom" && (
                    <input
                      type="text"
                      value={roomCustomGameTitle}
                      onChange={(e) => setRoomCustomGameTitle(e.target.value)}
                      placeholder="Введіть назву гри..."
                      className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>

                {/* Застосувати для обох гравців */}
                <button
                  type="button"
                  id="apply-room-game-btn"
                  onClick={handleApplyRoomGame}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {gameSyncedFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" /> Синхронізовано для обох гравців!
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Застосувати гру для кімнати
                    </>
                  )}
                </button>
              </div>

              {/* 1. Player Status Panel */}
              <PlayerStatus
                room={room}
                metrics={metrics}
                myRole={myRole}
                myUsername={myUsername}
                netplayMode={netplayMode}
                onForceResync={onForceResync}
              />

              {/* 2. WebRTC Voice & Video Chat */}
              <VoiceVideoChat
                videoChat={videoChat}
                room={room}
                myRole={myRole}
                myUsername={myUsername}
                opponentPeerId={opponent?.peerId}
                opponentName={
                  opponent?.username || (myRole === "player1" ? "Player 2" : "Player 1")
                }
              />

              {/* 3. In-Room Live Chat Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Чат кімнати:
                </span>
                <div className="h-28 bg-slate-950/70 border border-slate-800 rounded-lg p-2 overflow-y-auto flex flex-col gap-1.5 text-xs">
                  {chatMessages.length === 0 ? (
                    <span className="text-[11px] text-slate-500 italic my-auto text-center">
                      Повідомлень немає. Напишіть щось супернику!
                    </span>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="leading-tight">
                        <span className="font-semibold text-indigo-400 text-[11px]">
                          {msg.senderName}:{" "}
                        </span>
                        <span className="text-slate-200 text-[11px]">{msg.text}</span>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendChat} className="flex gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Повідомлення..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* Not in room: Online Matchmaking & Specific Room Hub */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-xl flex flex-col gap-3">
              {/* Header with Username Edit */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Онлайн лобі</h3>
                    <span className="text-[10px] text-slate-400">
                      Рандомний підбір або окрема кімната
                    </span>
                  </div>
                </div>

                {/* Nickname */}
                <input
                  type="text"
                  value={myUsername}
                  onChange={(e) => setMyUsername(e.target.value.slice(0, 16))}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-slate-200 w-24 text-right focus:outline-none focus:border-indigo-500"
                  placeholder="Нікнейм"
                  title="Ваш ігровий нікнейм"
                />
              </div>

              {/* Sub-tabs: Create/Join Room vs Random Matchmaking */}
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  id="tab-online-room"
                  onClick={() => setOnlineTab("room")}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    onlineTab === "room"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Кімната</span>
                </button>
                <button
                  id="tab-online-random"
                  onClick={() => setOnlineTab("matchmaking")}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    onlineTab === "matchmaking"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Швидкий підбір</span>
                </button>
              </div>

              {/* TAB 1: SPECIFIC PLAYER ROOM (CREATE OR JOIN) */}
              {onlineTab === "room" && (
                <div className="flex flex-col gap-3">
                  {/* Create vs Join selector */}
                  <div className="flex border-b border-slate-800">
                    <button
                      onClick={() => setRoomActionTab("create")}
                      className={`flex-1 py-1.5 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
                        roomActionTab === "create"
                          ? "border-indigo-500 text-indigo-300 bg-indigo-500/10"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Створити кімнату
                    </button>
                    <button
                      onClick={() => setRoomActionTab("join")}
                      className={`flex-1 py-1.5 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
                        roomActionTab === "join"
                          ? "border-emerald-500 text-emerald-300 bg-emerald-500/10"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Увійти в кімнату
                    </button>
                  </div>

                  {/* Sub-form: Create Room */}
                  {roomActionTab === "create" && (
                    <div className="flex flex-col gap-3">
                      <div className="p-4 bg-gradient-to-b from-indigo-950/40 to-slate-950 border border-indigo-500/30 rounded-xl flex flex-col items-center text-center gap-3 shadow-inner">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-md">
                          <Sparkles className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-white">Швидке створення кімнати</h4>
                          <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-xs">
                            Створіть кімнату в 1 клік та отримайте 4-значний код і 6-значний номер для запрошення другого гравця.
                          </p>
                        </div>

                        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-[11px] text-slate-400 flex items-start gap-2 text-left">
                          <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">
                            Консоль (NES, SNES, GBA, GB), гру та назву кімнати ви зможете обрати після створення прямо в сесії кімнати.
                          </span>
                        </div>

                        <button
                          type="button"
                          id="quick-create-room-button"
                          onClick={handleQuickCreateRoom}
                          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                        >
                          <Plus className="w-4 h-4" /> Створити кімнату
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sub-form: Join by Code and Room Number (TWO SEPARATE, DIRECT FIELDS) */}
                  {roomActionTab === "join" && (
                    <div className="flex flex-col gap-3">
                      {joinError && (
                        <div className="p-2 bg-rose-950/60 border border-rose-500/50 rounded-lg text-rose-300 text-[11px] flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>{joinError}</span>
                        </div>
                      )}

                      {/* FIELD 1: ROOM CODE (4 LETTERS) */}
                      <form onSubmit={handleJoinByCode} className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-xl p-3 flex flex-col gap-2 transition-colors">
                        <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Код кімнати (4 літери):</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => {
                              setJoinError(null);
                              setJoinCode(e.target.value.trim().toUpperCase());
                            }}
                            placeholder="напр. BC85"
                            maxLength={8}
                            className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-mono font-bold text-amber-400 uppercase tracking-widest focus:outline-none placeholder:text-slate-600"
                          />
                          <button
                            type="submit"
                            id="join-room-by-code-btn"
                            className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <LogIn className="w-3.5 h-3.5" /> Увійти
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Введіть 4-значний літерний код кімнати
                        </span>
                      </form>

                      {/* FIELD 2: ROOM NUMBER (6 DIGITS) */}
                      <form onSubmit={handleJoinByNumber} className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-3 flex flex-col gap-2 transition-colors">
                        <label className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Номер кімнати (6 цифр):</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={joinNumber}
                            onChange={(e) => {
                              setJoinError(null);
                              setJoinNumber(e.target.value.replace(/\D/g, "").slice(0, 6));
                            }}
                            placeholder="напр. 852401"
                            maxLength={6}
                            className="flex-1 bg-slate-950 border border-slate-700 focus:border-indigo-400 rounded-lg px-3 py-2 text-xs font-mono font-bold text-indigo-300 tracking-widest focus:outline-none placeholder:text-slate-600"
                          />
                          <button
                            type="submit"
                            id="join-room-by-number-btn"
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <LogIn className="w-3.5 h-3.5" /> Увійти
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Введіть числовий 6-значний номер кімнати
                        </span>
                      </form>

                      {/* OPTIONAL FIELD 3: LINK OR CLIPBOARD */}
                      <details className="text-[11px] text-slate-400 group">
                        <summary className="cursor-pointer hover:text-slate-300 select-none flex items-center justify-between py-1 px-1">
                          <span className="flex items-center gap-1">
                            <Link className="w-3 h-3 text-emerald-400" />
                            <span>Або вставити посилання на кімнату</span>
                          </span>
                          <span className="text-slate-500 text-[10px] group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <form onSubmit={handleJoinByLink} className="flex flex-col gap-2 pt-2 border-t border-slate-800/80 mt-1">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={smartJoinInput}
                              onChange={(e) => {
                                setJoinError(null);
                                setSmartJoinInput(e.target.value);
                              }}
                              placeholder="Вставте повне посилання..."
                              className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handlePasteJoinFromClipboard}
                              className="text-[10px] text-indigo-300 hover:text-white bg-indigo-900/40 hover:bg-indigo-800/60 px-2.5 py-1.5 rounded-lg border border-indigo-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Вставити з буфера обміну"
                            >
                              <Clipboard className="w-3 h-3" /> Вставити
                            </button>
                          </div>
                          <button
                            type="submit"
                            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <LogIn className="w-3.5 h-3.5" /> Увійти за посиланням
                          </button>
                        </form>
                      </details>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RANDOM MATCHMAKING */}
              {onlineTab === "matchmaking" && (
                <div className="flex flex-col gap-3">
                  <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col gap-2 text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Швидкий автоматичний підбір:
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Система знайде для вас випадкового суперника онлайн. Якщо суперників немає, гра запропонує активного бота.
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-xs">
                      <span className="text-slate-400">Фільтр консолі:</span>
                      <select
                        value={mmSystem}
                        onChange={(e) => setMmSystem(e.target.value as ConsoleSystem | "ANY")}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="ANY">Будь-яка (Всі)</option>
                        <option value="NES">NES (Денді)</option>
                        <option value="SNES">SNES</option>
                        <option value="GBA">GBA</option>
                        <option value="GB">Game Boy</option>
                      </select>
                    </div>
                  </div>

                  {matchmakingStatus === "searching" ? (
                    <div className="p-4 bg-indigo-950/40 border border-indigo-500/50 rounded-xl flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                      <span className="text-xs font-bold text-slate-200">
                        Пошук випадкового суперника... ({searchTimerSeconds}с)
                      </span>
                      <span className="text-[11px] text-slate-400 text-center">
                        Шукаємо реального гравця онлайн (через 3-4с підключиться тренувальний бот)
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={onCancelMatchmaking}
                          className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Скасувати
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button
                        id="find-random-match-button"
                        onClick={() =>
                          onStartMatchmaking({
                            consoleSystem: mmSystem,
                            supportedGames: ["ANY"],
                            netplayMode,
                          })
                        }
                        className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" /> Почати пошук суперника онлайн
                      </button>

                      <button
                        id="quick-ai-bot-match-button"
                        onClick={() =>
                          onStartMatchmaking({
                            consoleSystem: mmSystem,
                            supportedGames: ["nes-netplay-arena-2p"],
                            netplayMode,
                          })
                        }
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>🤖</span> Швидка гра з тренувальним AI (Миттєво)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
