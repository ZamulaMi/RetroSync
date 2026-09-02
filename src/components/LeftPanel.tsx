import React, { useRef, useState } from "react";
import {
  Upload,
  FileCode2,
  Play,
  CheckCircle2,
  Gamepad,
  Sparkles,
  Layers,
  RotateCw,
} from "lucide-react";
import { DEMO_ROMS, computeRomHash, detectSystemFromROM } from "../emulator/demoRoms";
import { ConsoleSystem, DemoROM, PlayerRole, RoomInfo } from "../types";
import { GameChangeWorkflow } from "./GameChangeWorkflow";
import { GameSyncState } from "../netplay/netplayController";

interface LeftPanelProps {
  room: RoomInfo | null;
  myRole: PlayerRole;
  currentTitle: string;
  currentSystem: ConsoleSystem;
  syncState: GameSyncState;
  onLoadRomBytes: (fileName: string, bytes: Uint8Array, hash: string, system: ConsoleSystem) => void;
  onLoadDemoRom: (demo: DemoROM) => void;
  onInitiateGameSwitch: (
    gameTitle: string,
    system: ConsoleSystem,
    gameId?: string,
    romBytes?: Uint8Array,
    romHash?: string
  ) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  room,
  myRole,
  currentTitle,
  currentSystem,
  syncState,
  onLoadRomBytes,
  onLoadDemoRom,
  onInitiateGameSwitch,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");

  const handleFileChange = async (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const hash = await computeRomHash(bytes);
        const system = detectSystemFromROM(file.name, bytes);
        
        if (room && myRole === "player1") {
          onInitiateGameSwitch(file.name, system, undefined, bytes, hash);
        } else {
          onLoadRomBytes(file.name, bytes, hash, system);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const filteredDemos =
    selectedFilter === "ALL"
      ? DEMO_ROMS
      : DEMO_ROMS.filter((d) => d.system === selectedFilter);

  return (
    <aside id="left-sidebar-panel" className="w-full flex flex-col gap-4">
      {/* 1. Prominent Upload Your ROM Section */}
      <div
        id="rom-uploader-card"
        className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white">ROM Library & Custom Uploader</h2>
              <span className="text-[10px] text-slate-400">Client-Side High-Speed Memory Loader</span>
            </div>
          </div>
        </div>

        {/* Prominent Upload Button & Dropzone */}
        <div
          id="rom-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
              : "border-slate-700 hover:border-indigo-500/70 bg-slate-950/60 hover:bg-slate-950/90"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".nes,.gba,.sfc,.smc,.gb,.gbc,.bin"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileChange(e.target.files[0]);
              }
            }}
          />
          <div className="bg-indigo-600/20 p-2.5 rounded-full text-indigo-400 border border-indigo-500/30 shadow-sm">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div>
            <button
              type="button"
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold shadow transition-all block mx-auto mb-1"
            >
              Upload Your ROM
            </button>
            <span className="text-[10px] text-slate-400 block">
              Drag & drop .nes, .gba, .sfc, .gb, .gbc files
            </span>
          </div>
        </div>

        {/* Homebrew & Demo ROMs Section */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Compatible Homebrew & Demos:
            </span>
            {/* Filter Pills */}
            <div className="flex items-center gap-1 text-[10px]">
              {["ALL", "NES", "GB", "GBA", "SNES"].map((sys) => (
                <button
                  key={sys}
                  onClick={() => setSelectedFilter(sys)}
                  className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                    selectedFilter === sys
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {sys}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1">
            {filteredDemos.map((demo) => {
              const isCurrent = currentTitle.includes(demo.title) || currentTitle === demo.id;
              return (
                <div
                  key={demo.id}
                  onClick={() => {
                    if (room && myRole === "player1") {
                      onInitiateGameSwitch(demo.title, demo.system, demo.id);
                    } else {
                      onLoadDemoRom(demo);
                    }
                  }}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    isCurrent
                      ? "bg-indigo-950/40 border-indigo-500 shadow-sm"
                      : "bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono font-bold text-indigo-300">
                        {demo.system}
                      </span>
                      <span className="text-xs font-bold text-slate-200 truncate max-w-[160px]">
                        {demo.title}
                      </span>
                    </div>
                    {demo.twoPlayer && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        2-PLAYER
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{demo.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Changing Games UI & Resynchronization Workflow */}
      <GameChangeWorkflow
        room={room}
        myRole={myRole}
        syncState={syncState}
        onInitiateGameSwitch={onInitiateGameSwitch}
      />
    </aside>
  );
};
