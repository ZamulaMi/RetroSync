/**
 * Room identification, parsing, and sharing utilities
 * Ensures robust support for 4-character codes, 6-digit numbers, and direct URL links.
 */

export interface FeaturedLobbyRoom {
  id: string;
  roomNumber: string;
  name: string;
  gameTitle: string;
  gameId: string;
  system: "NES" | "SNES" | "GBA" | "GB" | "GBC";
  netplayMode: "rollback" | "lockstep";
  description: string;
  badge: string;
}

export const FEATURED_LOBBY_ROOMS: FeaturedLobbyRoom[] = [
  {
    id: "BC85",
    roomNumber: "852401",
    name: "Battle City (1985)",
    gameTitle: "Battle City (1985)",
    gameId: "nes-battle-city",
    system: "NES",
    netplayMode: "rollback",
    description: "Кооперативний або дуельний танковий бій 2 гравців",
    badge: "Co-Op Duel",
  },
  {
    id: "AREN",
    roomNumber: "109342",
    name: "Retro 2P Combat Arena",
    gameTitle: "Retro 2P Combat Arena (NES)",
    gameId: "nes-netplay-arena-2p",
    system: "NES",
    netplayMode: "rollback",
    description: "Класичний аркадний бій двох гладіаторів на одній арені",
    badge: "PVP Arena",
  },
  {
    id: "PONG",
    roomNumber: "374619",
    name: "Hyper Pong 60FPS",
    gameTitle: "Hyper Pong Championship (NES)",
    gameId: "nes-netplay-pong",
    system: "NES",
    netplayMode: "rollback",
    description: "Швидкісний кібер-пінг-понг з нульовою затримкою введення",
    badge: "High Speed",
  },
  {
    id: "GBLK",
    roomNumber: "551928",
    name: "Game Boy Link Duel",
    gameTitle: "Game Boy Link Duel (GB)",
    gameId: "gb-link-battle",
    system: "GB",
    netplayMode: "lockstep",
    description: "Емуляція кабелю Game Link для покрокових ретро-битв",
    badge: "Link Cable",
  },
];

/**
 * Extracts a normalized 4-character code or numeric room number from:
 * - Full URLs: https://domain.com/?room=BC85, ?code=BC85, ?num=852401
 * - Hash URLs: https://domain.com/#852401, https://domain.com/#room=BC85
 * - Formatted strings: "#BC85", "#852401", "room=BC85"
 * - Raw codes or numbers: "BC85", "852401"
 */
export function parseRoomIdentifier(input: string): string {
  if (!input) return "";
  let text = input.trim();

  // 1. URL search params or query strings (case-insensitive key inspection)
  if (text.includes("?")) {
    try {
      const queryPart = text.split("?")[1] || "";
      const searchParams = new URLSearchParams(queryPart.split("#")[0]);
      let matched = "";
      for (const [key, value] of searchParams.entries()) {
        const lower = key.toLowerCase();
        if (["code", "room", "num", "id", "roomid", "number"].includes(lower)) {
          matched = value;
          break;
        }
      }
      if (matched) {
        text = matched;
      }
    } catch {
      // Fallback to regex
    }
  }

  // 2. Hash fragment parsing (#room=BC85 or #/room/BC85 or #852401 or #BC85)
  if (text.includes("#")) {
    const hashPart = text.split("#")[1] || "";
    const hashMatch = hashPart.match(/(?:room|code|num|id|number)=([a-zA-Z0-9_-]+)/i);
    if (hashMatch && hashMatch[1]) {
      text = hashMatch[1];
    } else {
      const directCodeMatch = hashPart.match(/(?:^|\/)([a-zA-Z0-9]{4,10})$/);
      if (directCodeMatch && directCodeMatch[1]) {
        text = directCodeMatch[1];
      }
    }
  }

  // 3. Query string pattern (e.g. "room=BC85" or "code=BC85" or "num=852401")
  const keyValMatch = text.match(/(?:room|code|num|id|number)=([a-zA-Z0-9_-]+)/i);
  if (keyValMatch && keyValMatch[1]) {
    text = keyValMatch[1];
  }

  // 4. URL path segment (/room/BC85 or /code/BC85)
  const pathMatch = text.match(/\/(?:room|code|num)\/([a-zA-Z0-9_-]+)/i);
  if (pathMatch && pathMatch[1]) {
    text = pathMatch[1];
  }

  // 5. Clean up leading # and whitespace
  let cleaned = text.replace(/^#/, "").trim().toUpperCase();

  // If the result still contains URL protocol, slashes, or query fragments, it is an unparseable URL
  if (
    cleaned.startsWith("HTTP://") ||
    cleaned.startsWith("HTTPS://") ||
    cleaned.includes("/") ||
    cleaned.includes("?") ||
    cleaned.includes("&") ||
    cleaned.includes("=")
  ) {
    return "";
  }

  // A valid room code is 3-6 chars (e.g. BC85, AREN) or a 5-8 digit number (e.g. 852401)
  if (!/^[A-Z0-9_-]{3,12}$/.test(cleaned)) {
    return "";
  }

  return cleaned;
}

/**
 * Detects the kind of room identifier provided by the user
 */
export function detectRoomIdentifierType(
  input: string
): "code" | "number" | "url" | "invalid" {
  const trimmed = (input || "").trim();
  if (!trimmed) return "invalid";

  const parsed = parseRoomIdentifier(trimmed);
  if (!parsed) return "invalid";

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.includes("?") ||
    trimmed.includes("/") ||
    trimmed.includes("#")
  ) {
    return "url";
  }

  if (/^[0-9]{5,8}$/.test(parsed)) {
    return "number";
  }

  if (/^[A-Z0-9]{3,6}$/i.test(parsed)) {
    return "code";
  }

  return "code";
}

/**
 * Builds an absolute shareable invitation link for a room
 */
export function buildRoomShareUrl(roomId: string, roomNumber?: string): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const pathname = window.location.pathname || "/";
  const params = new URLSearchParams();
  params.set("code", roomId);
  params.set("room", roomId);
  if (roomNumber) {
    params.set("num", roomNumber);
  }
  return `${origin}${pathname}?${params.toString()}`;
}
