import { Server } from 'socket.io';
import { GameSocket } from '../sockets/GameSocket.js';
import { MultiplayerSocket } from '../sockets/MultiplayerSocket.js';
import { ConnectionSocket } from '../sockets/ConnectionSocket.js';

export class SocketServer {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.gameSocket = new GameSocket(this.io);
    this.multiplayerSocket = new MultiplayerSocket(this.io);
    this.connectionSocket = new ConnectionSocket(this.io);

    this.init();
  }

  init() {
    this.io.on('connection', (socket) => {
      console.log(`⚡ Socket client connected: ${socket.id}`);

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
