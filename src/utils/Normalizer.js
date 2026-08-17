export class Normalizer {
  /**
   * Normalizes song title by removing feat, remaster, acoustic, bonus track info,
   * punctuation, special characters, and excessive spacing.
   * @param {string} title 
   * @returns {string}
   */
  static normalizeTitle(title) {
    if (!title || typeof title !== 'string') return '';

    let cleaned = title.toLowerCase();

    // Remove text inside parenthesis/brackets like (feat. ...), [Official Video], (Remastered 2021)
    cleaned = cleaned.replace(/\s*(\(|\[)(feat|featuring|with|ft|prod|remaster|live|official|audio|video|lyrics|deluxe|version|edit|mono|stereo|bonus track)[^\)\]]*(\)|\])/gi, '');
    
    // Remove "feat. xyz" or "ft. xyz" without brackets
    cleaned = cleaned.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i, '');

    // Remove "- Remastered", "- 2011 Remaster", "- Live"
    cleaned = cleaned.replace(/\s*-\s*(remastered|remaster|live|bonus track|single version|deluxe).*$/i, '');

    // Replace accents / diacritics
    cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Remove punctuation
    cleaned = cleaned.replace(/[^\w\s]/g, ' ');

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Normalizes artist name (extracts primary artist, cleans accents and symbols).
   * @param {string} artist 
   * @returns {string}
   */
  static normalizeArtist(artist) {
    if (!artist || typeof artist !== 'string') return '';

    let cleaned = artist.toLowerCase();

    // If multiple artists separated by comma, &, 'and', 'feat', take the first (primary artist)
    const primaryArtist = cleaned.split(/,|&|\band\b|\bfeat\.?\b|\bft\.?\b/i)[0].trim();

    // Replace accents / diacritics
    let normalized = primaryArtist.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Remove punctuation
    normalized = normalized.replace(/[^\w\s]/g, ' ');

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  /**
   * Generates a matching key for a song combining normalized title and normalized artist.
   * @param {string} title 
   * @param {string} artist 
   * @returns {string}
   */
  static getMatchKey(title, artist) {
    const normTitle = this.normalizeTitle(title);
    const normArtist = this.normalizeArtist(artist);
    return `${normTitle}:::${normArtist}`;
  }
}

export default Normalizer;
