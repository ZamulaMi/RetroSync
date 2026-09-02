import React from "react";
import {
  X,
  Play,
  RotateCcw,
  Upload,
  Gamepad2,
  Sliders,
  Users,
  Sparkles,
  Layers,
  Flame,
} from "lucide-react";
import { DEMO_ROMS } from "../emulator/demoRoms";
import { ConsoleSystem, DemoROM } from "../types";

interface GameMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGameTitle: string;
  currentSystem: ConsoleSystem;
  onRestartGame: () => void;
  onSelectGame: (demo: DemoROM) => void;
  onOpenControls: () => void;
  onOpenUpload: () => void;
}

export const GameMenuModal: React.FC<GameMenuModalProps> = ({
  isOpen,
  onClose,
  currentGameTitle,
  currentSystem,
  onRestartGame,
  onSelectGame,
  onOpenControls,
  onOpenUpload,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="game-menu-modal"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Головне меню / Пауза
              </h2>
              <p className="text-xs text-slate-400">
                Поточна гра: <span className="text-indigo-300 font-semibold">{currentGameTitle}</span> ({currentSystem})
              </p>
            </div>
          </div>
          <button
            id="close-menu-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="resume-game-btn"
              onClick={onClose}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-white" />
              Продовжити гру
            </button>
            <button
              id="restart-game-btn"
              onClick={() => {
                onRestartGame();
                onClose();
              }}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <RotateCcw className="w-4 h-4" />
              Перезапустити
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              id="menu-open-controls-btn"
              onClick={() => {
                onClose();
                onOpenControls();
              }}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              Налаштування клавіш
            </button>
            <button
              id="menu-open-upload-btn"
              onClick={() => {
                onClose();
                onOpenUpload();
              }}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              Завантажити свій ROM
            </button>
          </div>

          {/* Game Library Presets */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Вибір іншої гри
              </span>
              <span className="text-[11px] text-slate-500">Вбудовані ретро-ігри</span>
            </div>

            <div className="flex flex-col gap-2">
              {DEMO_ROMS.map((demo) => {
                const isCurrent = demo.title === currentGameTitle;
                return (
                  <button
                    key={demo.id}
                    id={`menu-select-game-${demo.id}`}
                    onClick={() => {
                      onSelectGame(demo);
                      onClose();
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isCurrent
                        ? "bg-indigo-600/15 border-indigo-500/60 text-white shadow-md"
                        : "bg-slate-950/60 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          demo.system === "NES"
                            ? "bg-red-500/20 text-red-300 border border-red-500/30"
                            : demo.system === "SNES"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : demo.system === "GBA"
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {demo.system}
                      </div>
                      <div>
                        <div className="text-xs font-bold flex items-center gap-2">
                          {demo.title}
                          {isCurrent && (
                            <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.2 rounded font-medium">
                              Грає зараз
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{demo.description}</div>
                      </div>
                    </div>

                    <div className="text-slate-500 hover:text-indigo-400 pl-2">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Натисніть <kbd className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-200">ESC</kbd> щоб закрити</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Закрити меню
          </button>
        </div>
      </div>
    </div>
  );
};
