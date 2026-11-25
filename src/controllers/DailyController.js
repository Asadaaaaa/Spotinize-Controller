import { dailyChallengeService } from '../services/DailyChallengeService.js';
import { gameService } from '../services/GameService.js';
import { guestDailyService } from '../services/GuestDailyService.js';

function getGuestHeaders(req) {
  return {
    browserId: req.headers['x-browser-id'] || req.body?.browserId || req.query?.browserId || null,
    guestToken: req.headers['x-guest-token'] || req.body?.guestToken || req.query?.guestToken || null
  };
}

export class DailyController {
  async getStatus(req, res) {
    try {
      const status = await dailyChallengeService.getTodayStatus(req.user?.id || null);
      return res.json(status);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async play(req, res) {
    try {
      const result = await dailyChallengeService.startOrResumeDaily(req.user.id, gameService);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async getGuestStatus(req, res) {
    try {
      const status = await guestDailyService.getStatus(getGuestHeaders(req));
      return res.json(status);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async playGuest(req, res) {
    try {
      const result = await guestDailyService.startOrResume(getGuestHeaders(req));
      return res.json(result);
    } catch (err) {
      return res.status(403).json({ error: err.message });
    }
  }

  async getGuestGameState(req, res) {
    try {
      const state = guestDailyService.getGameState(req.params.gameId);
      return res.json(state);
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  }

  async startGuestTimer(req, res) {
    try {
      return res.json(guestDailyService.startTimer(req.params.gameId));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async revealGuestNext(req, res) {
    try {
      return res.json(guestDailyService.revealNext(req.params.gameId));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async submitGuestGuess(req, res) {
    try {
      return res.json(guestDailyService.submitGuess(req.params.gameId, req.body?.track));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async skipGuestRound(req, res) {
    try {
      return res.json(guestDailyService.skipRound(req.params.gameId));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async nextGuestRound(req, res) {
    try {
      return res.json(guestDailyService.nextRound(req.params.gameId));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const dailyController = new DailyController();
export default dailyController;
