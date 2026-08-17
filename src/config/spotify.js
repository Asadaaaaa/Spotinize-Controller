import dotenv from 'dotenv';
dotenv.config();

export const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'https://spotinize.sytes.net/auth/callback',
  scopes: [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'user-read-recently-played',
    'user-top-read',
    'user-read-playback-state',
    'user-read-currently-playing'
  ].join(' ')
};

export default spotifyConfig;
