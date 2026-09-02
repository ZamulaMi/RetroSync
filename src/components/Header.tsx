import React from "react";
import {
  Gamepad2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Wifi,
  WifiOff,
  BookOpen,
  Sliders,
  Sparkles,
  Users,
  Globe,
} from "lucide-react";
import { GamePlayMode, RoomInfo, ScreenFilter } from "../types";

interface HeaderProps {
  gamePlayMode: GamePlayMode;
  onSelectGamePlayMode: (mode: GamePlayMode) => void;
  room: RoomInfo | null;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  filter: ScreenFilter;
  onFilterChange: (f: ScreenFilter) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenControls: () => void;
  onOpenArchitecture: () => void;
  p2pConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  gamePlayMode,
  onSelectGamePlayMode,
  room,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  filter,
  onFilterChange,
  isFullscreen,
  onToggleFullscreen,
  onOpenControls,
  onOpenArchitecture,
  p2pConnected,
}) => {
  return (
    <header
      id="app-header"
      className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-2.5 flex items-center justify-between flex-wrap gap-3 shadow-md select-none"
    >
      {/* Brand & Active Game */}
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-indigo-900/30 shadow-md">
          <Gamepad2 className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              RetroNetplay
              <span className="text-[10px] uppercase font-semibold tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                GGPO Rollback
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-xs">
            {room ? `${room.gameTitle} (${room.system})` : "Universal Web Emulator & P2P Netplay"}
          </p>
        </div>
      </div>

      {/* Center: Mode Switcher & Room Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold shadow-inner">
          <button
            id="header-mode-local2p-btn"
            onClick={() => onSelectGamePlayMode("local_2p")}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              gamePlayMode === "local_2p"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1 ПК (2 гравці)</span>
          </button>
          <button
            id="header-mode-online-btn"
            onClick={() => onSelectGamePlayMode("online")}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              gamePlayMode === "online"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Онлайн гра</span>
          </button>
        </div>

        {/* Room badge & connection in Online Mode */}
        {gamePlayMode === "online" && room && (
          <div className="hidden lg:flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/80 text-xs">
            <span className="text-slate-400">Кімната:</span>
            <span className="font-mono font-bold text-amber-400 tracking-wider">#{room.id}</span>
            <span className="text-slate-500">|</span>
            <div className="flex items-center gap-1.5">
              {p2pConnected ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <Wifi className="w-3.5 h-3.5" /> P2P WebRTC
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                  <WifiOff className="w-3.5 h-3.5" /> WS Relay
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* Shaders / Screen Filter */}
        <div className="relative flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1" />
          <select
            id="filter-selector"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as ScreenFilter)}
            className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer pr-1"
          >
            <option value="pixel-perfect" className="bg-slate-900">
              Pixel Sharp
            </option>
            <option value="crt-scanlines" className="bg-slate-900">
              CRT Scanlines
            </option>
            <option value="lcd-grid" className="bg-slate-900">
              LCD Matrix
            </option>
            <option value="gameboy-green" className="bg-slate-900">
              GB Green
            </option>
            <option value="smooth-bilinear" className="bg-slate-900">
              Bilinear
            </option>
          </select>
        </div>

        {/* Audio controls */}
        <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2 py-1 border border-slate-700">
          <button
            id="mute-toggle-btn"
            onClick={onToggleMute}
            className="text-slate-300 hover:text-white transition-colors p-0.5"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            id="volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-16 h-1.5 accent-indigo-500 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Controls Remapper */}
        <button
          id="controls-modal-btn"
          onClick={onOpenControls}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-lg border border-slate-700 transition-colors flex items-center gap-1 text-xs font-medium"
          title="Controller & Keybindings"
        >
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span className="hidden sm:inline">Controls</span>
        </button>

        {/* Architecture Spec */}
        <button
          id="arch-modal-btn"
          onClick={onOpenArchitecture}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-lg border border-slate-700 transition-colors flex items-center gap-1 text-xs font-medium"
          title="Rollback Netplay Architecture Spec"
        >
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Netplay Spec</span>
        </button>

        {/* Fullscreen toggle */}
        <button
          id="fullscreen-toggle-btn"
          onClick={onToggleFullscreen}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-lg border border-slate-700 transition-colors"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
