export class Timer {
  /**
   * Calculates elapsed seconds between two timestamps (in milliseconds).
   * @param {number|Date} startTime 
   * @param {number|Date} endTime 
   * @returns {number} elapsed seconds with 2 decimal precision
   */
  static getElapsedSeconds(startTime, endTime = Date.now()) {
    const start = startTime instanceof Date ? startTime.getTime() : startTime;
    const end = endTime instanceof Date ? endTime.getTime() : endTime;
    const diff = Math.max(0, end - start);
    return Math.round((diff / 1000) * 100) / 100;
  }

  /**
   * Applies the disconnection thinking time cap (+10 seconds max additional time).
   * Per plan spec Section 49:
   * Maximum additional Thinking Time during disconnect is 10 seconds.
   * @param {number} currentThinkingTime 
   * @param {number} disconnectDurationSeconds 
   * @returns {number}
   */
  static applyDisconnectCap(currentThinkingTime, disconnectDurationSeconds) {
    const additional = Math.min(10.0, Math.max(0, disconnectDurationSeconds));
    return Math.round((currentThinkingTime + additional) * 100) / 100;
  }
}

export default Timer;
