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
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  ChatMessage,
  ConsoleSystem,
  MatchmakingCriteria,
  MatchmakingStatus,
  NetplayMode,
  PlayerRole,
  RoomInfo,
} from "../types";
import { DEMO_ROMS } from "../emulator/demoRoms";

interface PublicRoomItem {
  id: string;
  name: string;
  hostId: string;
  gameTitle: string;
  gameId?: string;
  system: string;
  netplayMode: string;
  playerCount: number;
  hasPlayer1: boolean;
  hasPlayer2: boolean;
}

interface NetplayLobbyProps {
  room: RoomInfo | null;
  myPeerId: string;
  myRole: PlayerRole;
  myUsername: string;
  setMyUsername: (name: string) => void;
  netplayMode: NetplayMode;
  setNetplayMode: (mode: NetplayMode) => void;
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
}

export const NetplayLobby: React.FC<NetplayLobbyProps> = ({
  room,
  myPeerId,
  myRole,
  myUsername,
  setMyUsername,
  netplayMode,
  setNetplayMode,
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
}) => {
  const [activeTab, setActiveTab] = useState<"matchmaking" | "host" | "join" | "browser">("matchmaking");
  const [joinCode, setJoinCode] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [isPrivateRoom, setIsPrivateRoom] = useState(true);
  const [selectedHostSystem, setSelectedHostSystem] = useState<ConsoleSystem>("NES");
  const [selectedHostGameId, setSelectedHostGameId] = useState<string>("nes-netplay-arena-2p");
  const [chatInput, setChatInput] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Matchmaking form state
  const [mmSystem, setMmSystem] = useState<ConsoleSystem | "ANY">("ANY");
  const [mmSelectedGames, setMmSelectedGames] = useState<string[]>(["ANY"]);
  const [searchTimerSeconds, setSearchTimerSeconds] = useState(0);

  // Public rooms list
  const [publicRooms, setPublicRooms] = useState<PublicRoomItem[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  // Matchmaking timer
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

  // Fetch public rooms
  const fetchPublicRooms = async () => {
    try {
      setIsLoadingRooms(true);
      const res = await fetch("/api/rooms");
      if (res.ok) {
        const data = await res.json();
        setPublicRooms(data);
      }
    } catch (err) {
      console.error("Failed to fetch public rooms:", err);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (activeTab === "browser" && !room) {
      fetchPublicRooms();
    }
  }, [activeTab, room]);

  const handleCopyShareLink = () => {
    if (!room) return;
    const url = `${window.location.origin}?room=${room.id}&token=${room.inviteToken || ""}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput("");
  };

  const handleToggleGameSelection = (gameId: string) => {
    if (gameId === "ANY") {
      setMmSelectedGames(["ANY"]);
      return;
    }

    let next = mmSelectedGames.filter((g) => g !== "ANY");
    if (next.includes(gameId)) {
      next = next.filter((g) => g !== gameId);
      if (next.length === 0) next = ["ANY"];
    } else {
      next.push(gameId);
    }
    setMmSelectedGames(next);
  };

  const handleFindMatch = () => {
    onStartMatchmaking({
      consoleSystem: mmSystem,
      supportedGames: mmSelectedGames,
      netplayMode,
      username: myUsername,
    });
  };

  const handleCreateNewRoom = () => {
    const selectedDemo = DEMO_ROMS.find((d) => d.id === selectedHostGameId);
    const gameTitle = selectedDemo ? selectedDemo.title : "Retro 2P Combat Arena (NES)";
    onCreateRoom(
      newRoomName.trim() || `${myUsername}'s ${selectedHostSystem} Room`,
      netplayMode,
      isPrivateRoom,
      selectedHostSystem,
      gameTitle,
      selectedHostGameId,
      [selectedHostGameId]
    );
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div
      id="netplay-lobby-card"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-4"
    >
      {/* Lobby Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600/30 p-1.5 rounded-lg border border-indigo-500/40 text-indigo-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              Netplay Lobby & Matchmaking
            </h2>
            <p className="text-[11px] text-slate-400">
              {room ? `Connected to ${room.name}` : "P2P WebRTC Signaling & Quick Match"}
            </p>
          </div>
        </div>

        {/* Username Config */}
        <div className="flex items-center gap-1.5 text-xs bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
          <span className="text-slate-400">Your Tag:</span>
          <input
            id="username-input"
            type="text"
            value={myUsername}
            onChange={(e) => setMyUsername(e.target.value)}
            className="bg-transparent border-b border-indigo-500/60 text-xs text-white font-semibold w-24 focus:outline-none focus:border-indigo-400 px-1 py-0.5"
            placeholder="Username"
          />
        </div>
      </div>

      {!room ? (
        /* No Room Active: Tabs for Matchmaking / Host / Join / Browse */
        <div className="space-y-4">
          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <button
              id="tab-matchmaking-btn"
              onClick={() => setActiveTab("matchmaking")}
              className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                activeTab === "matchmaking"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quick Match</span>
              <span className="sm:hidden">Match</span>
            </button>

            <button
              id="tab-host-btn"
              onClick={() => setActiveTab("host")}
              className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                activeTab === "host"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Host Room</span>
              <span className="sm:hidden">Host</span>
            </button>

            <button
              id="tab-join-btn"
              onClick={() => setActiveTab("join")}
              className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                activeTab === "join"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Join Code</span>
              <span className="sm:hidden">Join</span>
            </button>

            <button
              id="tab-browse-btn"
              onClick={() => setActiveTab("browser")}
              className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                activeTab === "browser"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Browse</span>
              <span className="sm:hidden">List</span>
            </button>
          </div>

          {/* TAB 1: RANDOM MATCHMAKING */}
          {activeTab === "matchmaking" && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-emerald-400" /> Random Matchmaking Queue
                  </h3>
                  <span className="text-[10px] font-semibold text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                    Auto P2P Pairing
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Select your target console system and supported games range to match with another player.
                </p>
              </div>

              {/* Console Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Target Console:</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
                  {(["ANY", "NES", "SNES", "GBA", "GB", "GBC"] as const).map((sys) => (
                    <button
                      key={sys}
                      type="button"
                      onClick={() => setMmSystem(sys)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                        mmSystem === sys
                          ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {sys === "ANY" ? "Any System" : sys}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Range of Supported Games */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Supported Games Range:</label>
                  <span className="text-[10px] text-slate-400">
                    {mmSelectedGames.includes("ANY")
                      ? "Any 2-Player Game"
                      : `${mmSelectedGames.length} selected`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => handleToggleGameSelection("ANY")}
                    className={`p-2 rounded-lg text-left border text-xs transition-all flex items-center justify-between ${
                      mmSelectedGames.includes("ANY")
                        ? "bg-indigo-950/40 border-indigo-500 text-indigo-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="truncate">Any 2-Player Game</span>
                    {mmSelectedGames.includes("ANY") && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>

                  {DEMO_ROMS.map((rom) => {
                    const isSelected = mmSelectedGames.includes(rom.id);
                    return (
                      <button
                        key={rom.id}
                        type="button"
                        onClick={() => handleToggleGameSelection(rom.id)}
                        className={`p-2 rounded-lg text-left border text-xs transition-all flex items-center justify-between ${
                          isSelected
                            ? "bg-indigo-950/40 border-indigo-500 text-indigo-200 font-bold"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-semibold block truncate">{rom.title}</span>
                          <span className="text-[10px] text-slate-500">{rom.system} • {rom.badge}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Netplay Mode Preference */}
              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-300 font-semibold">Netplay Mode:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setNetplayMode("rollback")}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                      netplayMode === "rollback"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    GGPO Rollback (0 Lag)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNetplayMode("lockstep")}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                      netplayMode === "lockstep"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Lockstep
                  </button>
                </div>
              </div>

              {/* Matchmaking Action Button */}
              {matchmakingStatus === "searching" ? (
                <div className="bg-indigo-950/40 border border-indigo-500/50 rounded-xl p-3 flex flex-col items-center gap-2.5">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    Searching for opponent in {mmSystem}... ({formatTime(searchTimerSeconds)})
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    Looking for a peer with matching console & game preferences.
                  </p>
                  <button
                    id="cancel-matchmaking-btn"
                    onClick={onCancelMatchmaking}
                    className="w-full py-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel Search
                  </button>
                </div>
              ) : (
                <button
                  id="find-match-btn"
                  onClick={handleFindMatch}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
                >
                  <Zap className="w-4 h-4 fill-white" /> Find Random Match
                </button>
              )}
            </div>
          )}

          {/* TAB 2: HOST PRIVATE / PUBLIC ROOM */}
          {activeTab === "host" && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-400" /> Create Custom Netplay Room
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Host a room and generate a private invite link to play with a friend.
                </p>
              </div>

              <div className="space-y-3">
                {/* Room Title */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Room Title:</label>
                  <input
                    id="create-room-name-input"
                    type="text"
                    placeholder={`e.g. ${myUsername}'s Dojo`}
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Console System & Game */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">System:</label>
                    <select
                      value={selectedHostSystem}
                      onChange={(e) => {
                        const sys = e.target.value as ConsoleSystem;
                        setSelectedHostSystem(sys);
                        const firstForSys = DEMO_ROMS.find((r) => r.system === sys);
                        if (firstForSys) setSelectedHostGameId(firstForSys.id);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="NES">NES (8-bit)</option>
                      <option value="SNES">SNES (16-bit)</option>
                      <option value="GBA">GBA (32-bit)</option>
                      <option value="GB">Game Boy</option>
                      <option value="GBC">Game Boy Color</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Game Preset:</label>
                    <select
                      value={selectedHostGameId}
                      onChange={(e) => setSelectedHostGameId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {DEMO_ROMS.map((rom) => (
                        <option key={rom.id} value={rom.id}>
                          {rom.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Privacy Toggle */}
                <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    {isPrivateRoom ? (
                      <Lock className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Globe className="w-4 h-4 text-emerald-400" />
                    )}
                    <div>
                      <span className="text-xs font-bold text-white block">
                        {isPrivateRoom ? "Private Room" : "Public Room"}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isPrivateRoom
                          ? "Hidden from public listings; requires invite link / code"
                          : "Visible in public room browser"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPrivateRoom(!isPrivateRoom)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      isPrivateRoom
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    }`}
                  >
                    {isPrivateRoom ? "Private" : "Public"}
                  </button>
                </div>
              </div>

              <button
                id="create-room-btn"
                onClick={handleCreateNewRoom}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4" /> Create & Host Room
              </button>
            </div>
          )}

          {/* TAB 3: JOIN VIA CODE / LINK */}
          {activeTab === "join" && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <LogIn className="w-4 h-4 text-indigo-400" /> Join via Room Code or Link
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Paste an invitation link or enter the 6-character room code.
                </p>
              </div>

              <div className="space-y-3">
                <input
                  id="join-room-code-input"
                  type="text"
                  placeholder="e.g. 7K2M9X or MATCH_4F9"
                  value={joinCode}
                  onChange={(e) => {
                    let val = e.target.value.trim();
                    // If full URL was pasted, parse room query parameter
                    if (val.includes("?room=") || val.includes("&room=")) {
                      try {
                        const parsed = new URL(val);
                        const r = parsed.searchParams.get("room");
                        if (r) val = r;
                      } catch {
                        const match = val.match(/room=([a-zA-Z0-9_-]+)/);
                        if (match) val = match[1];
                      }
                    }
                    setJoinCode(val.toUpperCase());
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-widest uppercase text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-bold"
                />

                <button
                  id="join-room-btn"
                  disabled={!joinCode.trim()}
                  onClick={() => onJoinRoom(joinCode)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-900/30 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                >
                  <LogIn className="w-4 h-4" /> Connect to Room
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: PUBLIC ROOMS BROWSER */}
          {activeTab === "browser" && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-400" /> Active Public Rooms
                </h3>
                <button
                  onClick={fetchPublicRooms}
                  disabled={isLoadingRooms}
                  className="p-1 rounded text-slate-400 hover:text-white"
                  title="Refresh List"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRooms ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {publicRooms.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    {isLoadingRooms ? "Loading rooms..." : "No public rooms active right now. Host one!"}
                  </div>
                ) : (
                  publicRooms.map((pubRoom) => (
                    <div
                      key={pubRoom.id}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <span className="font-bold text-white text-xs block truncate">
                          {pubRoom.name}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {pubRoom.gameTitle} ({pubRoom.system}) • {pubRoom.playerCount}/2 Players
                        </span>
                      </div>

                      <button
                        onClick={() => onJoinRoom(pubRoom.id)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0"
                      >
                        Join <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ACTIVE ROOM VIEW: INVITATION LINK, PLAYER SLOTS & CHAT */
        <div className="space-y-4">
          {/* Unique Invitation Link & Room Header */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Room Code:</span>
                <span className="font-mono text-sm font-black text-amber-400 tracking-wider">
                  {room.id}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    room.isPrivate
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {room.isPrivate ? "Private Room" : "Public"}
                </span>
              </div>

              {/* Leave Room Button */}
              <button
                id="leave-room-btn"
                onClick={onLeaveRoom}
                className="px-2.5 py-1 text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Leave
              </button>
            </div>

            {/* Direct Invitation Link Share Box */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold text-indigo-400 block tracking-wider">
                  Unique Invitation Link
                </span>
                <span className="text-xs font-mono text-slate-200 truncate block">
                  {`${window.location.origin}?room=${room.id}`}
                </span>
              </div>

              <button
                id="copy-room-link-btn"
                onClick={handleCopyShareLink}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                  copiedLink
                    ? "bg-emerald-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                }`}
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                {copiedLink ? "Link Copied!" : "Copy Invite Link"}
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Game: <strong className="text-slate-200">{room.gameTitle}</strong> ({room.system}) | Mode:{" "}
              <strong className="text-indigo-300">
                {room.netplayMode === "rollback" ? "GGPO Rollback" : "Lockstep"}
              </strong>
            </p>
          </div>

          {/* Player Slots */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Player 1 Slot */}
            {(() => {
              const p1 = room.participants.find((p) => p.role === "player1");
              const isMe = p1?.peerId === myPeerId;
              return (
                <div
                  className={`p-3 rounded-xl border ${
                    p1
                      ? "bg-indigo-950/30 border-indigo-500/50"
                      : "bg-slate-950/40 border-slate-800 border-dashed"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5 text-amber-400" /> Player 1 (Host)
                    </span>
                    {p1 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                        {p1.isReady ? "READY" : "WAITING"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-white truncate">
                    {p1 ? p1.username : "Open Slot"}
                  </p>
                  {!p1 && myRole !== "player1" && (
                    <button
                      onClick={() => onChangeRole("player1")}
                      className="mt-2 w-full py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-[10px] font-semibold rounded border border-indigo-500/30"
                    >
                      Claim Player 1
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Player 2 Slot */}
            {(() => {
              const p2 = room.participants.find((p) => p.role === "player2");
              const isMe = p2?.peerId === myPeerId;
              return (
                <div
                  className={`p-3 rounded-xl border ${
                    p2
                      ? "bg-amber-950/30 border-amber-500/50"
                      : "bg-slate-950/40 border-slate-800 border-dashed"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Player 2 (Challenger)
                    </span>
                    {p2 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                        {p2.isReady ? "READY" : "WAITING"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-white truncate">
                    {p2 ? p2.username : "Waiting for Player 2..."}
                  </p>
                  {!p2 && myRole !== "player2" && (
                    <button
                      onClick={() => onChangeRole("player2")}
                      className="mt-2 w-full py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[10px] font-semibold rounded border border-amber-500/30"
                    >
                      Claim Player 2
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Spectators */}
            {(() => {
              const spectators = room.participants.filter((p) => p.role === "spectator");
              return (
                <div className="p-3 rounded-xl border bg-slate-950/40 border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-slate-400" /> Spectators ({spectators.length})
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 truncate">
                    {spectators.length > 0
                      ? spectators.map((s) => s.username).join(", ")
                      : "No spectators"}
                  </div>
                  {myRole !== "spectator" && (
                    <button
                      onClick={() => onChangeRole("spectator")}
                      className="mt-2 w-full py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded border border-slate-700"
                    >
                      Switch to Spectator
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Lobby Chat */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 flex flex-col gap-2">
            <span className="text-xs font-bold text-slate-300">Lobby Chat:</span>
            <div className="h-24 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {chatMessages.length === 0 ? (
                <p className="text-slate-500 text-[11px] italic">No messages yet. Say hello!</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="leading-tight">
                    <span
                      className={`font-semibold ${
                        msg.senderPeerId === myPeerId ? "text-indigo-400" : "text-amber-400"
                      }`}
                    >
                      {msg.senderName}:
                    </span>{" "}
                    <span className="text-slate-200">{msg.text}</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChat} className="flex gap-2 mt-1">
              <input
                id="chat-message-input"
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                id="send-chat-btn"
                type="submit"
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
