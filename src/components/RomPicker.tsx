import React, { useRef, useState } from "react";
import { Upload, FileCode2, Play, CheckCircle2, Gamepad, Sparkles } from "lucide-react";
import { DEMO_ROMS, computeRomHash, detectSystemFromROM } from "../emulator/demoRoms";
import { ConsoleSystem, DemoROM } from "../types";

interface RomPickerProps {
  onLoadRomBytes: (fileName: string, bytes: Uint8Array, hash: string, system: ConsoleSystem) => void;
  onLoadDemoRom: (demo: DemoROM) => void;
  currentTitle: string;
  currentSystem: ConsoleSystem;
}

export const RomPicker: React.FC<RomPickerProps> = ({
  onLoadRomBytes,
  onLoadDemoRom,
  currentTitle,
  currentSystem,
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
        onLoadRomBytes(file.name, bytes, hash, system);
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
    <div id="rom-picker-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-400" /> ROM Loader & Library
          </h2>
          <p className="text-xs text-slate-400">
            Upload your own ROM (.nes, .gba, .sfc, .gb, .gbc) or pick a 2-player homebrew demo.
          </p>
        </div>
      </div>

      {/* Drag and Drop Zone */}
      <div
        id="rom-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
          isDragging
            ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
            : "border-slate-700 hover:border-slate-600 bg-slate-950/50 hover:bg-slate-950/80"
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
        <div className="bg-indigo-600/20 p-3 rounded-full text-indigo-400 border border-indigo-500/30">
          <FileCode2 className="w-6 h-6" />
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-200 block">
            Click to upload or drag & drop ROM file
          </span>
          <span className="text-[11px] text-slate-400">
            Supported: <span className="text-indigo-300 font-mono">.NES, .GBA, .SFC, .SMC, .GB, .GBC</span> (Loaded in browser RAM)
          </span>
        </div>
      </div>

      {/* Instant 2-Player Homebrew Demo ROMs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Instant 2-Player Homebrew Games:
          </span>
          {/* Filter Pills */}
          <div className="flex items-center gap-1 text-[10px]">
            {["ALL", "NES", "GB", "GBA", "SNES"].map((sys) => (
              <button
                key={sys}
                onClick={() => setSelectedFilter(sys)}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
          {filteredDemos.map((demo) => {
            const isCurrent = currentTitle.includes(demo.title) || currentTitle === demo.id;
            return (
              <div
                key={demo.id}
                onClick={() => onLoadDemoRom(demo)}
                className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                  isCurrent
                    ? "bg-indigo-950/40 border-indigo-500/80 shadow-md shadow-indigo-900/20"
                    : "bg-slate-850 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">{demo.title}</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {demo.system}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                  {demo.description}
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <Gamepad className="w-3 h-3" /> {demo.badge}
                  </span>
                  <button
                    id={`load-demo-${demo.id}`}
                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Play className="w-2.5 h-2.5" /> Play
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
