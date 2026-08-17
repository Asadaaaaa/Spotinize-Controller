import { Normalizer } from './Normalizer.js';

export class TrackMatcher {
  /**
   * Validates whether a guess matches the target track.
   * Uses multi-layer matching: SpotifyId → exact title+artist → fuzzy similarity.
   * @param {Object} target - { title, artist, spotifyId }
   * @param {Object} guess - { title, artist, spotifyId }
   * @returns {boolean}
   */
  static isMatch(target, guess) {
    if (!target || !guess) return false;

    // Layer 1: Direct Spotify Track ID match (strip prefixes for cross-source compatibility)
    const targetRawId = this._extractRawSpotifyId(target.spotifyId);
    const guessRawId = this._extractRawSpotifyId(guess.spotifyId);
    if (targetRawId && guessRawId && targetRawId === guessRawId) {
      return true;
    }

    // Normalize title and artist
    const normTargetTitle = Normalizer.normalizeTitle(target.title);
    const normGuessTitle = Normalizer.normalizeTitle(guess.title);
    const normTargetArtist = Normalizer.normalizeArtist(target.artist);
    const normGuessArtist = Normalizer.normalizeArtist(guess.artist);

    // Layer 2: Title matching (exact, substring, or high similarity)
    const titleMatch = this._isTitleMatch(normTargetTitle, normGuessTitle);

    // Layer 3: Artist matching (any artist overlap between multi-artist strings)
    const artistMatch = this._isArtistMatch(target.artist, guess.artist, normTargetArtist, normGuessArtist);

    // Both title AND artist must match
    if (titleMatch && artistMatch) {
      return true;
    }

    // Layer 4: Fallback fuzzy similarity check (title >= 0.85 AND artist >= 0.7)
    if (normTargetTitle.length > 2 && normGuessTitle.length > 2) {
      const titleSim = this._similarity(normTargetTitle, normGuessTitle);
      const artistSim = this._similarity(normTargetArtist, normGuessArtist);
      if (titleSim >= 0.85 && artistSim >= 0.7) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts raw Spotify ID by removing known prefixes (spotify_, daily_us_, daily_id_, itunes_, etc.)
   */
  static _extractRawSpotifyId(id) {
    if (!id || typeof id !== 'string') return null;
    // Remove known prefixes
    return id.replace(/^(spotify_|daily_(us|id)_|itunes_|sp_[a-zA-Z0-9]+_)/, '').trim() || null;
  }

  /**
   * Checks if titles match via exact comparison, substring inclusion, or high similarity.
   */
  static _isTitleMatch(normTarget, normGuess) {
    if (!normTarget || !normGuess) return false;

    // Exact match
    if (normTarget === normGuess) return true;

    // Substring inclusion (one contains the other)
    if (normTarget.length > 2 && normGuess.length > 2) {
      if (normTarget.includes(normGuess) || normGuess.includes(normTarget)) {
        return true;
      }
    }

    // High similarity (handles minor typos, word order differences)
    if (normTarget.length > 2 && normGuess.length > 2) {
      const sim = this._similarity(normTarget, normGuess);
      if (sim >= 0.85) return true;
    }

    return false;
  }

  /**
   * Checks if ANY artist in the target overlaps with ANY artist in the guess.
   * Handles multiple artists separated by comma, &, 'and', 'feat', 'ft', 'x'.
   */
  static _isArtistMatch(rawTarget, rawGuess, normPrimaryTarget, normPrimaryGuess) {
    // Primary artist exact match
    if (normPrimaryTarget && normPrimaryGuess) {
      if (normPrimaryTarget === normPrimaryGuess) return true;
      
      // Substring inclusion for primary artists
      if (normPrimaryTarget.length > 2 && normPrimaryGuess.length > 2) {
        if (normPrimaryTarget.includes(normPrimaryGuess) || normPrimaryGuess.includes(normPrimaryTarget)) {
          return true;
        }
      }
    }

    // Split ALL artists from both sides and check cross-match
    const targetArtists = this._splitAllArtists(rawTarget);
    const guessArtists = this._splitAllArtists(rawGuess);

    for (const tArtist of targetArtists) {
      for (const gArtist of guessArtists) {
        if (tArtist === gArtist) return true;
        if (tArtist.length > 2 && gArtist.length > 2) {
          if (tArtist.includes(gArtist) || gArtist.includes(tArtist)) return true;
          // Similarity check for artist names (handles "The Weeknd" vs "Weeknd" etc.)
          const sim = this._similarity(tArtist, gArtist);
          if (sim >= 0.80) return true;
        }
      }
    }

    return false;
  }

  /**
   * Splits artist string into individual normalized artist names.
   */
  static _splitAllArtists(artist) {
    if (!artist || typeof artist !== 'string') return [];
    
    return artist
      .toLowerCase()
      .split(/,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bx\b/i)
      .map(a => {
        let cleaned = a.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        cleaned = cleaned.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        return cleaned;
      })
      .filter(a => a.length > 0);
  }

  /**
   * Calculates Dice coefficient similarity between two strings.
   * Returns a value between 0 (no similarity) and 1 (identical).
   * Fast and effective for song title/artist comparison.
   */
  static _similarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    // Use bigram-based Dice coefficient
    const bigrams1 = this._getBigrams(str1);
    const bigrams2 = this._getBigrams(str2);

    if (bigrams1.size === 0 && bigrams2.size === 0) return 1;
    if (bigrams1.size === 0 || bigrams2.size === 0) return 0;

    let intersection = 0;
    for (const bigram of bigrams1) {
      if (bigrams2.has(bigram)) intersection++;
    }

    return (2.0 * intersection) / (bigrams1.size + bigrams2.size);
  }

  /**
   * Generates bigrams (character pairs) from a string.
   */
  static _getBigrams(str) {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  }
}

export default TrackMatcher;
