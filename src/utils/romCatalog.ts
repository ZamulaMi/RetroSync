import { ConsoleSystem, ServerRomFile } from "../types";

export const DEFAULT_BUILTIN_ROMS: ServerRomFile[] = [
  {
    filename: "(1985) Battle City (バトルシティー) [Nintendo Family Computer] - Cartridge ROM.nes",
    title: "Battle City (1985)",
    system: "NES",
    size: 24592,
    url: "/roms/(1985)%20Battle%20City%20(%E3%83%90%E3%83%88%E3%83%AB%E3%82%B7%E3%83%86%E3%82%A3%E3%83%BC)%20%5BNintendo%20Family%20Computer%5D%20-%20Cartridge%20ROM.nes",
    modifiedAt: 1725283680000,
  },
  {
    filename: "Super Mario Bros (E).nes",
    title: "Super Mario Bros",
    system: "NES",
    size: 40976,
    url: "/roms/Super%20Mario%20Bros%20(E).nes",
    modifiedAt: 1725284460000,
  },
];

const LOCAL_CUSTOM_ROMS_KEY = "netplay_local_custom_roms_v1";

export function getLocalStoredRoms(): ServerRomFile[] {
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOM_ROMS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ServerRomFile[];
  } catch (e) {
    console.warn("Could not parse local custom ROMs:", e);
    return [];
  }
}

export function saveLocalStoredRom(rom: ServerRomFile) {
  try {
    const existing = getLocalStoredRoms().filter((r) => r.filename !== rom.filename);
    existing.unshift(rom);
    localStorage.setItem(LOCAL_CUSTOM_ROMS_KEY, JSON.stringify(existing.slice(0, 30)));
  } catch (e) {
    console.warn("Could not save local custom ROM:", e);
  }
}

/**
 * Clean display title for game file
 */
export function formatRomDisplayTitle(filename: string): string {
  if (filename.includes("Battle City")) return "Battle City (1985)";
  if (filename.includes("Super Mario Bros")) return "Super Mario Bros";
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/^[\(\[]\d+[\)\]]\s*/, "") // remove leading (1985)
    .replace(/\[.*?\]/g, "") // remove bracketed tags
    .replace(/\(.*?\)/g, "") // remove paren tags
    .replace(/[_.-]+/g, " ")
    .trim() || filename;
}

/**
 * Robust fetch for available ROMs:
 * 1. Try /api/roms (active server)
 * 2. If fails or HTML SPA returned, try /roms/roms.json (static hosting)
 * 3. If fails, use DEFAULT_BUILTIN_ROMS
 * 4. Merge with locally uploaded ROMs
 */
export async function fetchAvailableRoms(): Promise<ServerRomFile[]> {
  let fetchedList: ServerRomFile[] = [];

  // Attempt 1: Server REST API
  try {
    const res = await fetch("/api/roms");
    const contentType = res.headers.get("content-type") || "";
    if (res.ok && contentType.includes("application/json")) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        fetchedList = data;
      }
    }
  } catch (e) {
    console.warn("/api/roms endpoint unavailable, trying static fallback:", e);
  }

  // Attempt 2: Static /roms/roms.json (works on static hosting, Vercel, Netlify, Github Pages, CDN, Nginx)
  if (fetchedList.length === 0) {
    try {
      const res = await fetch("/roms/roms.json");
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          fetchedList = data;
        }
      }
    } catch (e) {
      console.warn("Static /roms/roms.json fallback unavailable:", e);
    }
  }

  // Attempt 3: Built-in default catalog
  if (fetchedList.length === 0) {
    fetchedList = [...DEFAULT_BUILTIN_ROMS];
  }

  // Format titles cleanly if needed
  fetchedList = fetchedList.map((item) => ({
    ...item,
    title: formatRomDisplayTitle(item.filename),
  }));

  // Attempt 4: Merge local custom ROMs
  const localRoms = getLocalStoredRoms();
  const filenameMap = new Map<string, ServerRomFile>();

  for (const r of fetchedList) {
    filenameMap.set(r.filename, r);
  }
  for (const r of localRoms) {
    if (!filenameMap.has(r.filename)) {
      filenameMap.set(r.filename, r);
    }
  }

  return Array.from(filenameMap.values());
}

/**
 * Robust binary loader for a ROM file:
 * Attempts multiple URL formats to guarantee loading across all web server configurations.
 */
export async function loadRomBinaryBytes(rom: ServerRomFile): Promise<Uint8Array> {
  const urlsToTry = [
    rom.url,
    `/roms/${encodeURIComponent(rom.filename)}`,
    `/roms/${rom.filename}`,
    `roms/${encodeURIComponent(rom.filename)}`,
    `./roms/${encodeURIComponent(rom.filename)}`,
  ];

  const uniqueUrls = Array.from(new Set(urlsToTry.filter(Boolean)));
  let lastError: Error | null = null;

  for (const url of uniqueUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        // If static host returns HTML (SPA fallback), skip and try next
        if (contentType.includes("text/html") && !url.endsWith(".html")) {
          continue;
        }
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 0) {
          return new Uint8Array(buffer);
        }
      }
    } catch (e: any) {
      lastError = e;
    }
  }

  throw lastError || new Error(`Не вдалося завантажити файл гри (${rom.filename})`);
}
