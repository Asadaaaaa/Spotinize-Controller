export class RevealService {
  static REVEAL_LEVELS = [0.1, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0];

  getRevealLevels() {
    return [...RevealService.REVEAL_LEVELS];
  }

  getCurrentReveal(level) {
    const num = Number(level);
    return RevealService.REVEAL_LEVELS.includes(num) ? num : 0.1;
  }

  canReveal(currentLevel) {
    const num = Number(currentLevel);
    const index = RevealService.REVEAL_LEVELS.indexOf(num);
    return index >= 0 && index < RevealService.REVEAL_LEVELS.length - 1;
  }

  revealNext(currentLevel) {
    const num = Number(currentLevel);
    const index = RevealService.REVEAL_LEVELS.indexOf(num);
    if (index === -1) {
      return RevealService.REVEAL_LEVELS[0];
    }
    if (index < RevealService.REVEAL_LEVELS.length - 1) {
      return RevealService.REVEAL_LEVELS[index + 1];
    }
    return RevealService.REVEAL_LEVELS[RevealService.REVEAL_LEVELS.length - 1];
  }

  isMaxReveal(currentLevel) {
    return Number(currentLevel) >= 5.0;
  }
}

export const revealService = new RevealService();
export default revealService;
