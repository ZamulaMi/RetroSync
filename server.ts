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
  id: string; // 4-character code, e.g. "A7X9"
  roomNumber: string; // 5-digit number, e.g. "48201"
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

const rooms = new Map<string, Room>();
const roomsByNumber = new Map<string, Room>();
const matchmakingQueue = new Map<string, MatchmakingTicket>();

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

function findRoom(key: string): Room | undefined {
  if (!key) return undefined;
  const cleanKey = key.trim().toUpperCase().replace(/^#/, "");
  // 1. Direct match in 4-character code map
  if (rooms.has(cleanKey)) return rooms.get(cleanKey);
  // 2. Direct match in 6-digit / numeric room map
  if (roomsByNumber.has(cleanKey)) return roomsByNumber.get(cleanKey);
  // 3. Scan all rooms (in case of aliases or case variance)
  for (const r of rooms.values()) {
    if (r.id.toUpperCase() === cleanKey || r.roomNumber === cleanKey) {
      return r;
    }
  }
  return undefined;
}

// Seed community rooms so global search is instantly responsive
function seedInitialLobbyRooms() {
  if (rooms.size > 0) return;
  const initialRooms: Array<{ id: string; num: string; name: string; gameTitle: string; gameId: string; system: string; mode: "rollback" | "lockstep" }> = [
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
    };
    rooms.set(item.id, dummyRoom);
    roomsByNumber.set(item.num, dummyRoom);
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
      
      const allRooms = Array.from(rooms.values());
      const mapped = allRooms.map((r) => ({
        id: r.id, // 4-character code (e.g. "BC85")
        code: r.id,
        roomNumber: r.roomNumber || "", // 6-digit number (e.g. "852401")
        name: r.name,
        hostId: r.hostId,
        gameTitle: r.gameTitle,
        gameId: r.gameId,
        system: r.system,
        netplayMode: r.netplayMode,
        playerCount: r.participants.size,
        hasPlayer1: Array.from(r.participants.values()).some((p) => p.role === "player1"),
        hasPlayer2: Array.from(r.participants.values()).some((p) => p.role === "player2"),
        isPrivate: r.isPrivate,
        createdAt: r.createdAt,
      }));

      let results = mapped;
      if (q) {
        results = mapped.filter((r) => {
          const codeMatch = r.id.toLowerCase() === q || r.id.toLowerCase().includes(q);
          const numMatch = r.roomNumber.toLowerCase() === q || r.roomNumber.toLowerCase().includes(q);
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
      res.status(500).json({ error: "Failed to search rooms", details: err?.message });
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
    if (matchmakingQueue.size < 2) return;

    const tickets = Array.from(matchmakingQueue.values());
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
          `[Matchmaking] Successfully paired ${ticketA.username} (P1) and ${ticketB.username} (P2) into ${matchRoomId} for ${matchedGameTitle}`
        );
        break; // Continue scanning remaining queue
      }
    }
  }

  // Periodic Matchmaking Queue Scanner
  setInterval(tryMatchmaking, 1000);

  // WebSocket Server for WebRTC Signaling, Matchmaking & Room Management
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      if (url.pathname === "/ws" || url.pathname === "/ws/") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        // If it's not a /ws request and Vite dev server is running, Vite might handle its own or ignore
      }
    } catch (err) {
      console.error("WebSocket upgrade error:", err);
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    let currentPeerId: string | null = null;
    let isMatchmaking = false;

    ws.on("message", (rawMessage: string) => {
      try {
        const data = JSON.parse(rawMessage.toString());
        const { type, roomId, peerId } = data;

        switch (type) {
          case "start-matchmaking": {
            const { consoleSystem, supportedGames, netplayMode, username } = data;
            const myPeerId = peerId || "peer_" + Math.random().toString(36).substring(2, 9);
            currentPeerId = myPeerId;
            isMatchmaking = true;

            const ticket: MatchmakingTicket = {
              ticketId: "ticket_" + Math.random().toString(36).substring(2, 9),
              peerId: myPeerId,
              ws,
              username: username || "Player",
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
            if (currentPeerId) {
              matchmakingQueue.delete(currentPeerId);
            }
            isMatchmaking = false;
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
            if (currentPeerId) matchmakingQueue.delete(currentPeerId);

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

            currentRoomId = newRoomId;
            currentPeerId = newPeerId;

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
                  message: `Room "${rawRoomId}" was not found or has expired. Please verify the 4-character code or 5-digit number.`,
                })
              );
              return;
            }

            const targetRoomId = targetRoom.id;

            // Remove from matchmaking if they were searching
            if (currentPeerId) matchmakingQueue.delete(currentPeerId);

            const newPeerId = peerId || "peer_" + Math.random().toString(36).substring(2, 9);
            const hasP1 = Array.from(targetRoom.participants.values()).some(
              (p) => p.role === "player1"
            );
            const hasP2 = Array.from(targetRoom.participants.values()).some(
              (p) => p.role === "player2"
            );

            let assignedRole: "player1" | "player2" | "spectator" = "spectator";
            if (!hasP1) assignedRole = "player1";
            else if (!hasP2) assignedRole = "player2";

            const participant: RoomParticipant = {
              ws,
              peerId: newPeerId,
              username:
                data.username ||
                (assignedRole === "player2" ? "Player 2" : `Guest ${newPeerId.slice(-4)}`),
              role: assignedRole,
              isReady: false,
              ping: 0,
            };
            targetRoom.participants.set(newPeerId, participant);

            currentRoomId = targetRoomId;
            currentPeerId = newPeerId;

            // Notify joining client
            ws.send(
              JSON.stringify({
                type: "room-joined",
                roomId: targetRoomId,
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

          case "update-role": {
            if (!currentRoomId || !currentPeerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            const participant = room.participants.get(currentPeerId);
            if (!participant) return;

            const newRole = data.role as "player1" | "player2" | "spectator";
            // Check if role is taken
            if (newRole !== "spectator") {
              const existing = Array.from(room.participants.values()).find(
                (p) => p.role === newRole && p.peerId !== currentPeerId
              );
              if (existing) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: `Slot ${newRole} is currently occupied.`,
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
            const room = rooms.get(currentRoomId);
            if (!room) return;
            room.gameTitle = data.gameTitle || room.gameTitle;
            room.gameId = data.gameId || room.gameId;
            room.system = data.system || room.system;
            room.romHash = data.romHash;
            room.romSize = data.romSize;
            room.netplayMode = data.netplayMode || room.netplayMode;
            room.frameDelay = data.frameDelay ?? room.frameDelay;

            broadcastToRoom(room, {
              type: "game-updated",
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
            const room = rooms.get(currentRoomId);
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
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            const targetPeerId = data.targetPeerId;
            if (targetPeerId) {
              const target = room.participants.get(targetPeerId);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(
                  JSON.stringify({
                    type: data.type,
                    senderPeerId: currentPeerId,
                    payload: data.payload,
                  })
                );
              }
            } else {
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
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
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
      if (currentPeerId) {
        matchmakingQueue.delete(currentPeerId);
      }

      if (currentRoomId && currentPeerId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.participants.delete(currentPeerId);
          if (room.participants.size === 0) {
            rooms.delete(currentRoomId);
            if (room.roomNumber) {
              roomsByNumber.delete(room.roomNumber);
            }
          } else {
            // If host left, reassign host
            if (room.hostId === currentPeerId) {
              const nextHost = Array.from(room.participants.values())[0];
              room.hostId = nextHost.peerId;
            }
            broadcastToRoom(room, {
              type: "peer-left",
              peerId: currentPeerId,
              room: sanitizeRoom(room),
            });
          }
        }
      }
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

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
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
