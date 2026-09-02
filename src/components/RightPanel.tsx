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
} from "lucide-react";
import {
  ChatMessage,
  ConsoleSystem,
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

interface RightPanelProps {
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
  const [activeTab, setActiveTab] = useState<"matchmaking" | "host" | "join">("matchmaking");
  const [joinCode, setJoinCode] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [isPrivateRoom, setIsPrivateRoom] = useState(true);
  const [selectedHostSystem, setSelectedHostSystem] = useState<ConsoleSystem>("NES");
  const [selectedHostGameId, setSelectedHostGameId] = useState<string>("nes-netplay-arena-2p");
  const [chatInput, setChatInput] = useState("");
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

  const handleCopyInviteLink = () => {
    if (!room) return;
    const url = `${window.location.origin}?room=${room.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const demo = DEMO_ROMS.find((d) => d.id === selectedHostGameId);
    onCreateRoom(
      newRoomName.trim() || `${myUsername}'s Match`,
      netplayMode,
      isPrivateRoom,
      selectedHostSystem,
      demo?.title || "Retro Game",
      selectedHostGameId
    );
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinRoom(joinCode.trim());
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
    <aside id="right-sidebar-panel" className="w-full flex flex-col gap-4">
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
        opponentName={opponent?.username || (myRole === "player1" ? "Player 2" : "Player 1")}
      />

      {/* 3. Netplay Controls Panel (Create Room / Join Link / Matchmaking / Active Session) */}
      <div
        id="netplay-controls-panel"
        className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Netplay Controls</h3>
              <span className="text-[10px] text-slate-400">P2P Rollback & Matchmaking Hub</span>
            </div>
          </div>

          {/* Quick Username Edit */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={myUsername}
              onChange={(e) => setMyUsername(e.target.value.slice(0, 16))}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-semibold text-slate-200 w-24 text-right focus:outline-none focus:border-indigo-500"
              placeholder="Username"
            />
          </div>
        </div>

        {/* If in an Active Room, show In-Session Controls & Live Chat */}
        {room ? (
          <div className="flex flex-col gap-3">
            {/* Room Info Bar */}
            <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-100">{room.name}</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/20 text-indigo-300">
                    CODE: {room.id}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">Game: {room.gameTitle}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  id="copy-invite-link-btn"
                  onClick={handleCopyInviteLink}
                  className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Copy Invite Link"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>

                <button
                  id="leave-room-button"
                  onClick={onLeaveRoom}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-[10px] font-semibold transition-all"
                >
                  <LogOut className="w-3 h-3" /> Leave / End
                </button>
              </div>
            </div>

            {/* In-Room Live Chat Box */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Session Chat:
              </span>
              <div className="h-28 bg-slate-950/70 border border-slate-800 rounded-lg p-2 overflow-y-auto flex flex-col gap-1.5 text-xs">
                {chatMessages.length === 0 ? (
                  <span className="text-[11px] text-slate-500 italic my-auto text-center">
                    No messages yet. Send a greeting!
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
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Not in room: Show 3 distinct Netplay Control Panels */
          <div className="flex flex-col gap-3">
            {/* Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-semibold">
              <button
                id="tab-matchmaking"
                onClick={() => setActiveTab("matchmaking")}
                className={`py-1.5 rounded-md transition-all ${
                  activeTab === "matchmaking"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Random Match
              </button>
              <button
                id="tab-host"
                onClick={() => setActiveTab("host")}
                className={`py-1.5 rounded-md transition-all ${
                  activeTab === "host"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Create Room
              </button>
              <button
                id="tab-join"
                onClick={() => setActiveTab("join")}
                className={`py-1.5 rounded-md transition-all ${
                  activeTab === "join"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Invite Link
              </button>
            </div>

            {/* TAB 1: Find Random Match */}
            {activeTab === "matchmaking" && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Console Filter:</span>
                  <select
                    value={mmSystem}
                    onChange={(e) => setMmSystem(e.target.value as ConsoleSystem | "ANY")}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="ANY">Any Console</option>
                    <option value="NES">NES Only</option>
                    <option value="SNES">SNES Only</option>
                    <option value="GBA">GBA Only</option>
                    <option value="GB">Game Boy</option>
                  </select>
                </div>

                {matchmakingStatus === "searching" ? (
                  <div className="p-4 bg-indigo-950/40 border border-indigo-500/50 rounded-lg flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    <span className="text-xs font-bold text-slate-200">
                      Searching for opponent... ({searchTimerSeconds}s)
                    </span>
                    <button
                      onClick={onCancelMatchmaking}
                      className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold mt-1"
                    >
                      Cancel Search
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
                    className="w-full py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Search className="w-3.5 h-3.5" /> Find Random Match Now
                  </button>
                )}
              </div>
            )}

            {/* TAB 2: Create Private Room */}
            {activeTab === "host" && (
              <form onSubmit={handleCreateSubmit} className="flex flex-col gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Room Name / Title:
                  </label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder={`${myUsername}'s Room`}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                      System:
                    </label>
                    <select
                      value={selectedHostSystem}
                      onChange={(e) => setSelectedHostSystem(e.target.value as ConsoleSystem)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="NES">NES</option>
                      <option value="SNES">SNES</option>
                      <option value="GBA">GBA</option>
                      <option value="GB">Game Boy</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                      Initial Game:
                    </label>
                    <select
                      value={selectedHostGameId}
                      onChange={(e) => setSelectedHostGameId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      {DEMO_ROMS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  id="create-private-room-button"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Private Room
                </button>
              </form>
            )}

            {/* TAB 3: Enter Invite Link / Join Code */}
            {activeTab === "join" && (
              <form onSubmit={handleJoinSubmit} className="flex flex-col gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                    Enter 6-Character Room Code or Full Invite Link:
                  </label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Support pasting full URL like https://...?room=ABCD12
                      if (val.includes("room=")) {
                        const match = val.match(/room=([A-Za-z0-9]+)/);
                        if (match && match[1]) {
                          setJoinCode(match[1].toUpperCase());
                          return;
                        }
                      }
                      setJoinCode(val.toUpperCase());
                    }}
                    placeholder="e.g. 7K4A9X or paste link"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  id="join-room-submit-button"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" /> Join Room
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
