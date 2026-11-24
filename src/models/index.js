import { User } from './User.js';
import { Track } from './Track.js';
import { Game } from './Game.js';
import { GamePlayer } from './GamePlayer.js';
import { GameRound } from './GameRound.js';
import { Guess } from './Guess.js';
import { GameHistory } from './GameHistory.js';
import { RecentlyPlayed } from './RecentlyPlayed.js';
import { Friend } from './Friend.js';
import { Follow } from './Follow.js';
import { Post } from './Post.js';
import { PostReaction } from './PostReaction.js';
import { PostComment } from './PostComment.js';
import { BlindDropAttempt } from './BlindDropAttempt.js';
import { ChallengeEntry } from './ChallengeEntry.js';
import { SavedTrack } from './SavedTrack.js';
import { SearchCache } from './SearchCache.js';
import { Notification } from './Notification.js';
import { YearlyHit } from './YearlyHit.js';
import { AiContentLog } from './AiContentLog.js';
import { UserPinnedSong } from './UserPinnedSong.js';

// User & Game relations
User.hasMany(Game, { foreignKey: 'hostId', as: 'hostedGames' });
Game.belongsTo(User, { foreignKey: 'hostId', as: 'host' });

// Game & GamePlayer relations
Game.hasMany(GamePlayer, { foreignKey: 'gameId', as: 'players', onDelete: 'CASCADE' });
GamePlayer.belongsTo(Game, { foreignKey: 'gameId', as: 'game' });

User.hasMany(GamePlayer, { foreignKey: 'userId', as: 'participations' });
GamePlayer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Game & GameRound relations
Game.hasMany(GameRound, { foreignKey: 'gameId', as: 'rounds', onDelete: 'CASCADE' });
GameRound.belongsTo(Game, { foreignKey: 'gameId', as: 'game' });

Track.hasMany(GameRound, { foreignKey: 'trackId', as: 'rounds' });
GameRound.belongsTo(Track, { foreignKey: 'trackId', as: 'track' });

// Guesses
GameRound.hasMany(Guess, { foreignKey: 'roundId', as: 'guesses', onDelete: 'CASCADE' });
Guess.belongsTo(GameRound, { foreignKey: 'roundId', as: 'round' });

User.hasMany(Guess, { foreignKey: 'userId', as: 'guesses' });
Guess.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// History & Recently Played
User.hasMany(GameHistory, { foreignKey: 'userId', as: 'histories' });
GameHistory.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(RecentlyPlayed, { foreignKey: 'userId', as: 'recentlyPlayed' });
RecentlyPlayed.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Notifications
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'recipient' });
Notification.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });

// YearlyHit <-> Track (One-to-Many)
YearlyHit.hasMany(Track, { foreignKey: 'yearlyHitId', as: 'tracks', onDelete: 'SET NULL' });
Track.belongsTo(YearlyHit, { foreignKey: 'yearlyHitId', as: 'yearlyHit' });

// Follows
User.hasMany(Follow, { foreignKey: 'followerId', as: 'followingLinks', onDelete: 'CASCADE' });
User.hasMany(Follow, { foreignKey: 'followingId', as: 'followerLinks', onDelete: 'CASCADE' });
Follow.belongsTo(User, { foreignKey: 'followerId', as: 'follower' });
Follow.belongsTo(User, { foreignKey: 'followingId', as: 'following' });

// Posts, Reactions, Comments & SavedTracks
User.hasMany(Post, { foreignKey: 'userId', as: 'posts', onDelete: 'CASCADE' });
Post.belongsTo(User, { foreignKey: 'userId', as: 'author' });

Post.hasMany(PostReaction, { foreignKey: 'postId', as: 'reactions', onDelete: 'CASCADE' });
PostReaction.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
PostReaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Post.hasMany(PostComment, { foreignKey: 'postId', as: 'comments', onDelete: 'CASCADE' });
PostComment.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
PostComment.belongsTo(User, { foreignKey: 'userId', as: 'author' });

Post.hasMany(BlindDropAttempt, { foreignKey: 'postId', as: 'blindDropAttempts', onDelete: 'CASCADE' });
BlindDropAttempt.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
BlindDropAttempt.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Post.hasMany(ChallengeEntry, { foreignKey: 'postId', as: 'challengeEntries', onDelete: 'CASCADE' });
ChallengeEntry.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
ChallengeEntry.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(SavedTrack, { foreignKey: 'userId', as: 'savedTracks', onDelete: 'CASCADE' });
SavedTrack.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(UserPinnedSong, { foreignKey: 'userId', as: 'pinnedSongs', onDelete: 'CASCADE' });
UserPinnedSong.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export {
  User,
  Track,
  Game,
  GamePlayer,
  GameRound,
  Guess,
  GameHistory,
  RecentlyPlayed,
  Friend,
  Follow,
  Post,
  PostReaction,
  PostComment,
  BlindDropAttempt,
  ChallengeEntry,
  SavedTrack,
  SearchCache,
  Notification,
  YearlyHit,
  AiContentLog,
  UserPinnedSong
};

export default {
  User,
  Track,
  Game,
  GamePlayer,
  GameRound,
  Guess,
  GameHistory,
  RecentlyPlayed,
  Friend,
  Follow,
  Post,
  PostReaction,
  PostComment,
  BlindDropAttempt,
  ChallengeEntry,
  SavedTrack,
  SearchCache,
  Notification,
  YearlyHit,
  AiContentLog,
  UserPinnedSong
};
