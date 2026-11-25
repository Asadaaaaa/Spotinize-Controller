export class ScoringService {
  static BASE_SCORES = {
    0.1: 120,
    0.5: 95,
    1.0: 75,
    2.0: 55,
    3.0: 38,
    4.0: 22,
    5.0: 10
  };

  static ATTEMPT_MULTIPLIERS = {
    1: 1.0,
    2: 0.8,
    3: 0.6
  };

  /**
   * Returns the base score for a given reveal level.
   * @param {number} revealLevel
   * @returns {number}
   */
  calculateBaseScore(revealLevel) {
    const levelKey = Number(revealLevel);
    const keys = Object.keys(ScoringService.BASE_SCORES).map(Number);
    const closestKey = keys.reduce((prev, curr) =>
      Math.abs(curr - levelKey) < Math.abs(prev - levelKey) ? curr : prev
    );
    return ScoringService.BASE_SCORES[closestKey] || 10;
  }

  /**
   * Strict thinking time modifier:
   * Full score (1.0x) within 1.5s grace period, -4% per second after, floor 0.25x.
   * @param {number} thinkingTimeSeconds
   * @returns {number}
   */
  calculateThinkingModifier(thinkingTimeSeconds) {
    const safeTime = Math.max(0, Number(thinkingTimeSeconds) || 0);
    if (safeTime <= 1.5) {
      return 1.0;
    }
    const elapsedAfterGrace = safeTime - 1.5;
    const multiplier = 1.0 - (elapsedAfterGrace * 0.04);
    return Math.max(0.25, Math.round(multiplier * 100) / 100);
  }

  /**
   * Penalty multiplier for wrong attempts on the same track.
   * Attempt 1 -> 1.0x, Attempt 2 -> 0.8x, Attempt 3 -> 0.6x.
   */
  calculateAttemptMultiplier(attemptNumber = 1) {
    const clamped = Math.max(1, Math.min(3, Number(attemptNumber) || 1));
    return ScoringService.ATTEMPT_MULTIPLIERS[clamped] || 0.6;
  }

  /**
   * Calculates the final awarded score for a correct guess.
   */
  calculateFinalScore(revealLevel, thinkingTimeSeconds, attemptNumber = 1) {
    const baseScore = this.calculateBaseScore(revealLevel);
    const timeModifier = this.calculateThinkingModifier(thinkingTimeSeconds);
    const attemptMultiplier = this.calculateAttemptMultiplier(attemptNumber);
    return Math.round(baseScore * timeModifier * attemptMultiplier);
  }

  /**
   * Perfect Run Bonus (+50 pts) for 5/5 correct with 0 wrong guesses and 0 skips.
   */
  calculatePerfectRunBonus(correctCount, totalWrongGuesses, totalRounds) {
    if (totalRounds >= 5 && correctCount === totalRounds && totalWrongGuesses === 0) {
      return 50;
    }
    return 0;
  }
}

export const scoringService = new ScoringService();
export default scoringService;
