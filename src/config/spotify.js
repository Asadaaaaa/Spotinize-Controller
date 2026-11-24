import dotenv from 'dotenv';
dotenv.config();

export const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'https://spotinize.hopto.org/auth/callback',
  scopes: [
    'user-read-private',
    'playlist-read-private',
    'playlist-read-public',
    'user-read-recently-played',
    'user-read-currently-playing',
    'user-follow-read',
    'user-top-read',
    'user-library-read'
  ].join(' ')
};

export default spotifyConfig;
