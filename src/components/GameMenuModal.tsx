import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Play,
  RotateCcw,
  Upload,
  Gamepad2,
  Sliders,
  Sparkles,
  Save,
  Download,
  Volume2,
  VolumeX,
  FileCode2,
  Keyboard,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { computeRomHash, detectSystemFromROM } from "../emulator/demoRoms";
import { ConsoleSystem, ScreenFilter, ServerRomFile } from "../types";
import { fetchAvailableRoms, loadRomBinaryBytes, saveLocalStoredRom, formatRomDisplayTitle } from "../utils/romCatalog";

interface GameMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGameTitle: string;
  currentSystem: ConsoleSystem;
  activeSaveSlot: number;
  setActiveSaveSlot: (slot: number) => void;
  onSaveState: (slot: number) => void;
  onLoadState: (slot: number) => void;
  onRestartGame: () => void;
  onLoadRomBytes: (fileName: string, bytes: Uint8Array, hash: string, system: ConsoleSystem) => void;
  onOpenControls: () => void;
  filter: ScreenFilter;
  onFilterChange: (f: ScreenFilter) => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
}

export const GameMenuModal: React.FC<GameMenuModalProps> = ({
  isOpen,
  onClose,
  currentGameTitle,
  currentSystem,
  activeSaveSlot,
  setActiveSaveSlot,
  onSaveState,
  onLoadState,
  onRestartGame,
  onLoadRomBytes,
  onOpenControls,
  filter,
  onFilterChange,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}) => {
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [serverRoms, setServerRoms] = useState<ServerRomFile[]>([]);
  const [isLoadingRoms, setIsLoadingRoms] = useState(false);

  const fetchServerRoms = async () => {
    setIsLoadingRoms(true);
    try {
      const list = await fetchAvailableRoms();
      setServerRoms(list);
    } catch (e) {
      console.warn("Could not load available ROMs:", e);
    } finally {
      setIsLoadingRoms(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchServerRoms();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLaunchServerRom = async (rom: ServerRomFile) => {
    try {
      const bytes = await loadRomBinaryBytes(rom);
      const hash = await computeRomHash(bytes);
      const detectedSystem = detectSystemFromROM(rom.filename, bytes);
      onLoadRomBytes(rom.filename, bytes, hash, detectedSystem);
      onClose();
    } catch (err: any) {
      alert(`Не вдалося завантажити гру: ${err.message}`);
    }
  };

  const handleModalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const arrayBuffer = ev.target?.result as ArrayBuffer;
        if (arrayBuffer) {
          const bytes = new Uint8Array(arrayBuffer);
          const hash = await computeRomHash(bytes);
          const sys = detectSystemFromROM(file.name, bytes);

          const customRom: ServerRomFile = {
            filename: file.name,
            title: formatRomDisplayTitle(file.name),
            system: sys,
            size: bytes.byteLength,
            url: `/roms/${encodeURIComponent(file.name)}`,
            modifiedAt: Date.now(),
          };
          saveLocalStoredRom(customRom);

          onLoadRomBytes(file.name, bytes, hash, sys);
          onClose();
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      id="game-menu-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Меню гри / Пауза
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {currentSystem}
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[260px] sm:max-w-xs">
                Активний ROM: <span className="text-indigo-300 font-semibold">{currentGameTitle || "Не завантажено"}</span>
              </p>
            </div>
          </div>
          <button
            id="close-menu-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Повернутися до гри (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-4">
          {/* Main Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="resume-game-btn"
              onClick={onClose}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-900/30 transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              Продовжити гру (ESC)
            </button>
            <button
              id="restart-game-btn"
              onClick={() => {
                onRestartGame();
                onClose();
              }}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Перезапустити ROM
            </button>
          </div>

          {/* Quick Save / Quick Load State Section */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5 text-indigo-400" />
                Швидке збереження / Завантаження стану:
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Слот: <strong className="text-amber-400">{activeSaveSlot}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 justify-between">
              {/* Slot selector pills */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setActiveSaveSlot(slot)}
                    className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                      activeSaveSlot === slot
                        ? "bg-amber-500 text-slate-950 shadow"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>

              {/* Save & Load buttons */}
              <div className="flex items-center gap-2">
                <button
                  id="menu-save-state-btn"
                  onClick={() => {
                    onSaveState(activeSaveSlot);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Зберегти
                </button>
                <button
                  id="menu-load-state-btn"
                  onClick={() => {
                    onLoadState(activeSaveSlot);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Завантажити
                </button>
              </div>
            </div>
          </div>

          {/* Available ROMs */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                Доступні ігри:
              </span>
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
              <div className="grid grid-cols-1 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                {serverRoms.map((rom) => {
                  const isCurrent = currentGameTitle.includes(rom.filename) || currentGameTitle === rom.title;
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
                          <div className="text-xs font-bold truncate max-w-[170px] sm:max-w-[220px]">
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
              <div className="p-2 rounded-lg border border-dashed border-slate-800 bg-slate-900/40 text-center text-[10px] text-slate-400">
                Папка <code className="font-mono text-amber-300 bg-slate-950 px-1 py-0.5 rounded">public/roms/</code> порожня. Помістіть сюди файли ігор (.nes, .gba, .gb, .gbc, .sfc).
              </div>
            )}
          </div>

          {/* Direct ROM File Upload Section */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                Завантажити новий файл ROM:
              </span>
              <span className="text-[10px] text-slate-400">.nes, .gba, .sfc, .gb, .gbc</span>
            </div>

            <label
              htmlFor="menu-modal-file-input"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 hover:border-emerald-500/70 text-xs font-bold transition-all cursor-pointer shadow"
            >
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              Вибрати файл ROM з комп'ютера / пристрою
            </label>
            <input
              id="menu-modal-file-input"
              ref={modalFileInputRef}
              type="file"
              accept=".nes,.gba,.sfc,.smc,.gb,.gbc,.bin"
              className="hidden"
              onChange={handleModalFile}
            />
          </div>

          {/* Quick Key Cheat Sheet for In-Game Menus & Controls */}
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
                Керування у грі:
              </span>
              <button
                onClick={() => {
                  onClose();
                  onOpenControls();
                }}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <Sliders className="w-3 h-3" /> Перепризначити
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex flex-col items-center">
                <span className="text-slate-400 text-[10px]">Старт / Меню ROM</span>
                <kbd className="mt-1 font-mono font-bold bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded border border-slate-700">Enter / Space</kbd>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex flex-col items-center">
                <span className="text-slate-400 text-[10px]">Вибір (Select)</span>
                <kbd className="mt-1 font-mono font-bold bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded border border-slate-700">Shift / Tab</kbd>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex flex-col items-center">
                <span className="text-slate-400 text-[10px]">Кнопка A / B</span>
                <kbd className="mt-1 font-mono font-bold bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700">X (A) / Z (B)</kbd>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex flex-col items-center">
                <span className="text-slate-400 text-[10px]">D-Pad (Рух)</span>
                <kbd className="mt-1 font-mono font-bold bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700">Стрілки / WASD</kbd>
              </div>
            </div>
          </div>

          {/* Display Shaders & Audio quick toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs">
            {/* Screen Shader */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Екран:
              </span>
              <select
                value={filter}
                onChange={(e) => onFilterChange(e.target.value as ScreenFilter)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
              >
                <option value="pixel-perfect">Pixel Sharp (Піксельний)</option>
                <option value="crt-scanlines">CRT Scanlines (ЕПТ-монітор)</option>
                <option value="lcd-grid">LCD Matrix (РК-матриця)</option>
                <option value="gameboy-green">GB Classic Green</option>
                <option value="smooth-bilinear">Bilinear Smooth</option>
              </select>
            </div>

            {/* Volume */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onToggleMute}
                  className="text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? "Увімкнути звук" : "Вимкнути звук"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-indigo-400" />
                  )}
                </button>
                <span className="text-slate-400">Гучність:</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-24 h-1.5 accent-indigo-500 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <span>
            Натисніть <kbd className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-200 border border-slate-700">ESC</kbd> щоб повернутись
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Повернутися до гри
          </button>
        </div>
      </div>
    </div>
  );
};


