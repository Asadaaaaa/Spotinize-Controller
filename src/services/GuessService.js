import { TrackMatcher } from '../utils/TrackMatcher.js';
import { scoringService } from './ScoringService.js';

export class GuessService {
  /**
   * Validates guess and calculates score.
   * @param {Object} targetTrack 
   * @param {Object} guessedTrack - { title, artist, spotifyId }
   * @param {number} currentAttemptsLeft (before this guess)
   * @param {number} currentRevealLevel 
   * @param {number} thinkingTime 
   * @returns {Object} { isCorrect, remainingAttempts, pointsAwarded, isRoundOver, message }
   */
  processGuess(targetTrack, guessedTrack, currentAttemptsLeft, currentRevealLevel, thinkingTime) {
    const isCorrect = TrackMatcher.isMatch(targetTrack, guessedTrack);
    const remainingAttempts = Math.max(0, currentAttemptsLeft - 1);

    if (isCorrect) {
      const pointsAwarded = scoringService.calculateFinalScore(currentRevealLevel, thinkingTime);
      return {
        isCorrect: true,
        remainingAttempts,
        pointsAwarded,
        isRoundOver: true,
        message: 'NAILED IT! 🎧'
      };
    } else {
      const isRoundOver = remainingAttempts <= 0;
      let message = 'Nope 😭 Coba lagi!';
      if (remainingAttempts === 2) {
        message = 'Nope! 2 tebakan tersisa.';
      } else if (remainingAttempts === 1) {
        message = 'Bukan lagu ini. 1 tebakan terakhir!';
      } else if (isRoundOver) {
        message = 'Kesempatan habis!';
      }

      return {
        isCorrect: false,
        remainingAttempts,
        pointsAwarded: 0,
        isRoundOver,
        message
      };
    }
  }
}

export const guessService = new GuessService();
export default guessService;
