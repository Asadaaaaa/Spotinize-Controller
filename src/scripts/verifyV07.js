import assert from 'assert';
import crypto from 'crypto';
import { database } from '../config/database.js';
import {
  User,
  CosmeticItem,
  UserItem,
  WeeklyLoginSchedule,
  DailyLoginClaim,
  GachaLog,
  NotesTransaction,
  DailyChallenge,
  DailyAttempt,
  UserRankedProfile,
  UserCategoryMastery,
  UserQuest,
  Game,
  GameHistory,
  Track
} from '../models/index.js';
import { scoringService } from '../services/ScoringService.js';
import { cosmeticService } from '../services/CosmeticService.js';
import { gachaService } from '../services/GachaService.js';
import { dailyLoginService } from '../services/DailyLoginService.js';
import { dailyChallengeService } from '../services/DailyChallengeService.js';
import { rankedService } from '../services/RankedService.js';
import { leaderboardService } from '../services/LeaderboardService.js';
import { progressionService } from '../services/ProgressionService.js';
import { questService } from '../services/QuestService.js';
import { streakService } from '../services/StreakService.js';
import { rivalryService } from '../services/RivalryService.js';
import { gameService } from '../services/GameService.js';
import { getWibDateString, getWibDaysAgoString } from '../utils/WibDate.js';

async function run() {
  await database.connect();
  await cosmeticService.seedDefaultCatalog();
  await rankedService.ensureActiveSeason();

  const tag = crypto.randomBytes(4).toString('hex');
  const testUser1 = await User.create({
    username: `verify_v07_a_${tag}`,
    password: 'hashed_dummy_password',
    displayName: 'Verify Player A',
    notesBalance: 10000,
    gachaTickets: 2,
    streakFreezes: 1,
    currentStreak: 5,
    longestStreak: 5,
    lastPlayedDate: getWibDaysAgoString(2) // Missed yesterday -> should trigger Streak Freeze!
  });

  const testUser2 = await User.create({
    username: `verify_v07_b_${tag}`,
    password: 'hashed_dummy_password',
    displayName: 'Verify Player B',
    notesBalance: 500
  });

  // Ensure at least 5 tracks exist in DB for fallback/Daily tests
  const existingTracksCount = await Track.count();
  if (existingTracksCount < 5) {
    for (let i = 1; i <= 5; i++) {
      await Track.create({
        spotifyId: `verify_track_${tag}_${i}`,
        title: `Verify Song ${i}`,
        artist: `Verify Artist ${i}`,
        category: 'Global Trends',
        previewUrl: `https://example.com/preview_${i}.mp3`
      });
    }
  }

  try {
    console.log('1. Verifying Strict ScoringService...');
    assert.strictEqual(scoringService.calculateFinalScore(0.1, 1.0, 1), 120, '0.1s attempt 1 should be 120');
    assert.strictEqual(scoringService.calculateFinalScore(0.1, 1.0, 2), 96, '0.1s attempt 2 should have 0.8x penalty (96)');
    assert.strictEqual(scoringService.calculateFinalScore(0.1, 1.0, 3), 72, '0.1s attempt 3 should have 0.6x penalty (72)');
    assert.ok(scoringService.calculateThinkingModifier(10) < 0.7, '10s thinking time should decay faster');
    assert.strictEqual(scoringService.calculatePerfectRunBonus(5, 0, 5), 50, '5/5 no errors -> +50 Perfect Run');
    assert.strictEqual(scoringService.calculatePerfectRunBonus(5, 1, 5), 0, 'With 1 wrong guess -> no Perfect Run bonus');
    console.log('   ✓ Strict ScoringService passed');

    console.log('2. Verifying Weekly AI Daily Login & Anti-Store Isolation...');
    const dlStatus = await dailyLoginService.getStatus(testUser1.id);
    assert.strictEqual(dlStatus.days.length, 7, 'Weekly schedule must have 7 days');
    const claimRes = await dailyLoginService.claimToday(testUser1.id);
    assert.strictEqual(claimRes.claimed.dayNumber, 1, 'First claim should be Day 1');

    const aiItems = await CosmeticItem.findAll({ where: { source: 'daily_login_ai' } });
    assert.ok(aiItems.length > 0, 'Should have at least 1 AI Daily Login item');
    for (const aiItem of aiItems) {
      assert.strictEqual(aiItem.isStoreAvailable, false, 'AI item must NEVER be store-available');
      assert.strictEqual(aiItem.isGachaAvailable, false, 'AI item must NEVER be gacha-available');
    }
    const storeCatalog = await cosmeticService.getStoreCatalog(testUser1.id);
    const gachaInfo = await gachaService.getGachaInfo(testUser1.id);
    const storeCodes = new Set(storeCatalog.map(i => i.code));
    const gachaCodes = new Set(gachaInfo.pool.map(i => i.code));
    for (const aiItem of aiItems) {
      assert.ok(!storeCodes.has(aiItem.code), `AI item ${aiItem.code} leaked to Store!`);
      assert.ok(!gachaCodes.has(aiItem.code), `AI item ${aiItem.code} leaked to Gacha!`);
    }
    console.log('   ✓ AI Daily Login & Anti-Store/Anti-Gacha Isolation passed');

    console.log('3. Verifying Gacha (50 pulls, Pity 10 & 50, Duplicate Recycle & Live Scarcity)...');
    const batch10 = await gachaService.pull(testUser1.id, { count: 10, useTicket: false });
    assert.strictEqual(batch10.results.length, 10, '10x pull must return 10 results');
    const hasEpicOrBetter = batch10.results.some(r => ['EPIC', 'LEGENDARY', 'MYTHIC'].includes(r.rarity));
    assert.ok(hasEpicOrBetter, '10x pull must guarantee at least 1 EPIC+ item via Pity 10');

    // Run 4 more 10x pulls to hit Pity 50 and verify duplicate refunds
    let sawDuplicateRefund = batch10.totalRefundNotes > 0;
    let sawHighTier = batch10.results.some(r => ['LEGENDARY', 'MYTHIC'].includes(r.rarity));
    for (let i = 0; i < 4; i++) {
      const b = await gachaService.pull(testUser1.id, { count: 10, useTicket: false });
      if (b.totalRefundNotes > 0) sawDuplicateRefund = true;
      if (b.results.some(r => ['LEGENDARY', 'MYTHIC'].includes(r.rarity))) sawHighTier = true;
    }
    assert.ok(sawDuplicateRefund, 'Duplicate pulls must auto-recycle into Notes');
    assert.ok(sawHighTier, '50 pulls must trigger Legendary/Mythic Pity');

    const inventory = await cosmeticService.getUserInventory(testUser1.id);
    assert.ok(inventory.length > 0 && inventory[0].scarcityLabel, 'Inventory items must include Live Scarcity stats');
    console.log('   ✓ Gacha Pity, Duplicate Auto-Recycle & Live Scarcity passed');

    console.log('4. Verifying Streak Freeze Auto-Save...');
    const streakRes = await streakService.recordActivity(testUser1.id);
    assert.strictEqual(streakRes.freezeUsed, true, 'Missing 1 day with Streak Freeze must consume 1 freeze');
    assert.strictEqual(streakRes.currentStreak, 6, 'Streak should advance from 5 to 6');
    assert.strictEqual(streakRes.streakFreezes, 0, 'Streak freeze count should decrement to 0');
    console.log('   ✓ Streak Freeze Auto-Save passed');

    console.log('5. Verifying Spotinize Daily (5 full-random identical tracks, resume-on-refresh)...');
    const d1 = await dailyChallengeService.startOrResumeDaily(testUser1.id, gameService);
    const d2 = await dailyChallengeService.startOrResumeDaily(testUser2.id, gameService);
    assert.deepStrictEqual(d1.gameState.gameTrackIds, d2.gameState.gameTrackIds, 'Spotinize Daily tracks must be identical for all players');
    assert.strictEqual(d1.gameState.gameTrackIds.length, 5, 'Spotinize Daily must have 5 tracks');
    const resumed = await dailyChallengeService.startOrResumeDaily(testUser1.id, gameService);
    assert.strictEqual(resumed.resumed, true, 'Re-opening unfinished Daily must resume existing game');
    assert.strictEqual(resumed.gameState.id, d1.gameState.id, 'Resumed gameId must match');
    console.log('   ✓ Spotinize Daily identity & resume-on-refresh passed');

    console.log('6. Verifying Solo Ranked Placements, Demotion Shield & All-Time Power Score Exclusion...');
    assert.strictEqual(leaderboardService.isOfficialEligible({ mode: 'SOLO', gameSubtype: 'CLASSIC', category: 'Artist', numberOfSongs: 5 }), false, 'Artist mode must be excluded from official All-Time Power Score');
    assert.strictEqual(leaderboardService.isOfficialEligible({ mode: 'SOLO', gameSubtype: 'CLASSIC', category: 'Global Trends', numberOfSongs: 10 }), false, 'Custom 10-song Solo must be excluded from official All-Time Power Score');
    assert.strictEqual(leaderboardService.isOfficialEligible({ mode: 'SOLO', gameSubtype: 'DAILY', category: 'Spotinize Daily', numberOfSongs: 5 }), true, 'Daily must be official eligible');

    for (let i = 0; i < 5; i++) {
      await rankedService.processRankedResult(testUser1.id, { score: 420, correctCount: 5, totalRounds: 5, perfectRun: true });
    }
    const rankedSummary = await rankedService.getUserRankedSummary(testUser1.id);
    assert.strictEqual(rankedSummary.isInPlacement, false, '5 games must complete placement');
    assert.notStrictEqual(rankedSummary.tier, 'UNRANKED', 'Tier must be assigned after placement');
    assert.strictEqual(rankedSummary.demotionShieldGames, 2, 'Demotion shield should be 2 after placement');
    console.log('   ✓ Solo Ranked & Official Eligibility passed');

    console.log('7. Verifying Progression (anti-skip XP, Mastery, Quests & H2H)...');
    const zeroSkip = await progressionService.awardGameProgression(testUser1.id, { category: 'Global Trends', correctCount: 0 });
    assert.strictEqual(zeroSkip.xpEarned, 0, '0 correct answers must award 0 XP');
    const validProg = await progressionService.awardGameProgression(testUser1.id, { category: 'Indonesia Trends', correctCount: 5, sniper01Count: 2, perfectRun: true });
    assert.ok(validProg.xpEarned > 0 && validProg.notesEarned > 0, 'Valid game must award XP and Notes');

    await questService.recordProgress(testUser1.id, 'DAILY_FINISH_GAME', 1);
    const quests = await questService.ensureUserQuests(testUser1.id);
    const completedDaily = quests.daily.find(q => q.questCode === 'DAILY_FINISH_GAME');
    assert.strictEqual(completedDaily.status, 'COMPLETED', 'DAILY_FINISH_GAME should be COMPLETED');
    await questService.claimQuest(testUser1.id, completedDaily.id);

    const h2h = await rivalryService.getHeadToHead(testUser1.id, testUser2.id);
    assert.strictEqual(typeof h2h.totalMeetings, 'number', 'H2H must return valid summary object');
    console.log('   ✓ Progression, Quests & H2H passed');

    console.log('\n✅ ALL V0.7 VERIFICATION ASSERTIONS PASSED!');
  } finally {
    // Cleanup synthetic test records
    const testIds = [testUser1.id, testUser2.id];
    await DailyAttempt.destroy({ where: { userId: testIds } });
    await DailyLoginClaim.destroy({ where: { userId: testIds } });
    await GachaLog.destroy({ where: { userId: testIds } });
    await NotesTransaction.destroy({ where: { userId: testIds } });
    await UserItem.destroy({ where: { userId: testIds } });
    await UserRankedProfile.destroy({ where: { userId: testIds } });
    await UserCategoryMastery.destroy({ where: { userId: testIds } });
    await UserQuest.destroy({ where: { userId: testIds } });
    await GameHistory.destroy({ where: { userId: testIds } });
    await Game.destroy({ where: { hostId: testIds } });
    await User.destroy({ where: { id: testIds } });
    await Track.destroy({ where: { spotifyId: { [ (await import('sequelize')).Op.like ]: `verify_track_${tag}%` } } }).catch(() => {});
  }

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
