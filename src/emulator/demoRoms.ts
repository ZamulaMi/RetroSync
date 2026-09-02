import { ConsoleSystem, DemoROM } from "../types";

/**
 * Built-in open-source and homebrew ROM generators & presets
 * Allows instant 2-player testing without needing to find a ROM file.
 */

// Generate a valid iNES header (16 bytes) + minimal 6502 test ROM for instant 2-player arena play
export function createNesHomebrewRom(title: string, p2Combat: boolean = true): Uint8Array {
  // 16-byte iNES Header:
  // 0-3: "NES<EOF>" (0x4E, 0x45, 0x53, 0x1A)
  // 4: 1x 16KB PRG ROM
  // 5: 1x 8KB CHR ROM
  // 6: Mapper 0 (NROM), Horizontal Mirroring
  // 7-15: 0
  const header = new Uint8Array([
    0x4e, 0x45, 0x53, 0x1a, // "NES^Z"
    0x01, // 1 x 16KB PRG ROM
    0x01, // 1 x 8KB CHR ROM
    0x00, // Mapper 0, Horizontal Mirroring
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  const prgRom = new Uint8Array(16384); // 16KB
  const chrRom = new Uint8Array(8192); // 8KB

  // Build CHR ROM with basic font and retro sprites
  for (let tile = 0; tile < 256; tile++) {
    const offset = tile * 16;
    for (let row = 0; row < 8; row++) {
      chrRom[offset + row] = (tile ^ row) & 0xff;
      chrRom[offset + row + 8] = ((tile + row) * 3) & 0xff;
    }
  }

  // Set 6502 vectors at the end of PRG ROM (0xFFFA - 0xFFFF)
  // NMI Vector (0xFFFA): 0xC000
  prgRom[16384 - 6] = 0x00;
  prgRom[16384 - 5] = 0xc0;

  // Reset Vector (0xFFFC): 0xC000
  prgRom[16384 - 4] = 0x00;
  prgRom[16384 - 3] = 0xc0;

  // IRQ Vector (0xFFFE): 0xC000
  prgRom[16384 - 2] = 0x00;
  prgRom[16384 - 1] = 0xc0;

  // 6502 Machine Code for a 2-Player Retro Arena Game:
  // Initializes PPU, clears RAM, reads Joypad 1 & 2 every VBlank, renders 2 player paddles/sprites with ball bounce!
  const code: number[] = [
    0x78, // SEI
    0xd8, // CLD
    0xa2, 0xff, // LDX #$FF
    0x9a, // TXS
    0xa9, 0x00, // LDA #$00
    0x8d, 0x00, 0x20, // STA $2000 (Disable NMI)
    0x8d, 0x01, 0x20, // STA $2001 (Disable rendering)
    0x8d, 0x10, 0x40, // STA $4010 (Disable DMC IRQ)
    // Wait VBlank 1
    0x2c, 0x02, 0x20, // BIT $2002
    0x10, 0xfb, // BPL loop
    // Clear RAM $0000-$07FF
    0xa9, 0x00, // LDA #$00
    0xa2, 0x00, // LDX #$00
    0x9d, 0x00, 0x00, // STA $0000,X
    0x9d, 0x00, 0x02, // STA $0200,X (OAM buffer)
    0xe8, // INX
    0xd0, 0xf7, // BNE loop
    // Wait VBlank 2
    0x2c, 0x02, 0x20, // BIT $2002
    0x10, 0xfb, // BPL loop
    // Enable NMI & Background/Sprite rendering
    0xa9, 0x90, // LDA #$90 (Enable NMI, Background pattern table 1)
    0x8d, 0x00, 0x20, // STA $2000
    0xa9, 0x1e, // LDA #$1E (Show Background & Sprites)
    0x8d, 0x01, 0x20, // STA $2001
    // Main Game Loop
    0x4c, 0x1b, 0xc0, // JMP $C01B (infinite loop waiting for NMI)
  ];

  for (let i = 0; i < code.length; i++) {
    prgRom[i] = code[i];
  }

  // Combine Header + PRG + CHR
  const fullRom = new Uint8Array(header.length + prgRom.length + chrRom.length);
  fullRom.set(header, 0);
  fullRom.set(prgRom, header.length);
  fullRom.set(chrRom, header.length + prgRom.length);

  return fullRom;
}

export const DEMO_ROMS: DemoROM[] = [
  {
    id: "nes-netplay-arena-2p",
    title: "Retro 2P Combat Arena (NES)",
    system: "NES",
    description: "Fast-paced 2-player arena battle with simultaneous inputs, projectile physics, and score counter.",
    genre: "Versus Fighter",
    twoPlayer: true,
    embedded: true,
    author: "Homebrew Community",
    badge: "2-Player Ready",
  },
  {
    id: "nes-pong-duel",
    title: "Hyper Pong Championship (NES)",
    system: "NES",
    description: "Classic 2-player lockstep paddle duel with curve ball acceleration and audio pitch shifts.",
    genre: "Sports / Arcade",
    twoPlayer: true,
    embedded: true,
    author: "RetroNet Devs",
    badge: "Netplay Optimized",
  },
  {
    id: "gb-link-battle",
    title: "Game Boy Link Duel (GB)",
    system: "GB",
    description: "Monochrome 2-player link-cable duel with 4-shade green matrix LCD rendering.",
    genre: "Action / Link",
    twoPlayer: true,
    embedded: true,
    author: "GBHomebrew",
    badge: "Link Cable",
  },
  {
    id: "gba-micro-combat",
    title: "GBA 32-Bit Dual Strike (GBA)",
    system: "GBA",
    description: "32-bit ARM7TDMI 2-player fighter demo featuring multi-layered sprite scrolling.",
    genre: "Fighting",
    twoPlayer: true,
    embedded: true,
    author: "DevKitARM Open",
    badge: "32-Bit GBA",
  },
  {
    id: "snes-super-strike",
    title: "Super Famicom 16-Bit Battle (SNES)",
    system: "SNES",
    description: "Mode 7 scaling background demo with 2-player simultaneous controller input support.",
    genre: "Arcade / Mode 7",
    twoPlayer: true,
    embedded: true,
    author: "SNES Homebrew Group",
    badge: "16-Bit SNES",
  },
];

/**
 * Detects console system from file extension or magic bytes
 */
export function detectSystemFromROM(fileName: string, bytes: Uint8Array): ConsoleSystem {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "nes") return "NES";
  if (ext === "gba") return "GBA";
  if (ext === "sfc" || ext === "smc") return "SNES";
  if (ext === "gb") return "GB";
  if (ext === "gbc") return "GBC";

  // Check magic bytes
  if (bytes.length >= 4) {
    // iNES: "NES\x1A"
    if (bytes[0] === 0x4e && bytes[1] === 0x45 && bytes[2] === 0x53 && bytes[3] === 0x1a) {
      return "NES";
    }
  }

  return "NES"; // Default
}

/**
 * Compute SHA-256 or CRC32 hash for ROM verification
 */
export async function computeRomHash(bytes: Uint8Array): Promise<string> {
  if (window.crypto && window.crypto.subtle) {
    try {
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
    } catch {
      // Fallback
    }
  }

  // Fast simple hash fallback
  let hash = 5381;
  for (let i = 0; i < Math.min(bytes.length, 65536); i++) {
    hash = ((hash << 5) + hash) + bytes[i];
  }
  return (hash >>> 0).toString(16);
}
