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
  Search,
  Gamepad2,
  ArrowRight,
  LogOut,
  Sparkles,
  Link,
  Hash,
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
  // Online Hub Sub-tabs: "matchmaking" (random) or "room" (specific friend room)
  const [onlineTab, setOnlineTab] = useState<"matchmaking" | "room">("matchmaking");
  const [roomActionTab, setRoomActionTab] = useState<"create" | "join">("create");

  const [joinCode, setJoinCode] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [selectedHostSystem, setSelectedHostSystem] = useState<ConsoleSystem>("NES");
  const [selectedHostGameId, setSelectedHostGameId] = useState<string>("nes-netplay-arena-2p");
  const [chatInput, setChatInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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

  const handleCopyInviteLink = () => {
    if (!room) return;
    const url = `${window.location.origin}?room=${room.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (!room) return;
    const url = `${window.location.origin}?room=${room.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Retro Netplay Room #${room.id}`,
          text: `Приєднуйся до гри "${room.gameTitle}"! Код кімнати: ${room.id}`,
          url,
        });
      } catch {
        handleCopyInviteLink();
      }
    } else {
      handleCopyInviteLink();
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const demo = DEMO_ROMS.find((d) => d.id === selectedHostGameId);
    onCreateRoom(
      newRoomName.trim() || `Кімната ${myUsername}`,
      netplayMode,
      isPrivateRoom,
      selectedHostSystem,
      demo?.title || "Retro 2P Game",
      selectedHostGameId
    );
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().replace("#", "");
    if (!cleaned) return;
    onJoinRoom(cleaned);
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
                  <div>
                    <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                      Активна кімната:
                    </span>
                    <h2 className="text-sm font-bold text-white truncate max-w-[180px]">
                      {room.name}
                    </h2>
                  </div>
                  <button
                    id="leave-room-button"
                    onClick={onLeaveRoom}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-[11px] font-semibold transition-all cursor-pointer"
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
                        #{room.id}
                      </span>
                      <button
                        id="copy-room-number-btn"
                        onClick={handleCopyCode}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                        title="Скопіювати номер"
                      >
                        {copiedCode ? (
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

              {/* Sub-tabs: Random Matchmaking vs Specific Player Room */}
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  id="tab-online-random"
                  onClick={() => setOnlineTab("matchmaking")}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    onlineTab === "matchmaking"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Випадковий гравець</span>
                </button>
                <button
                  id="tab-online-room"
                  onClick={() => setOnlineTab("room")}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    onlineTab === "room"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Кімната з гравцем</span>
                </button>
              </div>

              {/* OPTION A: RANDOM MATCHMAKING */}
              {onlineTab === "matchmaking" && (
                <div className="flex flex-col gap-3">
                  <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col gap-2 text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Швидкий автоматичний підбір:
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Система знайде для вас випадкового суперника онлайн для спільної дуелі.
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
                      <span className="text-[11px] text-slate-400">
                        Очікуємо підключення іншого гравця
                      </span>
                      <button
                        onClick={onCancelMatchmaking}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold mt-1 cursor-pointer"
                      >
                        Скасувати пошук
                      </button>
                    </div>
                  ) : (
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
                      <Search className="w-4 h-4" /> Почати пошук суперника онлайн
                    </button>
                  )}
                </div>
              )}

              {/* OPTION B: SPECIFIC PLAYER ROOM (CREATE OR JOIN BY CODE / NUMBER / LINK) */}
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
                      Вхід за кодом / посиланням
                    </button>
                  </div>

                  {/* Sub-form: Create Room */}
                  {roomActionTab === "create" && (
                    <form onSubmit={handleCreateSubmit} className="flex flex-col gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                          Назва кімнати:
                        </label>
                        <input
                          type="text"
                          value={newRoomName}
                          onChange={(e) => setNewRoomName(e.target.value)}
                          placeholder={`Кімната ${myUsername}`}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                            Консоль:
                          </label>
                          <select
                            value={selectedHostSystem}
                            onChange={(e) => setSelectedHostSystem(e.target.value as ConsoleSystem)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                          >
                            <option value="NES">NES</option>
                            <option value="SNES">SNES</option>
                            <option value="GBA">GBA</option>
                            <option value="GB">Game Boy</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                            Гра:
                          </label>
                          <select
                            value={selectedHostGameId}
                            onChange={(e) => setSelectedHostGameId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                          >
                            {DEMO_ROMS.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                        Після створення кімнати ви отримаєте унікальний 6-значний код, номер та
                        пряме посилання для надсилання другу.
                      </p>

                      <button
                        type="submit"
                        id="create-private-room-button"
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Створити кімнату
                      </button>
                    </form>
                  )}

                  {/* Sub-form: Join by Code / Number / Link */}
                  {roomActionTab === "join" && (
                    <form onSubmit={handleJoinSubmit} className="flex flex-col gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                          Введіть код, номер кімнати або посилання:
                        </label>
                        <input
                          type="text"
                          value={joinCode}
                          onChange={(e) => {
                            const val = e.target.value;
                            // Parse room param if URL pasted
                            if (val.includes("room=")) {
                              const match = val.match(/room=([A-Za-z0-9_-]+)/);
                              if (match && match[1]) {
                                setJoinCode(match[1].toUpperCase());
                                return;
                              }
                            }
                            setJoinCode(val.toUpperCase());
                          }}
                          placeholder="напр. K8X29Q, #K8X29Q або https://..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-200 uppercase focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <p className="text-[11px] text-slate-400 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                        Вставте код, номер кімнати або повне посилання, надіслане іншим гравцем.
                      </p>

                      <button
                        type="submit"
                        id="join-room-submit-button"
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <LogIn className="w-4 h-4" /> Увійти в кімнату
                      </button>
                    </form>
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
