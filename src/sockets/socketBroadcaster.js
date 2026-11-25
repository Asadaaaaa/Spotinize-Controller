import { gameRepository } from '../repositories/GameRepository.js';
import { gameService } from '../services/GameService.js';
import { reconnectService } from '../services/ReconnectService.js';
import { cosmeticService } from '../services/CosmeticService.js';

/**
 * Normalizes player objects for lobby:update payloads with cosmetics.
 */
export async function formatLobbyPlayers(players = []) {
  const raw = players.map(p => ({
    userId: p.userId,
    username: p.user?.username || null,
    displayName: p.user?.displayName || 'Player',
    avatarUrl: p.user?.avatarUrl || null,
    level: p.user?.level || 1,
    equippedFrameId: p.user?.equippedFrameId || null,
    equippedTitleId: p.user?.equippedTitleId || null,
    teamId: p.teamId || null,
    isReady: !!p.isReady,
    isHost: !!p.isHost,
    connectionStatus: p.connectionStatus || 'CONNECTED'
  }));
  return cosmeticService.hydrateUsersCosmetics(raw).catch(() => raw);
}

/**
 * Clears socket.gameId and removes every socket from the game's Socket.IO room.
 */
export function clearRoomSockets(io, gameId) {
  if (!io || !gameId) return;
  const roomName = `game:${gameId}`;
  const roomSet = io.sockets?.adapter?.rooms?.get(roomName);
  if (!roomSet) return;

  for (const socketId of [...roomSet]) {
    const s = io.sockets.sockets.get(socketId);
    if (s) {
      if (s.gameId === gameId) {
        s.gameId = null;
      }
      s.leave(roomName);
    }
  }
}

/**
 * Emits canonical lobby:update containing players, hostId, gameSubtype, and status.
 */
export async function broadcastLobbyUpdate(io, gameId) {
  if (!io || !gameId) return;
  const game = await gameRepository.findById(gameId);
  if (!game) return;
  const players = await gameRepository.getPlayersByGame(gameId, 'WAITING');
  const formattedPlayers = await formatLobbyPlayers(players);
  io.to(`game:${gameId}`).emit('lobby:update', {
    gameId,
    hostId: game.hostId,
    status: game.status,
    gameSubtype: game.gameSubtype || 'CLASSIC',
    players: formattedPlayers
  });
}

/**
 * Broadcasts game:finish and cleans up room timers & socket memberships.
 */
export function broadcastGameFinish(io, gameId, leaderboard, winner = null) {
  if (!io || !gameId) return;
  io.to(`game:${gameId}`).emit('game:finish', {
    leaderboard,
    winner: winner || leaderboard?.[0] || null
  });
  reconnectService.clearGameTimers(gameId);
  clearRoomSockets(io, gameId);
}

/**
 * Broadcasts player:left and subsequent lobby or match state updates.
 */
export async function broadcastLeaveOutcome(io, gameId, userId, previousStatus, reason = null) {
  if (!io || !gameId) return;

  io.to(`game:${gameId}`).emit('player:left', {
    userId,
    ...(reason ? { reason } : {})
  });

  if (previousStatus === 'WAITING') {
    const freshGame = await gameRepository.findById(gameId);
    if (!freshGame || freshGame.status === 'ABANDONED') {
      reconnectService.clearGameTimers(gameId);
      clearRoomSockets(io, gameId);
    } else {
      await broadcastLobbyUpdate(io, gameId);
    }
    return;
  }

  if (previousStatus === 'PLAYING' || previousStatus === 'STARTING') {
    const state = await gameService.getGameState(gameId, userId);
    if (!state) return;

    io.to(`game:${gameId}`).emit('ranking:update', {
      leaderboard: state.leaderboard
    });

    if (state.status === 'FINISHED' || state.isFinished) {
      broadcastGameFinish(io, gameId, state.leaderboard);
    } else if (state.status === 'ABANDONED') {
      reconnectService.clearGameTimers(gameId);
      clearRoomSockets(io, gameId);
    }
  }
}
