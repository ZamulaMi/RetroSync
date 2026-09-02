import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileCode2,
  CheckCircle2,
  Gamepad,
  Menu as MenuIcon,
  HardDrive,
  Cpu,
  FolderOpen,
  RefreshCw,
  Play,
  Save,
  FileText,
} from "lucide-react";
import { computeRomHash, detectSystemFromROM } from "../emulator/demoRoms";
import { ConsoleSystem, DemoROM, PlayerRole, RoomInfo, ServerRomFile } from "../types";
import { GameSyncState } from "../netplay/netplayController";

interface LeftPanelProps {
  room: RoomInfo | null;
  myRole: PlayerRole;
  currentTitle: string;
  currentSystem: ConsoleSystem;
  syncState: GameSyncState;
  onLoadRomBytes: (fileName: string, bytes: Uint8Array, hash: string, system: ConsoleSystem) => void;
  onLoadDemoRom?: (demo: DemoROM) => void;
  onInitiateGameSwitch: (
    gameTitle: string,
    system: ConsoleSystem,
    gameId?: string,
    romBytes?: Uint8Array,
    romHash?: string
  ) => void;
  onOpenMenu?: () => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  room,
  myRole,
  currentTitle,
  currentSystem,
  syncState,
  onLoadRomBytes,
  onInitiateGameSwitch,
  onOpenMenu,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [serverRoms, setServerRoms] = useState<ServerRomFile[]>([]);
  const [isLoadingRoms, setIsLoadingRoms] = useState(false);
  const [isSavingToServer, setIsSavingToServer] = useState(false);

  // Load server ROMs from /public/roms folder
  const fetchServerRoms = async () => {
    setIsLoadingRoms(true);
    try {
      const res = await fetch("/api/roms");
      if (res.ok) {
        const data = await res.json();
        setServerRoms(data);
      }
    } catch (e) {
      console.warn("Could not load /api/roms:", e);
    } finally {
      setIsLoadingRoms(false);
    }
  };

  useEffect(() => {
    fetchServerRoms();
  }, []);

  const handleLaunchServerRom = async (rom: ServerRomFile) => {
    try {
      const res = await fetch(rom.url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const hash = await computeRomHash(bytes);
      const detectedSystem = detectSystemFromROM(rom.filename, bytes);

      if (room && myRole === "player1") {
        onInitiateGameSwitch(rom.title, detectedSystem, undefined, bytes, hash);
      } else {
        onLoadRomBytes(rom.filename, bytes, hash, detectedSystem);
      }
    } catch (err: any) {
      alert(`Не вдалося завантажити ROM: ${err.message}`);
    }
  };

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

        // Auto-save or sync to /public/roms/ on server in background
        try {
          setIsSavingToServer(true);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = btoa(binary);
          await fetch("/api/roms/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              base64Data,
            }),
          });
          fetchServerRoms();
        } catch (err) {
          console.warn("Auto-save to /public/roms folder failed:", err);
        } finally {
          setIsSavingToServer(false);
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <aside id="left-sidebar-panel" className="w-full flex flex-col gap-4">
      {/* 1. Custom ROM Uploader Card */}
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
              <h2 className="text-xs font-bold text-white">Завантаження ROM файлу</h2>
              <span className="text-[10px] text-slate-400">Пряме завантаження в оперативну пам'ять</span>
            </div>
          </div>
        </div>

        {/* Dropzone */}
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
              ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
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
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow transition-all block mx-auto mb-1.5 cursor-pointer"
            >
              Вибрати ROM файл
            </button>
            <span className="text-[11px] text-slate-300 font-medium block">
              Або перетягніть сюди файл гри
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5 font-mono">
              Підтримуються .NES, .GBA, .SFC, .GB, .GBC
            </span>
          </div>
        </div>

        {/* 2. Available ROMs */}
        <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">
                Доступні ігри
              </span>
            </div>
            <button
              onClick={fetchServerRoms}
              disabled={isLoadingRoms}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              title="Оновити список доступних ігор"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRoms ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>

          {serverRoms.length > 0 ? (
            <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
              {serverRoms.map((rom) => {
                const isCurrent = currentTitle.includes(rom.filename) || currentTitle === rom.title;
                return (
                  <div
                    key={rom.filename}
                    className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                      isCurrent
                        ? "bg-indigo-950/50 border-indigo-500/70 text-white shadow-sm"
                        : "bg-slate-900/80 hover:bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-mono font-bold text-indigo-300 border border-slate-700 shrink-0">
                        {rom.system}
                      </span>
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold truncate max-w-[130px] sm:max-w-[150px]">
                          {rom.title}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {formatFileSize(rom.size)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleLaunchServerRom(rom)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      Запустити
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-2.5 rounded-lg border border-dashed border-slate-800 bg-slate-900/40 text-center flex flex-col items-center gap-1">
              <span className="text-[11px] text-slate-300 font-medium">
                Папка <code className="font-mono text-amber-300 bg-slate-950 px-1 py-0.5 rounded">public/roms/</code> створена
              </span>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Додайте сюди ваші файли (.nes, .gba, .gb, .gbc, .sfc) у файловому дереві або завантажте через кнопку вище — вони з'являтимуться тут.
              </p>
            </div>
          )}
        </div>

        {/* Currently Loaded Active Game Info Card */}
        {currentTitle && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Gamepad className="w-3.5 h-3.5 text-emerald-400" />
                Активний ROM
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {currentSystem}
              </span>
            </div>

            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-850 flex flex-col gap-1">
              <div className="text-xs font-bold text-white truncate" title={currentTitle}>
                {currentTitle}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Завантажено в RAM
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-indigo-400" /> Емулятор готовий
                </span>
              </div>
            </div>

            {onOpenMenu && (
              <button
                id="left-panel-menu-btn"
                onClick={onOpenMenu}
                className="w-full mt-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-colors cursor-pointer"
              >
                <MenuIcon className="w-3.5 h-3.5 text-amber-400" />
                Відкрити Меню гри (ESC)
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};


