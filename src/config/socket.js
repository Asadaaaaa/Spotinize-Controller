import { Server } from 'socket.io';
import { GameSocket } from '../sockets/GameSocket.js';
import { MultiplayerSocket } from '../sockets/MultiplayerSocket.js';
import { ConnectionSocket } from '../sockets/ConnectionSocket.js';
import { verifyJwtToken, extractBearerToken } from '../middleware/authMiddleware.js';

export class SocketServer {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        extractBearerToken(socket.handshake.headers?.authorization);

      if (!token) {
        socket.authenticated = false;
        return next();
      }

      try {
        const decoded = verifyJwtToken(token);
        socket.userId = decoded.id;
        socket.username = decoded.username;
        socket.authenticated = true;
        return next();
      } catch (err) {
        return next(new Error('Unauthorized: invalid token'));
      }
    });

    this.gameSocket = new GameSocket(this.io);
    this.multiplayerSocket = new MultiplayerSocket(this.io);
    this.connectionSocket = new ConnectionSocket(this.io);

    this.init();
  }

  init() {
    this.io.on('connection', (socket) => {
      console.log(`⚡ Socket client connected: ${socket.id} (auth=${!!socket.authenticated})`);

      if (socket.authenticated && socket.userId) {
        socket.join(`user:${socket.userId}`);
      }

      this.gameSocket.registerEvents(socket);
      this.multiplayerSocket.registerEvents(socket);
      this.connectionSocket.registerEvents(socket);
    });
  }

  getIO() {
    return this.io;
  }
}

export default SocketServer;
