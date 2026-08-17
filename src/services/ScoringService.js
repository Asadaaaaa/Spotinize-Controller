export class ScoringService {
  static BASE_SCORES = {
    0.1: 100,
    0.5: 90,
    1.0: 80,
    2.0: 65,
    3.0: 50,
    4.0: 35,
    5.0: 20
  };

  /**
   * Returns the base score for a given reveal level.
   * @param {number} revealLevel 
   * @returns {number}
   */
  calculateBaseScore(revealLevel) {
    const levelKey = Number(revealLevel);
    // Find closest key in BASE_SCORES if floating point diff
    const keys = Object.keys(ScoringService.BASE_SCORES).map(Number);
    const closestKey = keys.reduce((prev, curr) => 
      Math.abs(curr - levelKey) < Math.abs(prev - levelKey) ? curr : prev
    );
    return ScoringService.BASE_SCORES[closestKey] || 20;
  }

  /**
   * Calculates thinking time modifier.
   * Player gets full score (1.0x) for answers within 2 seconds.
   * Gentle decay afterwards, with a minimum floor of 0.4x.
   * @param {number} thinkingTimeSeconds 
   * @returns {number}
   */
  calculateThinkingModifier(thinkingTimeSeconds) {
    if (thinkingTimeSeconds <= 2.0) {
      return 1.0;
    }
    const elapsedAfterGrace = thinkingTimeSeconds - 2.0;
    // Linear gentle decay: lose ~2% every second of thinking
    const multiplier = 1.0 - (elapsedAfterGrace * 0.02);
    return Math.max(0.4, Math.round(multiplier * 100) / 100);
  }

  /**
   * Calculates the final awarded score for a correct guess.
   * @param {number} revealLevel 
   * @param {number} thinkingTimeSeconds 
   * @returns {number}
   */
  calculateFinalScore(revealLevel, thinkingTimeSeconds) {
    const baseScore = this.calculateBaseScore(revealLevel);
    const modifier = this.calculateThinkingModifier(thinkingTimeSeconds);
    return Math.round(baseScore * modifier);
  }
}

export const scoringService = new ScoringService();
export default scoringService;
