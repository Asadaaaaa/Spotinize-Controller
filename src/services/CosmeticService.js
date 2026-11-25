import { Op, fn, col } from 'sequelize';
import { CosmeticItem, UserItem, User } from '../models/index.js';

export const RARITY_ORDER = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

const DEFAULT_CATALOG = [
  // ================= STORE POOL (isStoreAvailable: true, isGachaAvailable: false) =================
  // Frames (COMMON: solid color only, RARE: simple static shapes, EPIC: ornate static shapes + optional icon, LEGENDARY/MYTHIC: animated)
  {
    code: 'store_frame_slate',
    name: 'Matte Slate Ring',
    description: 'Bingkai solid matte abu-abu gelap minimalis.',
    type: 'FRAME',
    rarity: 'COMMON',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 250,
    originTag: 'Spotinize Store',
    visualConfig: { ringStyle: 'solid', primaryColor: '#94a3b8', secondaryColor: '#475569', motif: 'none', animation: 'none' }
  },
  {
    code: 'store_frame_spotify_mint',
    name: 'Emerald Solid',
    description: 'Bingkai hijau solid ikonik Spotinize.',
    type: 'FRAME',
    rarity: 'COMMON',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 250,
    originTag: 'Spotinize Store',
    visualConfig: { ringStyle: 'solid', primaryColor: '#1db954', secondaryColor: '#14532d', motif: 'none', animation: 'none' }
  },
  {
    code: 'store_frame_cyan_wave',
    name: 'Cyan Dashed Ring',
    description: 'Bingkai garis putus geometris biru cyan.',
    type: 'FRAME',
    rarity: 'RARE',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 600,
    originTag: 'Spotinize Store',
    visualConfig: { ringStyle: 'dashed', primaryColor: '#38bdf8', secondaryColor: '#0284c7', motif: 'none', animation: 'none' }
  },
  {
    code: 'store_frame_amber_vinyl',
    name: 'Warm Diamond Rim',
    description: 'Bingkai amber dengan empat sudut berlian sederhana.',
    type: 'FRAME',
    rarity: 'RARE',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 600,
    originTag: 'Spotinize Store',
    visualConfig: { ringStyle: 'notched', primaryColor: '#f59e0b', secondaryColor: '#78350f', motif: 'none', animation: 'none' }
  },
  {
    code: 'store_frame_violet_synth',
    name: 'Violet Synthwave',
    description: 'Bingkai geometris ungu neon dengan emblem kilau.',
    type: 'FRAME',
    rarity: 'EPIC',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 1400,
    originTag: 'Spotinize Store',
    visualConfig: { ringStyle: 'faceted', primaryColor: '#a855f7', secondaryColor: '#4c1d95', motif: 'spark', animation: 'none' }
  },
  {
    code: 'store_frame_crimson_eq',
    name: 'Crimson Stage',
    description: 'Bingkai panggung merah tua dengan motif equalizer.',
    type: 'FRAME',
    rarity: 'EPIC',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 1400,
    originTag: 'Spotinize Store',
    visualConfig: { ringStyle: 'faceted', primaryColor: '#f43f5e', secondaryColor: '#881337', motif: 'equalizer', animation: 'none' }
  },
  {
    code: 'store_frame_royal_gold',
    name: 'Matte Gold Crest',
    description: 'Mahkota emas matte beranimasi elegan bagi kolektor Store.',
    type: 'FRAME',
    rarity: 'LEGENDARY',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 3200,
    originTag: 'Spotinize Store',
    visualConfig: { ringStyle: 'crown', primaryColor: '#facc15', secondaryColor: '#a16207', motif: 'crown', animation: 'shimmer' }
  },
  // Vinyl Skins (Store)
  {
    code: 'store_vinyl_emerald',
    name: 'Emerald Press Vinyl',
    description: 'Piringan vinyl solid hijau zamrud matte.',
    type: 'VINYL',
    rarity: 'COMMON',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 250,
    originTag: 'Spotinize Store',
    visualConfig: { discColor: '#0c2317', grooveColor: 'rgba(29, 185, 84, 0.25)', labelColor: '#1db954', rimColor: '#22c55e', style: 'solid' }
  },
  {
    code: 'store_vinyl_crimson',
    name: 'Crimson Disc',
    description: 'Piringan vinyl merah marun dengan garis geometris putus.',
    type: 'VINYL',
    rarity: 'RARE',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 600,
    originTag: 'Spotinize Store',
    visualConfig: { discColor: '#1f0b10', grooveColor: 'rgba(244, 63, 94, 0.28)', labelColor: '#e11d48', rimColor: '#fb7185', style: 'geometric' }
  },
  {
    code: 'store_vinyl_neon_rim',
    name: 'Neon Rim Turntable',
    description: 'Vinyl gelap dengan ukiran faset neon cyan.',
    type: 'VINYL',
    rarity: 'EPIC',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 1400,
    originTag: 'Spotinize Store',
    visualConfig: { discColor: '#080e1a', grooveColor: 'rgba(56, 189, 248, 0.3)', labelColor: '#0284c7', rimColor: '#38bdf8', style: 'faceted' }
  },
  {
    code: 'store_vinyl_matte_gold',
    name: 'Matte Gold Record',
    description: 'Piringan emas beranimasi eksklusif Store.',
    type: 'VINYL',
    rarity: 'LEGENDARY',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 3200,
    originTag: 'Spotinize Store',
    visualConfig: { discColor: '#1c1607', grooveColor: 'rgba(250, 204, 21, 0.35)', labelColor: '#ca8a04', rimColor: '#facc15', style: 'gold' }
  },
  // Titles (Store): COMMON = Music Genres, RARE = Occupations (Epic/Legendary/Mythic Store titles withheld)
  ...[
    { slug: 'pop', name: 'Pop', color: '#f472b6', bg: 'rgba(244, 114, 182, 0.14)' },
    { slug: 'rock', name: 'Rock', color: '#f87171', bg: 'rgba(248, 113, 113, 0.14)' },
    { slug: 'indie', name: 'Indie', color: '#34d399', bg: 'rgba(52, 211, 153, 0.14)' },
    { slug: 'hiphop', name: 'Hip-Hop', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.14)' },
    { slug: 'rnb', name: 'R&B', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.14)' },
    { slug: 'jazz', name: 'Jazz', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.14)' },
    { slug: 'edm', name: 'EDM', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.14)' },
    { slug: 'kpop', name: 'K-Pop', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.14)' },
    { slug: 'lofi', name: 'Lo-Fi', color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.14)' },
    { slug: 'metal', name: 'Metal', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.14)' },
    { slug: 'acoustic', name: 'Acoustic', color: '#a3e635', bg: 'rgba(163, 230, 53, 0.14)' },
    { slug: 'classical', name: 'Classical', color: '#e2e8f0', bg: 'rgba(226, 232, 240, 0.14)' }
  ].map(g => ({
    code: `store_title_genre_${g.slug}`,
    name: g.name,
    description: `Genre ${g.name}`,
    type: 'TITLE',
    rarity: 'COMMON',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 250,
    originTag: 'Spotinize Store',
    visualConfig: { color: g.color, bgColor: g.bg }
  })),
  ...[
    { slug: 'designer', name: 'Designer', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)' },
    { slug: 'engineer', name: 'Engineer', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.16)' },
    { slug: 'it', name: 'IT', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.16)' },
    { slug: 'doctor', name: 'Doctor', color: '#34d399', bg: 'rgba(52, 211, 153, 0.16)' },
    { slug: 'sales', name: 'Sales', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.16)' },
    { slug: 'singer', name: 'Singer', color: '#f472b6', bg: 'rgba(244, 114, 182, 0.16)' },
    { slug: 'painter', name: 'Painter', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.16)' },
    { slug: 'developer', name: 'Developer', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.16)' },
    { slug: 'architect', name: 'Architect', color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.16)' },
    { slug: 'writer', name: 'Writer', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.16)' },
    { slug: 'chef', name: 'Chef', color: '#f87171', bg: 'rgba(248, 113, 113, 0.16)' },
    { slug: 'photographer', name: 'Photographer', color: '#facc15', bg: 'rgba(250, 204, 21, 0.16)' }
  ].map(job => ({
    code: `store_title_job_${job.slug}`,
    name: job.name,
    description: job.name,
    type: 'TITLE',
    rarity: 'RARE',
    source: 'store',
    isStoreAvailable: true,
    isGachaAvailable: false,
    priceNotes: 600,
    originTag: 'Spotinize Store',
    visualConfig: { color: job.color, bgColor: job.bg }
  })),

  // ================= GACHA POOL (isStoreAvailable: false, isGachaAvailable: true) =================
  // COMMON (solid only, zero animation)
  {
    code: 'gacha_frame_graphite',
    name: 'Graphite Solid',
    description: 'Bingkai solid abu-abu grafit dari Crate Gacha.',
    type: 'FRAME',
    rarity: 'COMMON',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Crate',
    visualConfig: { ringStyle: 'solid', primaryColor: '#cbd5e1', secondaryColor: '#334155', motif: 'none', animation: 'none' }
  },
  {
    code: 'gacha_vinyl_cassette',
    name: 'Amber Matte Vinyl',
    description: 'Piringan vinyl warna amber matte klasik.',
    type: 'VINYL',
    rarity: 'COMMON',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Crate',
    visualConfig: { discColor: '#18181b', grooveColor: 'rgba(255,255,255,0.12)', labelColor: '#ea580c', rimColor: '#fb923c', style: 'solid' }
  },
  {
    code: 'gacha_title_earworm',
    name: 'Earworm Hunter',
    description: 'Gelar Gacha bagi yang hafal nada dalam sekejap.',
    type: 'TITLE',
    rarity: 'COMMON',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Crate',
    visualConfig: { color: '#a1a1aa', bgColor: 'rgba(161, 161, 170, 0.15)' }
  },
  {
    code: 'gacha_frame_mint_spark',
    name: 'Mint Solid',
    description: 'Bingkai solid hijau mint dari Crate Gacha.',
    type: 'FRAME',
    rarity: 'COMMON',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Crate',
    visualConfig: { ringStyle: 'solid', primaryColor: '#34d399', secondaryColor: '#065f46', motif: 'none', animation: 'none' }
  },
  // RARE (simple static geometric shapes, zero icon, zero animation)
  {
    code: 'gacha_frame_cobalt_spin',
    name: 'Cobalt Double Rim',
    description: 'Bingkai ganda biru kobalt statis.',
    type: 'FRAME',
    rarity: 'RARE',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Crate',
    visualConfig: { ringStyle: 'double', primaryColor: '#60a5fa', secondaryColor: '#1e3a8a', motif: 'none', animation: 'none' }
  },
  {
    code: 'gacha_vinyl_indigo',
    name: 'Deep Indigo Press',
    description: 'Piringan vinyl biru malam dengan cincin putus statis.',
    type: 'VINYL',
    rarity: 'RARE',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Crate',
    visualConfig: { discColor: '#0f1029', grooveColor: 'rgba(96, 165, 250, 0.28)', labelColor: '#3b82f6', rimColor: '#93c5fd', style: 'geometric' }
  },
  {
    code: 'gacha_title_tempo_freak',
    name: 'Tempo Prodigy',
    description: 'Menangkap ketukan sebelum lirik pertama masuk.',
    type: 'TITLE',
    rarity: 'RARE',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Crate',
    visualConfig: { color: '#60a5fa', bgColor: 'rgba(59, 130, 246, 0.16)' }
  },
  // EPIC (ornate static shapes + optional icon, zero animation)
  {
    code: 'gacha_frame_amethyst_eq',
    name: 'Amethyst Equalizer',
    description: 'Bingkai faset ungu amethyst dengan ikon equalizer.',
    type: 'FRAME',
    rarity: 'EPIC',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Exclusive',
    visualConfig: { ringStyle: 'faceted', primaryColor: '#c084fc', secondaryColor: '#6b21a8', motif: 'equalizer', animation: 'none' }
  },
  {
    code: 'gacha_vinyl_magenta',
    name: 'Synthwave Magenta',
    description: 'Vinyl Gacha eksklusif bergaya retro synth magenta.',
    type: 'VINYL',
    rarity: 'EPIC',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Exclusive',
    visualConfig: { discColor: '#1e0b24', grooveColor: 'rgba(232, 121, 249, 0.32)', labelColor: '#d946ef', rimColor: '#f0abfc', style: 'faceted' }
  },
  {
    code: 'gacha_title_sonic_phantom',
    name: 'Sonic Phantom',
    description: 'Gelar Epic eksklusif Crate Gacha.',
    type: 'TITLE',
    rarity: 'EPIC',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Exclusive',
    visualConfig: { color: '#e879f9', bgColor: 'rgba(217, 70, 239, 0.18)' }
  },
  // LEGENDARY (animated + ornate)
  {
    code: 'gacha_frame_solar_flare',
    name: 'Solar Flare Crown',
    description: 'Bingkai emas menyala berputar dengan mahkota puncak.',
    type: 'FRAME',
    rarity: 'LEGENDARY',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Exclusive • 5% Rate',
    visualConfig: { ringStyle: 'crown', primaryColor: '#fbbf24', secondaryColor: '#b45309', motif: 'crown', animation: 'spin' }
  },
  {
    code: 'gacha_vinyl_obsidian_gold',
    name: 'Obsidian Gold Master',
    description: 'Piringan kolektor obsidian beranimasi emas 24K.',
    type: 'VINYL',
    rarity: 'LEGENDARY',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Exclusive • 5% Rate',
    visualConfig: { discColor: '#0c0b09', grooveColor: 'rgba(251, 191, 36, 0.42)', labelColor: '#f59e0b', rimColor: '#fde047', style: 'gold' }
  },
  {
    code: 'gacha_title_golden_ear',
    name: 'Golden Ear Sovereign',
    description: 'Gelar Legendary dari Crate Gacha.',
    type: 'TITLE',
    rarity: 'LEGENDARY',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Exclusive • 5% Rate',
    visualConfig: { color: '#facc15', bgColor: 'rgba(250, 204, 21, 0.18)' }
  },
  // MYTHIC (animated prism)
  {
    code: 'gacha_frame_mythic_crimson',
    name: 'Mythic Astral Disc',
    description: 'Bingkai ultra-langka Mythic dengan aura crimson-emas berputar.',
    type: 'FRAME',
    rarity: 'MYTHIC',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Jackpot • 1% Rate',
    visualConfig: { ringStyle: 'prism', primaryColor: '#fb7185', secondaryColor: '#facc15', motif: 'spark', animation: 'spin' }
  },
  {
    code: 'gacha_vinyl_mythic_prism',
    name: 'Mythic Hologram Press',
    description: 'Vinyl ultra-langka Mythic dengan kilau prisma merah-emas.',
    type: 'VINYL',
    rarity: 'MYTHIC',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Jackpot • 1% Rate',
    visualConfig: { discColor: '#19080f', grooveColor: 'rgba(251, 113, 133, 0.45)', labelColor: '#f43f5e', rimColor: '#facc15', style: 'prism' }
  },
  {
    code: 'gacha_title_mythic_oracle',
    name: '0.1s Sound Oracle',
    description: 'Gelar Mythic terlangka untuk peramal melodi instan.',
    type: 'TITLE',
    rarity: 'MYTHIC',
    source: 'gacha',
    isStoreAvailable: false,
    isGachaAvailable: true,
    priceNotes: null,
    originTag: 'Gacha Jackpot • 1% Rate',
    visualConfig: { color: '#fb7185', bgColor: 'rgba(244, 63, 94, 0.22)' }
  },

  // ================= RANKED & MASTERY TITLES/FRAMES (non-store, non-gacha) =================
  {
    code: 'mastery_title_global_maestro',
    name: 'Global Chart Maestro',
    description: 'Terbuka dengan mencapai Mastery Gold/Maestro di kategori Global Trends.',
    type: 'TITLE',
    rarity: 'EPIC',
    source: 'mastery',
    isStoreAvailable: false,
    isGachaAvailable: false,
    priceNotes: null,
    originTag: 'Category Mastery',
    visualConfig: { color: '#38bdf8', bgColor: 'rgba(56, 189, 248, 0.16)' }
  },
  {
    code: 'mastery_title_indo_maestro',
    name: 'Indo Pop Maestro',
    description: 'Terbuka dengan mencapai Mastery Gold/Maestro di kategori Indonesia Trends.',
    type: 'TITLE',
    rarity: 'EPIC',
    source: 'mastery',
    isStoreAvailable: false,
    isGachaAvailable: false,
    priceNotes: null,
    originTag: 'Category Mastery',
    visualConfig: { color: '#fb7185', bgColor: 'rgba(244, 63, 94, 0.16)' }
  },
  {
    code: 'mastery_title_90s_archivist',
    name: '90s Archivist',
    description: 'Terbuka dengan mencapai Mastery Gold/Maestro di kategori Nostalgia < 2000.',
    type: 'TITLE',
    rarity: 'EPIC',
    source: 'mastery',
    isStoreAvailable: false,
    isGachaAvailable: false,
    priceNotes: null,
    originTag: 'Category Mastery',
    visualConfig: { color: '#fbbf24', bgColor: 'rgba(251, 191, 36, 0.16)' }
  },
  {
    code: 'mastery_title_artist_specialist',
    name: 'Artist Specialist',
    description: 'Terbuka dengan mencapai Mastery Gold/Maestro di Artist Mode.',
    type: 'TITLE',
    rarity: 'EPIC',
    source: 'mastery',
    isStoreAvailable: false,
    isGachaAvailable: false,
    priceNotes: null,
    originTag: 'Category Mastery',
    visualConfig: { color: '#c084fc', bgColor: 'rgba(192, 132, 252, 0.16)' }
  },
  {
    code: 'ranked_frame_s1_diamond',
    name: 'Season 1 Diamond Crest',
    description: 'Bingkai penghargaan eksklusif Season 1 Tier Diamond+.',
    type: 'FRAME',
    rarity: 'LEGENDARY',
    source: 'ranked',
    isStoreAvailable: false,
    isGachaAvailable: false,
    priceNotes: null,
    originTag: 'Season 1 Ranked Reward',
    visualConfig: { ringStyle: 'prism', primaryColor: '#38bdf8', secondaryColor: '#6366f1', motif: 'crown', animation: 'shimmer' }
  },
  {
    code: 'ranked_frame_s1_maestro',
    name: 'Season 1 Maestro Laurel',
    description: 'Bingkai Mythic khusus Top 10 Global Season 1.',
    type: 'FRAME',
    rarity: 'MYTHIC',
    source: 'ranked',
    isStoreAvailable: false,
    isGachaAvailable: false,
    priceNotes: null,
    originTag: 'Season 1 Top 10 Maestro',
    visualConfig: { ringStyle: 'crown', primaryColor: '#facc15', secondaryColor: '#f43f5e', motif: 'crown', animation: 'spin' }
  }
];

class CosmeticService {
  constructor() {
    this.scarcityCache = { expiresAt: 0, totalPlayers: 1, countsByItemId: new Map() };
  }

  async seedDefaultCatalog() {
    const retiredCodes = ['store_title_crate_digger', 'store_title_beat_seeker', 'store_title_night_dj'];
    await CosmeticItem.update(
      { isStoreAvailable: false, isGachaAvailable: false, isActive: false },
      { where: { code: { [Op.in]: retiredCodes } } }
    );

    for (const def of DEFAULT_CATALOG) {
      const existing = await CosmeticItem.findOne({ where: { code: def.code } });
      if (!existing) {
        await CosmeticItem.create(def);
      } else {
        await existing.update({
          name: def.name,
          description: def.description,
          type: def.type,
          rarity: def.rarity,
          source: def.source,
          isStoreAvailable: def.isStoreAvailable,
          isGachaAvailable: def.isGachaAvailable,
          priceNotes: def.priceNotes,
          originTag: def.originTag,
          visualConfig: def.visualConfig,
          isActive: true
        });
      }
    }

    // Ensure non-Legendary/Mythic items (including weekly login items) never animate
    const nonAnimatedItems = await CosmeticItem.findAll({
      where: {
        rarity: { [Op.in]: ['COMMON', 'RARE', 'EPIC'] },
        type: { [Op.in]: ['FRAME', 'VINYL'] }
      }
    });
    for (const item of nonAnimatedItems) {
      const cfg = item.visualConfig || {};
      const nextCfg = { ...cfg };
      let dirty = false;
      if (nextCfg.animation && nextCfg.animation !== 'none') {
        nextCfg.animation = 'none';
        dirty = true;
      }
      if (item.type === 'FRAME' && ['COMMON', 'RARE'].includes(item.rarity) && nextCfg.motif && nextCfg.motif !== 'none') {
        nextCfg.motif = 'none';
        dirty = true;
      }
      if (dirty) {
        await item.update({ visualConfig: nextCfg });
      }
    }
  }

  invalidateScarcityCache() {
    this.scarcityCache.expiresAt = 0;
  }

  async _getScarcitySnapshot() {
    const now = Date.now();
    if (now < this.scarcityCache.expiresAt) {
      return this.scarcityCache;
    }

    const [totalPlayersRaw, countsRows] = await Promise.all([
      User.count({ where: { isOfficial: false } }),
      UserItem.findAll({
        attributes: ['itemId', [fn('COUNT', col('user_id')), 'ownerCount']],
        group: ['item_id'],
        raw: true
      })
    ]);

    const totalPlayers = Math.max(1, totalPlayersRaw || 1);
    const countsByItemId = new Map();
    for (const row of countsRows) {
      countsByItemId.set(row.itemId, Number(row.ownerCount || 0));
    }

    this.scarcityCache = {
      expiresAt: now + 60 * 1000,
      totalPlayers,
      countsByItemId
    };
    return this.scarcityCache;
  }

  async attachScarcityStats(items = []) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const snap = await this._getScarcitySnapshot();
    return items.map(item => {
      const plain = item?.toJSON ? item.toJSON() : { ...item };
      const ownerCount = snap.countsByItemId.get(plain.id) || 0;
      const pctRaw = (ownerCount / snap.totalPlayers) * 100;
      const ownershipPercent = ownerCount === 0 ? 0 : Number(Math.max(0.1, pctRaw).toFixed(1));
      const scarcityLabel = ownerCount === 0
        ? 'Belum dimiliki siapapun'
        : `Dimiliki ${ownershipPercent}% pemain (${ownerCount} pemilik)`;
      return {
        ...plain,
        ownerCount,
        totalPlayers: snap.totalPlayers,
        ownershipPercent,
        scarcityLabel
      };
    });
  }

  async getStoreCatalog(userId = null) {
    // STRICT ISOLATION: only items where source = 'store' AND isStoreAvailable = true
    const items = await CosmeticItem.findAll({
      where: {
        source: 'store',
        isStoreAvailable: true,
        isActive: true
      },
      order: [['type', 'ASC'], ['priceNotes', 'ASC'], ['name', 'ASC']]
    });

    const enriched = await this.attachScarcityStats(items);
    let ownedSet = new Set();
    if (userId) {
      const owned = await UserItem.findAll({ where: { userId }, attributes: ['itemId'], raw: true });
      ownedSet = new Set(owned.map(o => o.itemId));
    }

    return enriched.map(item => ({
      ...item,
      owned: ownedSet.has(item.id)
    }));
  }

  async getUserInventory(userId) {
    const [rows, user] = await Promise.all([
      UserItem.findAll({
        where: { userId },
        include: [{ model: CosmeticItem, as: 'item' }],
        order: [['acquiredAt', 'DESC']]
      }),
      User.findByPk(userId, {
        attributes: ['id', 'equippedFrameId', 'equippedVinylId', 'equippedTitleId']
      })
    ]);

    const items = rows.map(r => r.item).filter(Boolean);
    const withScarcity = await this.attachScarcityStats(items);
    const scarcityMap = new Map(withScarcity.map(i => [i.id, i]));

    return rows
      .filter(r => r.item)
      .map(r => {
        const enriched = scarcityMap.get(r.itemId) || (r.item.toJSON ? r.item.toJSON() : r.item);
        const isEquipped = Boolean(
          user && (
            (enriched.type === 'FRAME' && user.equippedFrameId === enriched.id) ||
            (enriched.type === 'VINYL' && user.equippedVinylId === enriched.id) ||
            (enriched.type === 'TITLE' && user.equippedTitleId === enriched.id)
          )
        );
        return {
          ...enriched,
          acquiredVia: r.acquiredVia,
          acquiredAt: r.acquiredAt,
          isEquipped
        };
      });
  }

  async equipItem(userId, itemId) {
    const owned = await UserItem.findOne({
      where: { userId, itemId },
      include: [{ model: CosmeticItem, as: 'item' }]
    });
    if (!owned || !owned.item) {
      throw new Error('Kamu belum memiliki item ini.');
    }

    const fieldMap = {
      FRAME: 'equippedFrameId',
      VINYL: 'equippedVinylId',
      TITLE: 'equippedTitleId'
    };
    const field = fieldMap[owned.item.type];
    if (!field) throw new Error('Tipe item tidak valid.');

    await User.update({ [field]: owned.item.id }, { where: { id: userId } });
    return owned.item;
  }

  async unequipSlot(userId, type) {
    const fieldMap = {
      FRAME: 'equippedFrameId',
      VINYL: 'equippedVinylId',
      TITLE: 'equippedTitleId'
    };
    const field = fieldMap[String(type || '').toUpperCase()];
    if (!field) throw new Error('Slot kosmetik tidak valid.');
    await User.update({ [field]: null }, { where: { id: userId } });
    return true;
  }

  async grantItemToUser(userId, itemId, acquiredVia = 'reward', transaction = null) {
    const existing = await UserItem.findOne({
      where: { userId, itemId },
      transaction
    });
    if (existing) {
      return { granted: false, duplicate: true, record: existing };
    }
    const record = await UserItem.create({
      userId,
      itemId,
      acquiredVia,
      acquiredAt: new Date()
    }, { transaction });
    this.invalidateScarcityCache();
    return { granted: true, duplicate: false, record };
  }

  async grantItemByCode(userId, code, acquiredVia = 'reward') {
    const item = await CosmeticItem.findOne({ where: { code } });
    if (!item) return null;
    const res = await this.grantItemToUser(userId, item.id, acquiredVia);
    return { ...res, item };
  }

  /**
   * Batch hydrates equippedFrame, equippedVinyl, equippedTitle on user-like objects.
   */
  async hydrateUsersCosmetics(records = []) {
    if (!Array.isArray(records) || records.length === 0) return records;

    const userIds = new Set();
    const itemIds = new Set();

    for (const r of records) {
      const uid = r.userId || r.id;
      if (uid) userIds.add(uid);
      if (r.equippedFrameId) itemIds.add(r.equippedFrameId);
      if (r.equippedVinylId) itemIds.add(r.equippedVinylId);
      if (r.equippedTitleId) itemIds.add(r.equippedTitleId);
    }

    const users = userIds.size > 0
      ? await User.findAll({
          where: { id: { [Op.in]: [...userIds] } },
          attributes: ['id', 'level', 'xp', 'notesBalance', 'gachaTickets', 'streakFreezes', 'equippedFrameId', 'equippedVinylId', 'equippedTitleId']
        })
      : [];

    const userMap = new Map(users.map(u => [u.id, u]));
    for (const u of users) {
      if (u.equippedFrameId) itemIds.add(u.equippedFrameId);
      if (u.equippedVinylId) itemIds.add(u.equippedVinylId);
      if (u.equippedTitleId) itemIds.add(u.equippedTitleId);
    }

    const items = itemIds.size > 0
      ? await CosmeticItem.findAll({ where: { id: { [Op.in]: [...itemIds] } } })
      : [];
    const enrichedItems = await this.attachScarcityStats(items);
    const itemMap = new Map(enrichedItems.map(i => [i.id, i]));

    return records.map(r => {
      const plain = r?.toJSON ? r.toJSON() : { ...r };
      const uid = plain.userId || plain.id;
      const u = userMap.get(uid);
      const frameId = plain.equippedFrameId ?? u?.equippedFrameId ?? null;
      const vinylId = plain.equippedVinylId ?? u?.equippedVinylId ?? null;
      const titleId = plain.equippedTitleId ?? u?.equippedTitleId ?? null;

      return {
        ...plain,
        level: plain.level ?? u?.level ?? 1,
        equippedFrameId: frameId,
        equippedVinylId: vinylId,
        equippedTitleId: titleId,
        equippedFrame: frameId ? (itemMap.get(frameId) || null) : null,
        equippedVinyl: vinylId ? (itemMap.get(vinylId) || null) : null,
        equippedTitle: titleId ? (itemMap.get(titleId) || null) : null
      };
    });
  }
}

export const cosmeticService = new CosmeticService();
export default cosmeticService;
