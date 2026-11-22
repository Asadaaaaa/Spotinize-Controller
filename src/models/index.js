import { User } from './User.js';
import { Track } from './Track.js';
import { Game } from './Game.js';
import { GamePlayer } from './GamePlayer.js';
import { GameRound } from './GameRound.js';
import { Guess } from './Guess.js';
import { GameHistory } from './GameHistory.js';
import { RecentlyPlayed } from './RecentlyPlayed.js';
import { Friend } from './Friend.js';
import { SearchCache } from './SearchCache.js';
import { Notification } from './Notification.js';
import { YearlyHit } from './YearlyHit.js';

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
  SearchCache,
  Notification,
  YearlyHit
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
  SearchCache,
  Notification,
  YearlyHit
};
