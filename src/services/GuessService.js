import { TrackMatcher } from '../utils/TrackMatcher.js';
import { scoringService } from './ScoringService.js';

export class GuessService {
  /**
   * Validates guess and calculates strict score including wrong-attempt penalty.
   */
  processGuess(targetTrack, guessedTrack, currentAttemptsLeft, currentRevealLevel, thinkingTime) {
    const isCorrect = TrackMatcher.isMatch(targetTrack, guessedTrack);
    const remainingAttempts = Math.max(0, currentAttemptsLeft - 1);
    const attemptNumber = Math.max(1, Math.min(3, 4 - currentAttemptsLeft));

    if (isCorrect) {
      const pointsAwarded = scoringService.calculateFinalScore(
        currentRevealLevel,
        thinkingTime,
        attemptNumber
      );
      return {
        isCorrect: true,
        attemptNumber,
        remainingAttempts,
        pointsAwarded,
        isRoundOver: true,
        message: 'NAILED IT! 🎧'
      };
    }

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
      attemptNumber,
      remainingAttempts,
      pointsAwarded: 0,
      isRoundOver,
      message
    };
  }
}

export const guessService = new GuessService();
export default guessService;
