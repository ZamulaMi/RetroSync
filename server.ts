import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

const getAppDir = () => {
  try {
    if (typeof __dirname !== "undefined") return __dirname;
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};

const appDir = getAppDir();

interface RoomParticipant {
  ws: WebSocket;
  peerId: string;
  username: string;
  role: "player1" | "player2" | "spectator";
  isReady: boolean;
  ping: number;
}

interface Room {
  id: string; // 4-character code, e.g. "BC85"
  roomNumber: string; // 6-digit number, e.g. "852401"
  name: string;
  hostId: string;
  gameTitle: string;
  gameId?: string;
  system: string;
  romHash?: string;
  romSize?: number;
  netplayMode: "rollback" | "lockstep";
  frameDelay: number;
  participants: Map<string, RoomParticipant>;
  createdAt: number;
  isPrivate: boolean;
  inviteToken?: string;
  supportedGames?: string[];
  isPersistent?: boolean;
  emptySince?: number;
}

interface MatchmakingTicket {
  ticketId: string;
  peerId: string;
  ws: WebSocket;
  username: string;
  consoleSystem: string; // "NES" | "SNES" | "GBA" | "GB" | "GBC" | "ANY"
  supportedGames: string[]; // ["nes-netplay-arena-2p", ...] or ["ANY"]
  netplayMode: "rollback" | "lockstep";
  joinedAt: number;
}

interface SocketSession {
  roomId: string | null;
  peerId: string | null;
  username: string;
  isMatchmaking: boolean;
}

const rooms = new Map<string, Room>();
const roomsByNumber = new Map<string, Room>();
const matchmakingQueue = new Map<string, MatchmakingTicket>();
const socketSessions = new Map<WebSocket, SocketSession>();

function setSocketRoom(ws: WebSocket, roomId: string | null, peerId?: string | null, username?: string) {
  let session = socketSessions.get(ws);
  if (!session) {
    session = { roomId: null, peerId: null, username: username || "Player", isMatchmaking: false };
    socketSessions.set(ws, session);
  }
  session.roomId = roomId;
  if (peerId !== undefined && peerId !== null) session.peerId = peerId;
  if (username) session.username = username;
}

// Code and 6-digit number generators
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

function generateRoomNumber(): string {
  // 6-digit number between 100000 and 999999
  let num: string;
  let attempts = 0;
  do {
    num = Math.floor(100000 + Math.random() * 900000).toString();
    attempts++;
  } while (roomsByNumber.has(num) && attempts < 100);
  return num;
}

/**
 * Normalizes input which can be:
 * - full URL (https://domain.com/?room=BC85 or ?code=BC85 or ?num=852401)
 * - hash url (https://domain.com/#852401 or #room=BC85)
 * - code or number (#BC85, #852401, bc85, 852401)
 */
function parseRoomKey(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim();

  // If full URL with query
  if (clean.includes("?")) {
    try {
      const queryPart = clean.split("?")[1] || "";
      const searchParams = new URLSearchParams(queryPart.split("#")[0]);
      let matched = "";
      for (const [key, value] of searchParams.entries()) {
        const lower = key.toLowerCase();
        if (["code", "room", "num", "id", "roomid", "number"].includes(lower)) {
          matched = value;
          break;
        }
      }
      if (matched) clean = matched;
    } catch {
      // Fallback
    }
  }

  // If hash contains param or code
  if (clean.includes("#")) {
    const hashPart = clean.split("#")[1] || "";
    const hashMatch = hashPart.match(/(?:room|code|num|id|number)=([a-zA-Z0-9_-]+)/i);
    if (hashMatch && hashMatch[1]) {
      clean = hashMatch[1];
    } else {
      const pathMatch = hashPart.match(/(?:^|\/)([a-zA-Z0-9]{4,10})$/);
      if (pathMatch && pathMatch[1]) {
        clean = pathMatch[1];
      }
    }
  }

  // Query parameter pattern (e.g. room=BC85)
  const matchParam = clean.match(/(?:room|code|num|id|number)=([a-zA-Z0-9_-]+)/i);
  if (matchParam && matchParam[1]) {
    clean = matchParam[1];
  }

  // Path parameter pattern (/room/BC85 or /code/BC85)
  const matchPath = clean.match(/\/(?:room|code|num)\/([a-zA-Z0-9_-]+)/i);
  if (matchPath && matchPath[1]) {
    clean = matchPath[1];
  }

  const finalKey = clean.toUpperCase().replace(/^#/, "").trim();
  if (
    finalKey.startsWith("HTTP://") ||
    finalKey.startsWith("HTTPS://") ||
    finalKey.includes("/") ||
    finalKey.includes("?") ||
    finalKey.includes("&") ||
    finalKey.includes("=")
  ) {
    return "";
  }
  if (!/^[A-Z0-9_-]{3,12}$/.test(finalKey)) {
    return "";
  }
  return finalKey;
}

function findRoom(key: string): Room | undefined {
  if (!key) return undefined;
  const cleanKey = parseRoomKey(key);
  if (!cleanKey) return undefined;

  // 1. Direct match in 4-character code map
  if (rooms.has(cleanKey)) return rooms.get(cleanKey);
  // 2. Direct match in 6-digit numeric room map
  if (roomsByNumber.has(cleanKey)) return roomsByNumber.get(cleanKey);
  // 3. Scan all rooms (in case of aliases or case variance)
  for (const r of rooms.values()) {
    if (
      r.id.toUpperCase() === cleanKey ||
      (r.roomNumber && r.roomNumber === cleanKey)
    ) {
      return r;
    }
  }
  return undefined;
}

// Seed community rooms so global search and 1-click joins are instantly responsive
function seedInitialLobbyRooms() {
  const initialRooms: Array<{
    id: string;
    num: string;
    name: string;
    gameTitle: string;
    gameId: string;
    system: string;
    mode: "rollback" | "lockstep";
  }> = [
    {
      id: "BC85",
      num: "852401",
      name: "Battle City (1985) - 2P Co-Op Tank Duel",
      gameTitle: "Battle City (1985)",
      gameId: "nes-battle-city",
      system: "NES",
      mode: "rollback",
    },
    {
      id: "AREN",
      num: "109342",
      name: "Retro 2P Combat Arena - Championship",
      gameTitle: "Retro 2P Combat Arena (NES)",
      gameId: "nes-netplay-arena-2p",
      system: "NES",
      mode: "rollback",
    },
    {
      id: "PONG",
      num: "374619",
      name: "Hyper Pong Championship 60FPS Netplay",
      gameTitle: "Hyper Pong Championship (NES)",
      gameId: "nes-netplay-pong",
      system: "NES",
      mode: "rollback",
    },
    {
      id: "GBLK",
      num: "551928",
      name: "Game Boy Link Duel 2-Player",
      gameTitle: "Game Boy Link Duel (GB)",
      gameId: "gb-link-battle",
      system: "GB",
      mode: "lockstep",
    },
  ];

  for (const item of initialRooms) {
    const existing = rooms.get(item.id);
    if (!existing) {
      const dummyRoom: Room = {
        id: item.id,
        roomNumber: item.num,
        name: item.name,
        hostId: "host_" + item.id.toLowerCase(),
        gameTitle: item.gameTitle,
        gameId: item.gameId,
        system: item.system,
        netplayMode: item.mode,
        frameDelay: 2,
        isPrivate: false,
        inviteToken: "inv_" + item.id.toLowerCase(),
        supportedGames: [item.gameId],
        participants: new Map(),
        createdAt: Date.now() - 3600000,
        isPersistent: true,
      };
      rooms.set(item.id, dummyRoom);
      roomsByNumber.set(item.num, dummyRoom);
    } else {
      existing.isPersistent = true;
      if (!existing.roomNumber) existing.roomNumber = item.num;
      roomsByNumber.set(item.num, existing);
    }
  }
}
seedInitialLobbyRooms();

// Default demo fallback games by system
const SYSTEM_DEFAULT_GAMES: Record<string, { id: string; title: string; system: string }> = {
  NES: { id: "nes-netplay-arena-2p", title: "Retro 2P Combat Arena (NES)", system: "NES" },
  SNES: { id: "snes-super-strike", title: "Super Famicom 16-Bit Battle (SNES)", system: "SNES" },
  GBA: { id: "gba-micro-combat", title: "GBA 32-Bit Dual Strike (GBA)", system: "GBA" },
  GB: { id: "gb-link-battle", title: "Game Boy Link Duel (GB)", system: "GB" },
  GBC: { id: "gb-link-battle", title: "Game Boy Link Duel (GB)", system: "GB" },
  ANY: { id: "nes-netplay-arena-2p", title: "Retro 2P Combat Arena (NES)", system: "NES" },
};

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);

  // Open CORS & Preflight handling
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));

  // ROM Storage Directories (Checks public/roms, dist/roms, and root roms)
  const candidateRomDirs = [
    path.join(process.cwd(), "public", "roms"),
    path.join(process.cwd(), "dist", "roms"),
    path.join(process.cwd(), "roms"),
    path.join(appDir, "public", "roms"),
    path.join(appDir, "dist", "roms"),
    path.join(appDir, "roms"),
    path.join(appDir, "..", "public", "roms"),
    path.join(appDir, "..", "dist", "roms"),
  ];

  // Helper to get all existing directories
  const getExistingRomDirs = () => {
    return Array.from(new Set(candidateRomDirs)).filter((d) => fs.existsSync(d));
  };

  // Primary directory for saving uploaded ROMs
  const primaryUploadDir = path.join(process.cwd(), "public", "roms");
  if (!fs.existsSync(primaryUploadDir)) {
    try {
      fs.mkdirSync(primaryUploadDir, { recursive: true });
    } catch (e) {
      console.warn("Could not create primary ROM upload dir:", e);
    }
  }

  // REST API Routes
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      activeRooms: rooms.size,
      matchmakingQueueLength: matchmakingQueue.size,
      timestamp: Date.now(),
    });
  });

  // Get ROMs located in /public/roms or /dist/roms folders
  app.get("/api/roms", (_req, res) => {
    try {
      const dirs = getExistingRomDirs();
      const romMap = new Map<string, any>();

      for (const dir of dirs) {
        try {
          const files = fs.readdirSync(dir);
          for (const filename of files) {
            const lower = filename.toLowerCase();
            if (
              lower.endsWith(".nes") ||
              lower.endsWith(".gba") ||
              lower.endsWith(".gb") ||
              lower.endsWith(".gbc") ||
              lower.endsWith(".sfc") ||
              lower.endsWith(".smc") ||
              lower.endsWith(".bin")
            ) {
              if (!romMap.has(filename)) {
                const fullPath = path.join(dir, filename);
                const stat = fs.statSync(fullPath);
                let system = "NES";
                if (lower.endsWith(".gba")) system = "GBA";
                else if (lower.endsWith(".gbc")) system = "GBC";
                else if (lower.endsWith(".gb")) system = "GB";
                else if (lower.endsWith(".sfc") || lower.endsWith(".smc")) system = "SNES";

                let title = filename.replace(/\.[^/.]+$/, "").replace(/[_.-]+/g, " ");
                if (filename.includes("Battle City")) title = "Battle City (1985)";
                else if (filename.includes("Super Mario Bros")) title = "Super Mario Bros";

                romMap.set(filename, {
                  filename,
                  title,
                  system,
                  size: stat.size,
                  url: `/roms/${encodeURIComponent(filename)}`,
                  modifiedAt: stat.mtimeMs,
                });
              }
            }
          }
        } catch (dirErr) {
          console.warn(`Error reading dir ${dir}:`, dirErr);
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.json(Array.from(romMap.values()));
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list ROMs", details: err.message });
    }
  });

  // Upload a ROM file directly to ROM storage
  app.post("/api/roms/upload", (req, res) => {
    try {
      const { filename, base64Data } = req.body;
      if (!filename || !base64Data) {
        return res.status(400).json({ error: "filename and base64Data are required" });
      }

      const safeFilename = path.basename(filename);
      const targetPath = path.join(primaryUploadDir, safeFilename);
      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(targetPath, buffer);

      // Also copy to dist/roms if dist exists
      const distRomsDir = path.join(process.cwd(), "dist", "roms");
      if (fs.existsSync(distRomsDir)) {
        try {
          fs.writeFileSync(path.join(distRomsDir, safeFilename), buffer);
        } catch (e) {
          // ignore
        }
      }

      res.json({
        success: true,
        filename: safeFilename,
        size: buffer.length,
        url: `/roms/${encodeURIComponent(safeFilename)}`,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save ROM", details: err.message });
    }
  });

  // Statically serve ROM files from all potential directories
  candidateRomDirs.forEach((dir) => {
    if (fs.existsSync(dir)) {
      app.use("/roms", express.static(dir));
    }
  });

  // Get active public rooms with Global Search filter
  app.get("/api/rooms", (req, res) => {
    try {
      const q = (typeof req.query.q === "string" ? req.query.q : "").trim().toLowerCase();
      
      // Ensure seeded lobby rooms exist if empty
      if (rooms.size === 0) {
        seedInitialLobbyRooms();
      }

      const allRooms = Array.from(rooms.values());
      const mapped = allRooms.map((r) => ({
        id: r.id || "",
        code: r.id || "",
        roomNumber: r.roomNumber || "",
        name: r.name || "Retro Room",
        hostId: r.hostId || "",
        gameTitle: r.gameTitle || "Retro Game",
        gameId: r.gameId || "",
        system: r.system || "NES",
        netplayMode: r.netplayMode || "rollback",
        playerCount: r.participants ? r.participants.size : 0,
        hasPlayer1: r.participants ? Array.from(r.participants.values()).some((p) => p.role === "player1") : false,
        hasPlayer2: r.participants ? Array.from(r.participants.values()).some((p) => p.role === "player2") : false,
        isPrivate: !!r.isPrivate,
        createdAt: r.createdAt || Date.now(),
      }));

      let results = mapped;
      if (q) {
        results = mapped.filter((r) => {
          const codeMatch = (r.id || "").toLowerCase().includes(q);
          const numMatch = (r.roomNumber || "").toLowerCase().includes(q);
          const titleMatch = (r.gameTitle || "").toLowerCase().includes(q);
          const nameMatch = (r.name || "").toLowerCase().includes(q);
          const sysMatch = (r.system || "").toLowerCase().includes(q);
          // If exact code or number matched, show even if private
          if (codeMatch || numMatch) return true;
          return !r.isPrivate && (titleMatch || nameMatch || sysMatch);
        });
      } else {
        // Without query, show public rooms
        results = mapped.filter((r) => !r.isPrivate);
      }

      res.setHeader("Content-Type", "application/json");
      res.json(results);
    } catch (err: any) {
      console.error("Failed to search rooms:", err);
      res.status(500).json({ error: "Failed to search rooms", details: err?.message });
    }
  });

  // REST API: Get specific room details by 4-character code or 5-digit number
  app.get("/api/rooms/:id", (req, res) => {
    try {
      const room = findRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(sanitizeRoom(room));
    } catch (err: any) {
      res.status(500).json({ error: "Error retrieving room", details: err?.message });
    }
  });

  // REST API: Create room (immediate fallback if WebSocket is slow or disconnected)
  app.post("/api/rooms/create", (req, res) => {
    try {
      const {
        roomName,
        gameTitle,
        gameId,
        system,
        netplayMode,
        isPrivate,
        username,
        supportedGames,
      } = req.body || {};

      const newRoomId = generateRoomCode();
      const newRoomNumber = generateRoomNumber();
      const hostPeerId = "host_" + Math.random().toString(36).substring(2, 9);

      const newRoom: Room = {
        id: newRoomId,
        roomNumber: newRoomNumber,
        name: (roomName || "").trim() || `Кімната ${username || "Host"}`,
        hostId: hostPeerId,
        gameTitle: gameTitle || "Retro 2P Game",
        gameId: gameId || "nes-netplay-arena-2p",
        system: system || "NES",
        netplayMode: netplayMode || "rollback",
        frameDelay: 2,
        isPrivate: !!isPrivate,
        inviteToken: Math.random().toString(36).substring(2, 12),
        supportedGames: Array.isArray(supportedGames) ? supportedGames : ["ANY"],
        participants: new Map(),
        createdAt: Date.now(),
      };

      rooms.set(newRoomId, newRoom);
      roomsByNumber.set(newRoomNumber, newRoom);

      console.log(`[REST API] Created room #${newRoomNumber} (${newRoomId}): "${newRoom.name}"`);

      res.json({
        success: true,
        room: sanitizeRoom(newRoom),
        code: newRoomId,
        roomNumber: newRoomNumber,
        peerId: hostPeerId,
      });
    } catch (err: any) {
      console.error("Failed to create room via REST:", err);
      res.status(500).json({ error: "Failed to create room", details: err?.message });
    }
  });

  // Get Matchmaking queue telemetry & global network status
  app.get("/api/matchmaking/stats", (_req, res) => {
    let totalPlayers = 0;
    for (const r of rooms.values()) {
      totalPlayers += r.participants.size;
    }
    totalPlayers += matchmakingQueue.size;

    res.json({
      queueLength: matchmakingQueue.size,
      activeRooms: rooms.size,
      onlinePlayers: Math.max(totalPlayers, 1),
      cellularRelayActive: true,
      timestamp: Date.now(),
    });
  });

  // Matchmaking Resolution Engine
  function tryMatchmaking() {
    if (matchmakingQueue.size === 0) return;

    const tickets = Array.from(matchmakingQueue.values());
    const now = Date.now();

    // 1. Pair two waiting human players
    for (let i = 0; i < tickets.length; i++) {
      const ticketA = tickets[i];
      if (!matchmakingQueue.has(ticketA.peerId)) continue;
      if (ticketA.ws.readyState !== WebSocket.OPEN) {
        matchmakingQueue.delete(ticketA.peerId);
        continue;
      }

      for (let j = i + 1; j < tickets.length; j++) {
        const ticketB = tickets[j];
        if (!matchmakingQueue.has(ticketB.peerId)) continue;
        if (ticketB.ws.readyState !== WebSocket.OPEN) {
          matchmakingQueue.delete(ticketB.peerId);
          continue;
        }

        // Check console system compatibility
        const systemMatch =
          ticketA.consoleSystem === "ANY" ||
          ticketB.consoleSystem === "ANY" ||
          ticketA.consoleSystem === ticketB.consoleSystem;

        if (!systemMatch) continue;

        // Check supported games compatibility
        const aHasAnyGame =
          ticketA.supportedGames.length === 0 || ticketA.supportedGames.includes("ANY");
        const bHasAnyGame =
          ticketB.supportedGames.length === 0 || ticketB.supportedGames.includes("ANY");

        let matchedGameId = "nes-netplay-arena-2p";
        let matchedGameTitle = "Retro 2P Combat Arena (NES)";
        let matchedSystem = "NES";

        let gamesCompatible = false;
        if (aHasAnyGame && bHasAnyGame) {
          gamesCompatible = true;
          const chosenSys =
            ticketA.consoleSystem !== "ANY"
              ? ticketA.consoleSystem
              : ticketB.consoleSystem !== "ANY"
              ? ticketB.consoleSystem
              : "NES";
          const fallback = SYSTEM_DEFAULT_GAMES[chosenSys] || SYSTEM_DEFAULT_GAMES.NES;
          matchedGameId = fallback.id;
          matchedGameTitle = fallback.title;
          matchedSystem = fallback.system;
        } else if (aHasAnyGame && !bHasAnyGame) {
          gamesCompatible = true;
          matchedGameId = ticketB.supportedGames[0];
          matchedSystem = ticketB.consoleSystem !== "ANY" ? ticketB.consoleSystem : "NES";
          matchedGameTitle = `Netplay Duel (${matchedSystem})`;
        } else if (!aHasAnyGame && bHasAnyGame) {
          gamesCompatible = true;
          matchedGameId = ticketA.supportedGames[0];
          matchedSystem = ticketA.consoleSystem !== "ANY" ? ticketA.consoleSystem : "NES";
          matchedGameTitle = `Netplay Duel (${matchedSystem})`;
        } else {
          // Both have specific game lists - check intersection
          const intersection = ticketA.supportedGames.filter((g) =>
            ticketB.supportedGames.includes(g)
          );
          if (intersection.length > 0) {
            gamesCompatible = true;
            matchedGameId = intersection[0];
            matchedSystem = ticketA.consoleSystem !== "ANY" ? ticketA.consoleSystem : "NES";
            matchedGameTitle = `Netplay Duel (${matchedSystem})`;
          }
        }

        if (!gamesCompatible) continue;

        // Both players are compatible! Create a Match Room!
        matchmakingQueue.delete(ticketA.peerId);
        matchmakingQueue.delete(ticketB.peerId);

        const matchRoomId = generateRoomCode();
        const matchRoomNumber = generateRoomNumber();
        const mode =
          ticketA.netplayMode === "lockstep" && ticketB.netplayMode === "lockstep"
            ? "lockstep"
            : "rollback";

        const newRoom: Room = {
          id: matchRoomId,
          roomNumber: matchRoomNumber,
          name: `Quick Match: ${ticketA.username} vs ${ticketB.username}`,
          hostId: ticketA.peerId,
          gameTitle: matchedGameTitle,
          gameId: matchedGameId,
          system: matchedSystem,
          netplayMode: mode,
          frameDelay: 2,
          isPrivate: false,
          participants: new Map(),
          createdAt: Date.now(),
        };

        const participantA: RoomParticipant = {
          ws: ticketA.ws,
          peerId: ticketA.peerId,
          username: ticketA.username,
          role: "player1",
          isReady: true,
          ping: 0,
        };

        const participantB: RoomParticipant = {
          ws: ticketB.ws,
          peerId: ticketB.peerId,
          username: ticketB.username,
          role: "player2",
          isReady: true,
          ping: 0,
        };

        newRoom.participants.set(ticketA.peerId, participantA);
        newRoom.participants.set(ticketB.peerId, participantB);
        rooms.set(matchRoomId, newRoom);
        roomsByNumber.set(matchRoomNumber, newRoom);

        // Crucial: Bind socket sessions so input relay & WebRTC work immediately!
        setSocketRoom(ticketA.ws, matchRoomId, ticketA.peerId, ticketA.username);
        setSocketRoom(ticketB.ws, matchRoomId, ticketB.peerId, ticketB.username);

        // Notify Player 1 (Host)
        ticketA.ws.send(
          JSON.stringify({
            type: "match-found",
            roomId: matchRoomId,
            code: matchRoomId,
            roomNumber: matchRoomNumber,
            peerId: ticketA.peerId,
            role: "player1",
            opponentName: ticketB.username,
            gameId: matchedGameId,
            gameTitle: matchedGameTitle,
            system: matchedSystem,
            netplayMode: mode,
            room: sanitizeRoom(newRoom),
          })
        );

        // Notify Player 2 (Challenger)
        ticketB.ws.send(
          JSON.stringify({
            type: "match-found",
            roomId: matchRoomId,
            code: matchRoomId,
            roomNumber: matchRoomNumber,
            peerId: ticketB.peerId,
            role: "player2",
            opponentName: ticketA.username,
            gameId: matchedGameId,
            gameTitle: matchedGameTitle,
            system: matchedSystem,
            netplayMode: mode,
            room: sanitizeRoom(newRoom),
          })
        );

        console.log(
          `[Matchmaking] Paired ${ticketA.username} (P1) and ${ticketB.username} (P2) into ${matchRoomId} for ${matchedGameTitle}`
        );
        break;
      }
    }

    // 2. Check if waiting ticket can join an open room that needs Player 2
    for (const ticket of matchmakingQueue.values()) {
      if (ticket.ws.readyState !== WebSocket.OPEN) {
        matchmakingQueue.delete(ticket.peerId);
        continue;
      }

      for (const openRoom of rooms.values()) {
        if (!openRoom.isPrivate && openRoom.participants.size === 1) {
          const [hostPeerId, hostParticipant] = Array.from(openRoom.participants.entries())[0];
          if (hostPeerId === ticket.peerId) continue;

          if (
            ticket.consoleSystem !== "ANY" &&
            openRoom.system &&
            ticket.consoleSystem !== openRoom.system
          ) {
            continue;
          }

          matchmakingQueue.delete(ticket.peerId);

          const participant: RoomParticipant = {
            ws: ticket.ws,
            peerId: ticket.peerId,
            username: ticket.username,
            role: "player2",
            isReady: true,
            ping: 0,
          };
          openRoom.participants.set(ticket.peerId, participant);
          setSocketRoom(ticket.ws, openRoom.id, ticket.peerId, ticket.username);

          ticket.ws.send(
            JSON.stringify({
              type: "match-found",
              roomId: openRoom.id,
              code: openRoom.id,
              roomNumber: openRoom.roomNumber,
              peerId: ticket.peerId,
              role: "player2",
              opponentName: hostParticipant.username,
              gameId: openRoom.gameId,
              gameTitle: openRoom.gameTitle,
              system: openRoom.system,
              netplayMode: openRoom.netplayMode,
              room: sanitizeRoom(openRoom),
            })
          );

          broadcastToRoom(
            openRoom,
            {
              type: "peer-joined",
              peerId: ticket.peerId,
              username: ticket.username,
              role: "player2",
              room: sanitizeRoom(openRoom),
            },
            ticket.peerId
          );

          console.log(
            `[Matchmaking] Matched ${ticket.username} into waiting room ${openRoom.id} vs ${hostParticipant.username}`
          );
          break;
        }
      }
    }

    // 3. If searching for >= 3.5 seconds and no real opponent available, pair with active Challenger Bot
    for (const ticket of matchmakingQueue.values()) {
      if (ticket.ws.readyState !== WebSocket.OPEN) {
        matchmakingQueue.delete(ticket.peerId);
        continue;
      }

      const searchDuration = now - ticket.joinedAt;
      if (searchDuration >= 3500) {
        matchmakingQueue.delete(ticket.peerId);

        const botNames = [
          "RetroPro_UA 🇺🇦",
          "CyberChallenger 🤖",
          "ArcadeMaster_99 🕹️",
          "PixelWarrior ⚔️",
          "SpeedDemon_NES 🏎️",
        ];
        const botName = botNames[Math.floor(Math.random() * botNames.length)];
        const matchRoomId = generateRoomCode();
        const matchRoomNumber = generateRoomNumber();
        const botPeerId = "bot_" + Math.random().toString(36).substring(2, 8);

        const matchedSystem: string =
          ticket.consoleSystem === "ANY" ? "NES" : ticket.consoleSystem;
        const matchedGameId =
          ticket.supportedGames.includes("ANY") || ticket.supportedGames.length === 0
            ? matchedSystem === "GB" || matchedSystem === "GBC"
              ? "gb-link-battle"
              : "nes-netplay-arena-2p"
            : ticket.supportedGames[0];
        const matchedGameTitle =
          matchedGameId === "gb-link-battle"
            ? "Game Boy Link Duel (GB)"
            : matchedGameId === "nes-netplay-pong"
            ? "Hyper Pong Championship (NES)"
            : matchedGameId === "nes-battle-city"
            ? "Battle City (1985)"
            : "Retro 2P Combat Arena (NES)";

        const newRoom: Room = {
          id: matchRoomId,
          roomNumber: matchRoomNumber,
          name: `${ticket.username} vs ${botName}`,
          hostId: ticket.peerId,
          gameTitle: matchedGameTitle,
          gameId: matchedGameId,
          system: matchedSystem,
          netplayMode: ticket.netplayMode,
          frameDelay: 2,
          isPrivate: false,
          inviteToken: "inv_" + Math.random().toString(36).substring(2, 10),
          supportedGames: [matchedGameId],
          participants: new Map(),
          createdAt: now,
        };

        const participantUser: RoomParticipant = {
          ws: ticket.ws,
          peerId: ticket.peerId,
          username: ticket.username,
          role: "player1",
          isReady: true,
          ping: 0,
        };

        const participantBot: RoomParticipant = {
          ws: ticket.ws,
          peerId: botPeerId,
          username: botName,
          role: "player2",
          isReady: true,
          ping: 12,
        };

        newRoom.participants.set(ticket.peerId, participantUser);
        newRoom.participants.set(botPeerId, participantBot);

        rooms.set(matchRoomId, newRoom);
        roomsByNumber.set(matchRoomNumber, newRoom);
        setSocketRoom(ticket.ws, matchRoomId, ticket.peerId, ticket.username);

        try {
          ticket.ws.send(
            JSON.stringify({
              type: "match-found",
              roomId: matchRoomId,
              code: matchRoomId,
              roomNumber: matchRoomNumber,
              peerId: ticket.peerId,
              role: "player1",
              opponentName: botName,
              gameId: matchedGameId,
              gameTitle: matchedGameTitle,
              system: matchedSystem,
              netplayMode: ticket.netplayMode,
              room: sanitizeRoom(newRoom),
            })
          );
        } catch {}
        continue;
      }

      // Periodically update client with active queue status and count
      try {
        ticket.ws.send(
          JSON.stringify({
            type: "matchmaking-status",
            status: "searching",
            queueLength: matchmakingQueue.size,
            searchDurationSeconds: Math.floor(searchDuration / 1000),
          })
        );
      } catch {}
    }
  }

  // Periodic Matchmaking Queue Scanner
  setInterval(tryMatchmaking, 800);

  // Periodic cleanup for empty dynamic rooms (> 15 minutes inactive)
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
      if (!room.isPersistent && room.participants.size === 0 && room.emptySince) {
        if (now - room.emptySince > 15 * 60 * 1000) {
          rooms.delete(id);
          if (room.roomNumber) roomsByNumber.delete(room.roomNumber);
        }
      }
    }
  }, 60000);

  // WebSocket Server for WebRTC Signaling, Matchmaking & Room Management
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const rawUrl = request.url || "";
      const pathname = rawUrl.split("?")[0] || "/";
      if (
        pathname === "/ws" ||
        pathname === "/ws/" ||
        pathname.endsWith("/ws") ||
        pathname.endsWith("/ws/")
      ) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        // Not a /ws request
      }
    } catch (err) {
      console.error("WebSocket upgrade error:", err);
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    setSocketRoom(ws, null, null, "Player");

    ws.on("message", (rawMessage: string) => {
      try {
        const data = JSON.parse(rawMessage.toString());
        const { type, roomId, peerId } = data;
        const session = socketSessions.get(ws) || {
          roomId: null,
          peerId: null,
          username: "Player",
          isMatchmaking: false,
        };
        const currentRoomId = session.roomId || (roomId ? parseRoomKey(roomId) : null);
        const currentPeerId = session.peerId || peerId;

        switch (type) {
          case "start-matchmaking": {
            const { consoleSystem, supportedGames, netplayMode, username } = data;
            const myPeerId = peerId || "peer_" + Math.random().toString(36).substring(2, 9);
            session.peerId = myPeerId;
            session.username = username || "Player";
            session.isMatchmaking = true;

            const ticket: MatchmakingTicket = {
              ticketId: "ticket_" + Math.random().toString(36).substring(2, 9),
              peerId: myPeerId,
              ws,
              username: session.username,
              consoleSystem: consoleSystem || "ANY",
              supportedGames: Array.isArray(supportedGames) ? supportedGames : ["ANY"],
              netplayMode: netplayMode || "rollback",
              joinedAt: Date.now(),
            };

            matchmakingQueue.set(myPeerId, ticket);

            ws.send(
              JSON.stringify({
                type: "matchmaking-status",
                status: "searching",
                queueLength: matchmakingQueue.size,
                consoleSystem: ticket.consoleSystem,
                supportedGames: ticket.supportedGames,
              })
            );

            // Trigger immediate matchmaking attempt
            tryMatchmaking();
            break;
          }

          case "cancel-matchmaking": {
            if (session.peerId) {
              matchmakingQueue.delete(session.peerId);
            }
            session.isMatchmaking = false;
            ws.send(
              JSON.stringify({
                type: "matchmaking-status",
                status: "idle",
              })
            );
            break;
          }

          case "create-room": {
            const {
              roomName,
              gameTitle,
              gameId,
              system,
              netplayMode,
              frameDelay,
              username,
              isPrivate,
              supportedGames,
            } = data;
            const customCode = (roomId || "").trim().toUpperCase().replace(/^#/, "");
            const newRoomId = customCode.length === 4 ? customCode : generateRoomCode();
            const newRoomNumber = generateRoomNumber();
            const newPeerId = peerId || "peer_" + Math.random().toString(36).substring(2, 9);
            const inviteToken = "inv_" + Math.random().toString(36).substring(2, 10);

            // Remove from matchmaking if they were searching
            if (session.peerId) matchmakingQueue.delete(session.peerId);

            const newRoom: Room = {
              id: newRoomId,
              roomNumber: newRoomNumber,
              name: roomName || `Room #${newRoomNumber} (${newRoomId})`,
              hostId: newPeerId,
              gameTitle: gameTitle || "Retro 2P Combat Arena (NES)",
              gameId: gameId || "nes-netplay-arena-2p",
              system: system || "NES",
              netplayMode: netplayMode || "rollback",
              frameDelay: frameDelay ?? 2,
              isPrivate: Boolean(isPrivate),
              inviteToken,
              supportedGames: Array.isArray(supportedGames) ? supportedGames : [],
              participants: new Map(),
              createdAt: Date.now(),
            };

            const participant: RoomParticipant = {
              ws,
              peerId: newPeerId,
              username: username || "Host",
              role: "player1",
              isReady: true,
              ping: 0,
            };
            newRoom.participants.set(newPeerId, participant);
            rooms.set(newRoomId, newRoom);
            roomsByNumber.set(newRoomNumber, newRoom);

            setSocketRoom(ws, newRoomId, newPeerId, participant.username);

            ws.send(
              JSON.stringify({
                type: "room-created",
                roomId: newRoomId,
                code: newRoomId,
                roomNumber: newRoomNumber,
                peerId: newPeerId,
                role: "player1",
                inviteToken,
                room: sanitizeRoom(newRoom),
              })
            );
            break;
          }

          case "join-room": {
            const rawRoomId = (roomId || "").trim();
            const targetRoom = findRoom(rawRoomId);
            if (!targetRoom) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: `Кімнату "${rawRoomId}" не знайдено або термін її дії вичерпано. Перевірте 4-значний код (напр. BC85), 6-значний номер або посилання.`,
                })
              );
              return;
            }

            const targetRoomId = targetRoom.id;
            targetRoom.emptySince = undefined;

            if (session.peerId) matchmakingQueue.delete(session.peerId);

            const newPeerId = peerId || "peer_" + Math.random().toString(36).substring(2, 9);
            const hasP1 = Array.from(targetRoom.participants.values()).some(
              (p) => p.role === "player1"
            );
            const hasP2 = Array.from(targetRoom.participants.values()).some(
              (p) => p.role === "player2"
            );

            let assignedRole: "player1" | "player2" | "spectator" = "spectator";
            if (!hasP1 || targetRoom.participants.size === 0) {
              assignedRole = "player1";
              targetRoom.hostId = newPeerId;
            } else if (!hasP2) {
              assignedRole = "player2";
            }

            const participant: RoomParticipant = {
              ws,
              peerId: newPeerId,
              username:
                data.username ||
                (assignedRole === "player2" ? "Player 2" : `Player ${newPeerId.slice(-4)}`),
              role: assignedRole,
              isReady: false,
              ping: 0,
            };
            targetRoom.participants.set(newPeerId, participant);

            setSocketRoom(ws, targetRoomId, newPeerId, participant.username);

            // Notify joining client
            ws.send(
              JSON.stringify({
                type: "room-joined",
                roomId: targetRoomId,
                code: targetRoomId,
                roomNumber: targetRoom.roomNumber,
                peerId: newPeerId,
                role: assignedRole,
                gameId: targetRoom.gameId,
                gameTitle: targetRoom.gameTitle,
                system: targetRoom.system,
                room: sanitizeRoom(targetRoom),
              })
            );

            // Broadcast to existing peers in room
            broadcastToRoom(
              targetRoom,
              {
                type: "peer-joined",
                peerId: newPeerId,
                username: participant.username,
                role: assignedRole,
                room: sanitizeRoom(targetRoom),
              },
              newPeerId
            );
            break;
          }

          case "leave-room": {
            const activeRoomId = session.roomId || (roomId ? parseRoomKey(roomId) : null);
            const activePeerId = session.peerId || peerId;
            if (activeRoomId && activePeerId) {
              const room = rooms.get(activeRoomId);
              if (room) {
                room.participants.delete(activePeerId);
                if (room.participants.size === 0) {
                  if (room.isPersistent) {
                    room.participants.clear();
                    room.hostId = "host_" + room.id.toLowerCase();
                  } else {
                    room.emptySince = Date.now();
                  }
                } else {
                  if (room.hostId === activePeerId) {
                    const nextHost = Array.from(room.participants.values())[0];
                    room.hostId = nextHost.peerId;
                  }
                  broadcastToRoom(room, {
                    type: "peer-left",
                    peerId: activePeerId,
                    room: sanitizeRoom(room),
                  });
                }
              }
            }
            session.roomId = null;
            break;
          }

          case "change-role": {
            if (!currentRoomId || !currentPeerId) return;
            const room = findRoom(currentRoomId);
            if (!room) return;
            const participant = room.participants.get(currentPeerId);
            if (!participant) return;

            const newRole = data.role as "player1" | "player2" | "spectator";
            if (newRole !== "spectator") {
              const existing = Array.from(room.participants.values()).find(
                (p) => p.role === newRole && p.peerId !== currentPeerId
              );
              if (existing) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: `Слот ${newRole} зараз зайнятий іншим гравцем.`,
                  })
                );
                return;
              }
            }

            participant.role = newRole;
            broadcastToRoom(room, {
              type: "room-updated",
              room: sanitizeRoom(room),
            });
            break;
          }

          case "update-game": {
            if (!currentRoomId) return;
            const room = findRoom(currentRoomId);
            if (!room) return;
            if (data.name && typeof data.name === "string") {
              room.name = data.name.trim() || room.name;
            }
            room.gameTitle = data.gameTitle || room.gameTitle;
            room.gameId = data.gameId || room.gameId;
            room.system = data.system || room.system;
            room.romHash = data.romHash;
            room.romSize = data.romSize;
            room.netplayMode = data.netplayMode || room.netplayMode;
            room.frameDelay = data.frameDelay ?? room.frameDelay;

            broadcastToRoom(room, {
              type: "game-updated",
              name: room.name,
              gameTitle: room.gameTitle,
              gameId: room.gameId,
              system: room.system,
              romHash: room.romHash,
              romSize: room.romSize,
              netplayMode: room.netplayMode,
              frameDelay: room.frameDelay,
              room: sanitizeRoom(room),
            });
            break;
          }

          case "toggle-ready": {
            if (!currentRoomId || !currentPeerId) return;
            const room = findRoom(currentRoomId);
            if (!room) return;
            const participant = room.participants.get(currentPeerId);
            if (!participant) return;

            participant.isReady = !participant.isReady;
            broadcastToRoom(room, {
              type: "room-updated",
              room: sanitizeRoom(room),
            });
            break;
          }

          // WebRTC Signaling: Forward SDP offer, answer, and ICE candidates
          case "signal-offer":
          case "signal-answer":
          case "signal-ice":
          case "av-offer":
          case "av-answer":
          case "av-ice": {
            const activeRoomId = currentRoomId || (roomId ? parseRoomKey(roomId) : null);
            const room = activeRoomId ? findRoom(activeRoomId) : null;

            const targetPeerId = data.targetPeerId;
            let targetSocket: WebSocket | null = null;

            if (room && targetPeerId) {
              const target = room.participants.get(targetPeerId);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                targetSocket = target.ws;
              }
            }

            // Fallback: search across all active rooms if room ID had variations
            if (!targetSocket && targetPeerId) {
              for (const r of rooms.values()) {
                const p = r.participants.get(targetPeerId);
                if (p && p.ws.readyState === WebSocket.OPEN) {
                  targetSocket = p.ws;
                  break;
                }
              }
            }

            if (targetSocket) {
              targetSocket.send(
                JSON.stringify({
                  type: data.type,
                  senderPeerId: currentPeerId,
                  payload: data.payload,
                })
              );
            } else if (room) {
              broadcastToRoom(
                room,
                {
                  type: data.type,
                  senderPeerId: currentPeerId,
                  payload: data.payload,
                },
                currentPeerId || undefined
              );
            }
            break;
          }

          // Fallback Relay Channel & Sync Protocol
          case "netplay-input-relay":
          case "netplay-sync-state":
          case "netplay-desync-alert":
          case "game-sync-step":
          case "game-sync-ack":
          case "chat-message": {
            const activeRoomId = currentRoomId || (roomId ? parseRoomKey(roomId) : null);
            if (!activeRoomId) return;
            const room = findRoom(activeRoomId);
            if (!room) return;

            broadcastToRoom(
              room,
              {
                ...data,
                senderPeerId: currentPeerId,
              },
              currentPeerId || undefined
            );
            break;
          }

          case "ping": {
            ws.send(
              JSON.stringify({
                type: "pong",
                clientTimestamp: data.clientTimestamp,
                serverTimestamp: Date.now(),
              })
            );
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error("Error processing websocket message:", err);
      }
    });

    ws.on("close", () => {
      const session = socketSessions.get(ws);
      const closePeerId = session?.peerId;
      const closeRoomId = session?.roomId;

      if (closePeerId) {
        matchmakingQueue.delete(closePeerId);
      }

      if (closeRoomId && closePeerId) {
        const room = findRoom(closeRoomId);
        if (room) {
          room.participants.delete(closePeerId);
          if (room.participants.size === 0) {
            if (room.isPersistent) {
              room.participants.clear();
              room.hostId = "host_" + room.id.toLowerCase();
            } else {
              room.emptySince = Date.now();
            }
          } else {
            // If host left, reassign host
            if (room.hostId === closePeerId) {
              const nextHost = Array.from(room.participants.values())[0];
              room.hostId = nextHost.peerId;
            }
            broadcastToRoom(room, {
              type: "peer-left",
              peerId: closePeerId,
              room: sanitizeRoom(room),
            });
          }
        }
      }
      socketSessions.delete(ws);
    });
  });

  function broadcastToRoom(room: Room, message: Record<string, unknown>, excludePeerId?: string) {
    const payload = JSON.stringify(message);
    for (const [peerId, participant] of room.participants.entries()) {
      if (excludePeerId && peerId === excludePeerId) continue;
      if (participant.ws.readyState === WebSocket.OPEN) {
        participant.ws.send(payload);
      }
    }
  }

  function sanitizeRoom(room: Room) {
    return {
      id: room.id, // 4-character code (e.g. "A7X9")
      code: room.id,
      roomNumber: room.roomNumber, // 5-digit number (e.g. "48201")
      name: room.name,
      hostId: room.hostId,
      gameTitle: room.gameTitle,
      gameId: room.gameId,
      system: room.system,
      romHash: room.romHash,
      romSize: room.romSize,
      netplayMode: room.netplayMode,
      frameDelay: room.frameDelay,
      isPrivate: room.isPrivate,
      inviteToken: room.inviteToken,
      supportedGames: room.supportedGames,
      participants: Array.from(room.participants.values()).map((p) => ({
        peerId: p.peerId,
        username: p.username,
        role: p.role,
        isReady: p.isReady,
        ping: p.ping,
      })),
      createdAt: room.createdAt,
    };
  }

  // Vite middleware setup (auto-detects production container / dist bundle execution)
  const isProd =
    process.env.NODE_ENV === "production" ||
    !fs.existsSync(path.join(process.cwd(), "src", "main.tsx")) ||
    (typeof __filename !== "undefined" && (__filename.endsWith(".cjs") || __filename.includes("dist")));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const possibleDistDirs = [
      path.join(process.cwd(), "dist"),
      path.join(appDir, "dist"),
      process.cwd(),
      appDir,
    ];
    const distPath =
      possibleDistDirs.find((dir) => fs.existsSync(path.join(dir, "index.html"))) ||
      path.join(process.cwd(), "dist");

    console.log(`[Production Server] Serving client app from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server and WebRTC signaling running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
