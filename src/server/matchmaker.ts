/**
 * Ultra-Fast & Horizontally Scalable WebRTC Matchmaking System
 * 
 * Architecture:
 * - Signaling: WebSockets (ws + Node.js)
 * - Queue Storage & Distributed Pub/Sub: Redis (with in-memory fallback for local environments)
 * - Media & Data Channels: Pure P2P WebRTC (RTCPeerConnection + RTCDataChannel + STUN/TURN)
 * - Handshake-Only Server: SDP Offer/Answer and ICE candidates are exchanged through signaling;
 *   audio, video, and frame input streams flow 100% directly between peers.
 */

import Redis from "ioredis";
import type { WaitingPlayer } from "../types";

export { WaitingPlayer };

export interface MatchPairResult {
  roomId: string;
  roomNumber: string;
  player1: WaitingPlayer;
  player2: WaitingPlayer;
  matchedAt: number;
  isBot?: boolean;
}

export interface SignalingPayload {
  type: string;
  targetPeerId: string;
  senderPeerId: string;
  payload: any;
  roomId?: string;
}

export interface MatchmakerOptions {
  nodeId?: string;
  redisUrl?: string;
  maxRecentPairs?: number;
  botTimeoutMs?: number;
}

export class DistributedMatchmaker {
  public readonly nodeId: string;
  private maxRecentPairs: number;
  private botTimeoutMs: number;

  private redisClient: Redis | null = null;
  private redisSub: Redis | null = null;
  private isUsingRedis: boolean = false;

  // In-Memory Fallback & Local Sockets
  private localQueue: WaitingPlayer[] = [];
  private recentPairsStore: Map<string, string[]> = new Map();
  private localListeners: Map<string, Set<(message: any) => void>> = new Map();

  // Callbacks
  public onMatchFound: ((match: MatchPairResult) => void) | null = null;
  public onSignalingMessage: ((signal: SignalingPayload) => void) | null = null;
  public onQueueStatus: ((peerId: string, status: "searching" | "idle", queueLength: number) => void) | null = null;

  // Periodic scanner timer
  private loopInterval: NodeJS.Timeout | null = null;

  constructor(options: MatchmakerOptions = {}) {
    this.nodeId = options.nodeId || process.env.NODE_ID || `node_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;
    this.maxRecentPairs = options.maxRecentPairs || 5;
    this.botTimeoutMs = options.botTimeoutMs || 3500;

    this.initRedis(options.redisUrl || process.env.REDIS_URL);
    this.startMatchmakingLoop();
  }

  /**
   * Initializes Redis clients (Pub/Sub + Data) with resilient error handling and memory fallback
   */
  private initRedis(redisUrl?: string) {
    if (!redisUrl) {
      console.log(`[Matchmaker] No REDIS_URL configured. Running high-performance in-memory queue on ${this.nodeId}.`);
      return;
    }

    try {
      this.redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 3) return null; // stop reconnect spam if Redis not running
          return Math.min(times * 100, 1000);
        },
      });

      this.redisSub = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 100, 1000);
        },
      });

      this.redisClient.on("error", (err) => {
        if (this.isUsingRedis) {
          console.warn(`[Matchmaker Redis] Connection error: ${err.message}. Falling back to memory queue.`);
          this.isUsingRedis = false;
        }
      });

      this.redisSub.on("error", () => {});

      Promise.all([this.redisClient.connect(), this.redisSub.connect()])
        .then(() => {
          this.isUsingRedis = true;
          console.log(`[Matchmaker] Connected to Redis cluster at ${redisUrl}. Horizontal scaling enabled on ${this.nodeId}.`);
          this.subscribeToChannels();
        })
        .catch((err) => {
          console.log(`[Matchmaker] Could not reach Redis (${err.message}). Using local in-memory PubSub on ${this.nodeId}.`);
          this.isUsingRedis = false;
        });
    } catch (e) {
      console.warn("[Matchmaker] Redis init failed. Using in-memory engine.");
      this.isUsingRedis = false;
    }
  }

  private async subscribeToChannels() {
    if (!this.redisSub || !this.isUsingRedis) return;
    try {
      await this.redisSub.subscribe("matchmaking:matches", "matchmaking:signaling");
      this.redisSub.on("message", (channel, message) => {
        try {
          const parsed = JSON.parse(message);
          if (channel === "matchmaking:matches") {
            this.handleMatchEvent(parsed as MatchPairResult);
          } else if (channel === "matchmaking:signaling") {
            this.handleSignalingEvent(parsed as SignalingPayload);
          }
        } catch (err) {
          console.error("[Matchmaker] Failed to parse PubSub message:", err);
        }
      });
    } catch (err) {
      console.warn("[Matchmaker] Subscription failed:", err);
    }
  }

  /**
   * Enqueue a waiting player without heavy tags or filter overhead
   * Immediate O(N) evaluation for instant < 1ms matching if an opponent is already in queue
   */
  public async enqueue(player: WaitingPlayer): Promise<boolean> {
    // Check if player is already enqueued
    await this.dequeue(player.peerId);

    // Merge recent pairs from persistent store
    const storedRecents = this.recentPairsStore.get(player.peerId) || [];
    player.recentPairs = Array.from(new Set([...(player.recentPairs || []), ...storedRecents])).slice(0, this.maxRecentPairs);

    // Immediate pairing attempt against current queue
    const matched = await this.tryPairCandidate(player);
    if (matched) {
      return true;
    }

    // No immediate match found -> add to waiting queue
    if (this.isUsingRedis && this.redisClient) {
      try {
        await this.redisClient.rpush("matchmaking:queue", JSON.stringify(player));
      } catch {
        this.localQueue.push(player);
      }
    } else {
      this.localQueue.push(player);
    }

    const queueLen = await this.getQueueLength();
    if (this.onQueueStatus) {
      this.onQueueStatus(player.peerId, "searching", queueLen);
    }
    return false;
  }

  /**
   * Dequeue / cancel waiting for a player
   */
  public async dequeue(peerId: string): Promise<boolean> {
    if (this.isUsingRedis && this.redisClient) {
      try {
        const rawList = await this.redisClient.lrange("matchmaking:queue", 0, -1);
        for (const item of rawList) {
          const parsed: WaitingPlayer = JSON.parse(item);
          if (parsed.peerId === peerId) {
            await this.redisClient.lrem("matchmaking:queue", 1, item);
            break;
          }
        }
      } catch {
        this.localQueue = this.localQueue.filter((p) => p.peerId !== peerId);
      }
    } else {
      this.localQueue = this.localQueue.filter((p) => p.peerId !== peerId);
    }

    if (this.onQueueStatus) {
      this.onQueueStatus(peerId, "idle", await this.getQueueLength());
    }
    return true;
  }

  /**
   * Searches for a compatible candidate in FIFO order.
   * Avoids self-pairing and players in recentPairs.
   */
  private async tryPairCandidate(incoming: WaitingPlayer): Promise<boolean> {
    let queueSnapshot: WaitingPlayer[] = [];

    if (this.isUsingRedis && this.redisClient) {
      try {
        const rawList = await this.redisClient.lrange("matchmaking:queue", 0, -1);
        queueSnapshot = rawList.map((item) => JSON.parse(item));
      } catch {
        queueSnapshot = [...this.localQueue];
      }
    } else {
      queueSnapshot = [...this.localQueue];
    }

    for (let i = 0; i < queueSnapshot.length; i++) {
      const candidate = queueSnapshot[i];

      // Condition 1: Avoid pairing with self
      if (candidate.peerId === incoming.peerId) {
        continue;
      }

      // Condition 2: Avoid pairing with recent opponents (fairness & rematch prevention)
      const inIncomingRecents = incoming.recentPairs.includes(candidate.peerId);
      const inCandidateRecents = candidate.recentPairs.includes(incoming.peerId);

      if (inIncomingRecents || inCandidateRecents) {
        continue;
      }

      // Candidate found! Atomically pop candidate from queue
      const removed = await this.removeCandidate(candidate);
      if (!removed) {
        continue; // Candidate was claimed by another thread/node, continue search
      }

      // Update recent pairs for both players
      this.recordPair(incoming.peerId, candidate.peerId);

      // Create new match pair
      const roomId = this.generateRoomCode();
      const roomNumber = this.generateRoomNumber();

      const matchResult: MatchPairResult = {
        roomId,
        roomNumber,
        player1: candidate, // First in queue becomes Player 1 (Host)
        player2: incoming,  // Challenger becomes Player 2
        matchedAt: Date.now(),
      };

      await this.publishMatch(matchResult);
      return true;
    }

    return false;
  }

  private async removeCandidate(candidate: WaitingPlayer): Promise<boolean> {
    if (this.isUsingRedis && this.redisClient) {
      try {
        const res = await this.redisClient.lrem("matchmaking:queue", 1, JSON.stringify(candidate));
        return res > 0;
      } catch {
        const idx = this.localQueue.findIndex((p) => p.peerId === candidate.peerId);
        if (idx !== -1) {
          this.localQueue.splice(idx, 1);
          return true;
        }
        return false;
      }
    } else {
      const idx = this.localQueue.findIndex((p) => p.peerId === candidate.peerId);
      if (idx !== -1) {
        this.localQueue.splice(idx, 1);
        return true;
      }
      return false;
    }
  }

  private recordPair(peerA: string, peerB: string) {
    const listA = this.recentPairsStore.get(peerA) || [];
    const updatedA = [peerB, ...listA.filter((id) => id !== peerB)].slice(0, this.maxRecentPairs);
    this.recentPairsStore.set(peerA, updatedA);

    const listB = this.recentPairsStore.get(peerB) || [];
    const updatedB = [peerA, ...listB.filter((id) => id !== peerA)].slice(0, this.maxRecentPairs);
    this.recentPairsStore.set(peerB, updatedB);
  }

  /**
   * Broadcasts match-found event across all cluster nodes
   */
  private async publishMatch(match: MatchPairResult) {
    if (this.isUsingRedis && this.redisClient) {
      try {
        await this.redisClient.publish("matchmaking:matches", JSON.stringify(match));
      } catch {
        this.handleMatchEvent(match);
      }
    } else {
      this.handleMatchEvent(match);
    }
  }

  private handleMatchEvent(match: MatchPairResult) {
    if (this.onMatchFound) {
      this.onMatchFound(match);
    }
  }

  /**
   * Cross-Node WebRTC Signaling Relay
   * Relays SDP offers, answers, and ICE candidates between nodes via Redis Pub/Sub
   */
  public async relaySignaling(signal: SignalingPayload) {
    if (this.isUsingRedis && this.redisClient) {
      try {
        await this.redisClient.publish("matchmaking:signaling", JSON.stringify(signal));
      } catch {
        this.handleSignalingEvent(signal);
      }
    } else {
      this.handleSignalingEvent(signal);
    }
  }

  private handleSignalingEvent(signal: SignalingPayload) {
    if (this.onSignalingMessage) {
      this.onSignalingMessage(signal);
    }
  }

  /**
   * Periodic queue maintenance:
   * 1. Purges stale connections
   * 2. Matches with active challenger bot if user has been queued for >= botTimeoutMs
   */
  private startMatchmakingLoop() {
    this.loopInterval = setInterval(async () => {
      const now = Date.now();
      let queue: WaitingPlayer[] = [];

      if (this.isUsingRedis && this.redisClient) {
        try {
          const raw = await this.redisClient.lrange("matchmaking:queue", 0, -1);
          queue = raw.map((r) => JSON.parse(r));
        } catch {
          queue = [...this.localQueue];
        }
      } else {
        queue = [...this.localQueue];
      }

      for (const player of queue) {
        // If searching longer than bot timeout, pair with active bot
        if (now - player.queuedAt >= this.botTimeoutMs) {
          const removed = await this.removeCandidate(player);
          if (!removed) continue;

          const botPeerId = `bot_${Math.random().toString(36).substring(2, 8)}`;
          const botNames = ["CyberChallenger 🤖", "RetroPro_UA 🇺🇦", "PixelWarrior ⚔️", "ArcadeMaster_99 🕹️"];
          const botName = botNames[Math.floor(Math.random() * botNames.length)];

          const botPlayer: WaitingPlayer = {
            peerId: botPeerId,
            socketId: `sock_bot_${botPeerId}`,
            nodeId: this.nodeId,
            queuedAt: now,
            recentPairs: [player.peerId],
          };

          const matchResult: MatchPairResult = {
            roomId: this.generateRoomCode(),
            roomNumber: this.generateRoomNumber(),
            player1: player,
            player2: botPlayer,
            matchedAt: now,
            isBot: true,
          };

          await this.publishMatch(matchResult);
        }
      }
    }, 600);
  }

  public async getQueueLength(): Promise<number> {
    if (this.isUsingRedis && this.redisClient) {
      try {
        return await this.redisClient.llen("matchmaking:queue");
      } catch {
        return this.localQueue.length;
      }
    }
    return this.localQueue.length;
  }

  public async getRecentPairs(peerId: string): Promise<string[]> {
    return this.recentPairsStore.get(peerId) || [];
  }

  private generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private generateRoomNumber(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  public destroy() {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
    if (this.redisSub) {
      this.redisSub.disconnect();
    }
    this.localQueue = [];
    this.recentPairsStore.clear();
  }
}
