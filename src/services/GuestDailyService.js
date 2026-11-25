import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import { Track } from '../models/index.js';
import { dailyChallengeService } from './DailyChallengeService.js';
import { revealService } from './RevealService.js';
import { scoringService } from './ScoringService.js';
import { TrackMatcher } from '../utils/TrackMatcher.js';
import { getWibDateString } from '../utils/WibDate.js';
import { JWT_SECRET } from '../middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRIAL_STORE_PATH = path.resolve(__dirname, '../../.guest_daily_trials.json');

class GuestDailyService {
  constructor() {
    this.sessions = new Map(); // gameId -> session object
    this.browserToActiveGame = new Map(); // `${dailyDate}:${browserId}` -> gameId
    this.usedRecords = this._loadUsedRecords();
  }

  _loadUsedRecords() {
    try {
      if (fs.existsSync(TRIAL_STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(TRIAL_STORE_PATH, 'utf8'));
        return {
          browsers: Array.isArray(parsed?.browsers) ? parsed.browsers : [],
          tokens: Array.isArray(parsed?.tokens) ? parsed.tokens : []
        };
      }
    } catch (e) {}
    return { browsers: [], tokens: [] };
  }

  _saveUsedRecords() {
    try {
      fs.writeFileSync(
        TRIAL_STORE_PATH,
        JSON.stringify(
          {
            browsers: this.usedRecords.browsers.slice(-2000),
            tokens: this.usedRecords.tokens.slice(-2000)
          },
          null,
          2
        )
      );
    } catch (e) {}
  }

  _hashToken(token) {
    if (!token || typeof token !== 'string') return null;
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
  }

  _resolveGuestIdentity(browserId, guestToken) {
    let resolvedBrowserId = browserId ? String(browserId).trim().slice(0, 80) : null;
    let validToken = null;
    if (guestToken && typeof guestToken === 'string') {
      try {
        const decoded = jwt.verify(guestToken, JWT_SECRET);
        if (decoded?.type === 'guest') {
          validToken = guestToken;
          if (!resolvedBrowserId && decoded.browserId) {
            resolvedBrowserId = String(decoded.browserId).trim().slice(0, 80);
          }
        }
      } catch (e) {}
    }
    return {
      browserId: resolvedBrowserId,
      tokenHash: this._hashToken(validToken)
    };
  }

  hasUsedTrial(browserId, guestToken, targetDate = getWibDateString()) {
    const { browserId: bId, tokenHash } = this._resolveGuestIdentity(browserId, guestToken);
    if (bId && this.usedRecords.browsers.includes(`${targetDate}:${bId}`)) return true;
    if (tokenHash && this.usedRecords.tokens.includes(`${targetDate}:${tokenHash}`)) return true;
    return false;
  }

  _markTrialUsed(browserId, guestToken, targetDate = getWibDateString()) {
    const { browserId: bId, tokenHash } = this._resolveGuestIdentity(browserId, guestToken);
    let changed = false;
    const bKey = bId ? `${targetDate}:${bId}` : null;
    const tKey = tokenHash ? `${targetDate}:${tokenHash}` : null;
    if (bKey && !this.usedRecords.browsers.includes(bKey)) {
      this.usedRecords.browsers.push(bKey);
      changed = true;
    }
    if (tKey && !this.usedRecords.tokens.includes(tKey)) {
      this.usedRecords.tokens.push(tKey);
      changed = true;
    }
    if (changed) this._saveUsedRecords();
  }

  async getStatus({ browserId, guestToken }) {
    const todayWib = getWibDateString();
    const challenge = await dailyChallengeService.ensureTodayChallenge(todayWib);
    const { browserId: bId } = this._resolveGuestIdentity(browserId, guestToken);
    const activeGameId = bId ? this.browserToActiveGame.get(`${todayWib}:${bId}`) || null : null;
    const activeSession = activeGameId ? this.sessions.get(activeGameId) : null;
    const hasPlayedDaily = this.hasUsedTrial(browserId, guestToken, todayWib);

    return {
      dailyDate: todayWib,
      dailyNumber: challenge.dailyNumber,
      hasPlayedDaily,
      canResume: Boolean(activeSession && activeSession.status === 'PLAYING'),
      activeGameId: activeSession && activeSession.status === 'PLAYING' ? activeSession.id : null,
      status: activeSession
        ? (activeSession.status === 'FINISHED' ? 'COMPLETED' : 'IN_PROGRESS')
        : hasPlayedDaily
          ? 'COMPLETED'
          : 'NOT_STARTED'
    };
  }

  async startOrResume({ browserId, guestToken }) {
    const { browserId: bId } = this._resolveGuestIdentity(browserId, guestToken);
    if (!bId) {
      throw new Error('Browser ID diperlukan untuk mode Guest.');
    }

    const todayWib = getWibDateString();
    const challenge = await dailyChallengeService.ensureTodayChallenge(todayWib);
    const activeKey = `${todayWib}:${bId}`;
    const existingId = this.browserToActiveGame.get(activeKey);
    const existingSession = existingId ? this.sessions.get(existingId) : null;

    if (existingSession) {
      if (existingSession.status === 'FINISHED') {
        throw new Error(`Kamu sudah menyelesaikan Spotinize Daily #${challenge.dailyNumber} hari ini! Reset 00:00 WIB.`);
      }
      return {
        resumed: true,
        dailyNumber: challenge.dailyNumber,
        gameState: this._buildGameState(existingSession)
      };
    }

    if (this.hasUsedTrial(bId, guestToken, todayWib)) {
      throw new Error(`Kamu sudah memainkan Spotinize Daily #${challenge.dailyNumber} hari ini! Reset 00:00 WIB.`);
    }

    const trackIds = Array.isArray(challenge.trackIdsJson) ? challenge.trackIdsJson : [];
    const tracks = await Track.findAll({ where: { id: { [Op.in]: trackIds } } });
    const trackMap = new Map(tracks.map(t => [t.id, t]));
    const orderedTracks = trackIds.map(id => trackMap.get(id)).filter(Boolean);

    if (orderedTracks.length === 0) {
      throw new Error('Lagu Spotinize Daily tidak ditemukan.');
    }

    this._markTrialUsed(bId, guestToken, todayWib);

    const gameId = `guest_daily_${crypto.randomUUID()}`;
    const session = {
      id: gameId,
      browserId: bId,
      dailyDate: todayWib,
      dailyNumber: challenge.dailyNumber,
      mode: 'SOLO',
      gameSubtype: 'DAILY',
      category: 'Spotinize Daily',
      status: 'PLAYING',
      numberOfSongs: orderedTracks.length,
      currentRound: 1,
      score: 0,
      totalThinkingTime: 0,
      roundStartedAt: null,
      tracks: orderedTracks.map((t, idx) => ({
        roundNumber: idx + 1,
        id: t.id,
        spotifyId: t.spotifyId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        albumArt: t.albumArt,
        previewUrl: t.previewUrl,
        revealLevel: 0.1,
        remainingAttempts: 3,
        status: 'THINKING',
        pointsEarned: 0,
        thinkingTime: 0
      }))
    };

    this.sessions.set(gameId, session);
    this.browserToActiveGame.set(activeKey, gameId);

    return {
      resumed: false,
      dailyNumber: challenge.dailyNumber,
      gameState: this._buildGameState(session)
    };
  }

  _getSession(gameId) {
    const session = this.sessions.get(gameId);
    if (!session) throw new Error('Sesi trial Daily Guest tidak ditemukan atau sudah kadaluarsa.');
    return session;
  }

  _buildGameState(session) {
    const isFinished = session.status === 'FINISHED';
    const currentRoundObj = session.tracks[session.currentRound - 1] || session.tracks[session.tracks.length - 1];

    const playerPayload = {
      userId: 'guest',
      displayName: 'Guest',
      score: session.score,
      status: isFinished ? 'FINISHED' : currentRoundObj.status,
      currentRound: session.currentRound,
      currentRevealLevel: currentRoundObj.revealLevel,
      remainingAttempts: currentRoundObj.remainingAttempts,
      totalThinkingTime: Math.round(session.totalThinkingTime * 10) / 10,
      roundThinkingTime: currentRoundObj.thinkingTime
    };

    return {
      id: session.id,
      mode: 'SOLO',
      gameSubtype: 'DAILY',
      category: 'Spotinize Daily',
      status: session.status,
      isFinished,
      isWaitingForOthers: false,
      isGuestTrial: true,
      numberOfSongs: session.numberOfSongs,
      currentRound: session.currentRound,
      player: playerPayload,
      currentTrack: isFinished ? null : {
        id: currentRoundObj.id,
        spotifyId: currentRoundObj.spotifyId
      },
      gameTrackIds: session.tracks.map(t => t.id),
      tracks: isFinished
        ? session.tracks.map(t => ({
            id: t.id,
            spotifyId: t.spotifyId,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumArt: t.albumArt,
            previewUrl: t.previewUrl,
            isCorrect: t.status === 'GUESSED',
            pointsEarned: t.pointsEarned,
            revealLevel: t.revealLevel,
            thinkingTime: t.thinkingTime
          }))
        : [],
      leaderboard: [
        {
          userId: 'guest',
          displayName: 'Guest',
          score: session.score,
          totalThinkingTime: playerPayload.totalThinkingTime,
          status: playerPayload.status
        }
      ]
    };
  }

  getGameState(gameId) {
    return this._buildGameState(this._getSession(gameId));
  }

  startTimer(gameId) {
    const session = this._getSession(gameId);
    if (!session.roundStartedAt && session.status === 'PLAYING') {
      session.roundStartedAt = Date.now();
    }
    return { started: true };
  }

  revealNext(gameId) {
    const session = this._getSession(gameId);
    const round = session.tracks[session.currentRound - 1];
    if (!round || round.status !== 'THINKING') {
      return { player: this._buildGameState(session).player };
    }
    if (!session.roundStartedAt) session.roundStartedAt = Date.now();
    round.revealLevel = revealService.revealNext(round.revealLevel);
    return { player: this._buildGameState(session).player };
  }

  submitGuess(gameId, guessedTrack) {
    const session = this._getSession(gameId);
    const round = session.tracks[session.currentRound - 1];
    if (!round || round.status !== 'THINKING') {
      throw new Error('Ronde ini sudah selesai.');
    }

    const elapsedSec = session.roundStartedAt
      ? Math.max(0.1, (Date.now() - session.roundStartedAt) / 1000)
      : 1.0;

    const isCorrect = TrackMatcher.isMatch(
      { title: round.title, artist: round.artist, spotifyId: round.spotifyId },
      guessedTrack
    );

    if (isCorrect) {
      const attemptNumber = Math.max(1, 4 - (round.remainingAttempts || 3));
      const points = scoringService.calculateFinalScore(round.revealLevel, elapsedSec, attemptNumber);
      round.status = 'GUESSED';
      round.pointsEarned = points;
      round.thinkingTime = Math.round(elapsedSec * 10) / 10;
      session.score += points;
      session.totalThinkingTime += round.thinkingTime;
      session.roundStartedAt = null;

      return {
        isCorrect: true,
        isRoundOver: true,
        pointsEarned: points,
        remainingAttempts: round.remainingAttempts,
        targetTrack: {
          id: round.id,
          spotifyId: round.spotifyId,
          title: round.title,
          artist: round.artist,
          album: round.album,
          albumArt: round.albumArt,
          previewUrl: round.previewUrl
        }
      };
    }

    round.remainingAttempts = Math.max(0, round.remainingAttempts - 1);
    const isRoundOver = round.remainingAttempts <= 0;
    if (isRoundOver) {
      round.status = 'WRONG';
      round.thinkingTime = Math.round(elapsedSec * 10) / 10;
      session.totalThinkingTime += round.thinkingTime;
      session.roundStartedAt = null;
    }

    return {
      isCorrect: false,
      isRoundOver,
      pointsEarned: 0,
      remainingAttempts: round.remainingAttempts,
      targetTrack: isRoundOver
        ? {
            id: round.id,
            spotifyId: round.spotifyId,
            title: round.title,
            artist: round.artist,
            album: round.album,
            albumArt: round.albumArt,
            previewUrl: round.previewUrl
          }
        : null
    };
  }

  skipRound(gameId) {
    const session = this._getSession(gameId);
    const round = session.tracks[session.currentRound - 1];
    if (!round) throw new Error('Ronde tidak ditemukan.');
    if (round.status === 'THINKING') {
      const elapsedSec = session.roundStartedAt
        ? Math.max(0.1, (Date.now() - session.roundStartedAt) / 1000)
        : 0;
      round.status = 'SKIPPED';
      round.remainingAttempts = 0;
      round.thinkingTime = Math.round(elapsedSec * 10) / 10;
      session.totalThinkingTime += round.thinkingTime;
      session.roundStartedAt = null;
    }
    return {
      targetTrack: {
        id: round.id,
        spotifyId: round.spotifyId,
        title: round.title,
        artist: round.artist,
        album: round.album,
        albumArt: round.albumArt,
        previewUrl: round.previewUrl
      }
    };
  }

  nextRound(gameId) {
    const session = this._getSession(gameId);
    session.roundStartedAt = null;
    if (session.currentRound >= session.numberOfSongs) {
      session.status = 'FINISHED';
    } else {
      session.currentRound += 1;
    }
    return this._buildGameState(session);
  }
}

export const guestDailyService = new GuestDailyService();
export default guestDailyService;
