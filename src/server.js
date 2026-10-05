const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');

const { registerChatHandlers } = require('./handlers/chatHandler');
const { registerPlaygroundHandlers } = require('./handlers/playgroundHandler');

const PORT = Number(process.env.PORT) || 4000;

// Tworzymy instancję aplikacji Express
const app = express();
app.use(express.json());

// Serwowanie plików statycznych front-endu (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Tworzymy serwer HTTP, który będzie współdzielony przez Express oraz Socket.io
const httpServer = http.createServer(app);

// Inicjalizujemy instancję Socket.io na serwerze HTTP
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Umożliwia łączenie z dowolnego pochodzenia (np. z konsoli lub innego portu)
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Globalny stan użytkowników i pokoi w pamięci serwera
// Map: socket.id -> { username, room }
const activeUsers = new Map();

// ==============================================================================
// 1. Socket.io Middleware — wykonuje się przed nawiązaniem połączenia
// ==============================================================================
// Bardzo przydatne do weryfikacji tokenów JWT, sesji, ciasteczek lub logowania.
io.use((socket, next) => {
  const clientAuth = socket.handshake.auth;
  const clientQuery = socket.handshake.query;
  const ip = socket.handshake.address;

  console.log(`[Middleware] Nowa próba połączenia od IP=${ip}, transport=${socket.conn.transport.name}`);

  // Możemy dołączyć własne dane do obiektu socket
  socket.data = {
    connectedAt: new Date().toISOString(),
    clientVersion: clientAuth?.version || clientQuery?.version || 'web-client',
  };

  next(); // zezwól na połączenie (lub next(new Error('unauthorized')) aby odrzucić)
});

// ==============================================================================
// 2. Główny punkt wejścia zdarzeń Socket.io
// ==============================================================================
io.on('connection', (socket) => {
  console.log(`[Socket.io] Klient połączony: ID=${socket.id} (transport: ${socket.conn.transport.name})`);

  // Emisja informacji powitalnej wyłącznie do nowego klienta
  socket.emit('server:welcome', {
    socketId: socket.id,
    serverTime: new Date().toISOString(),
    transport: socket.conn.transport.name,
    totalClients: io.engine.clientsCount,
    message: 'Połączono z serwerem Socket.io (Lekcja 92/93 Node.js)',
  });

  // Rozgłoszenie aktualnej liczby użytkowników do WSZYSTKICH
  io.emit('server:stats', {
    totalClients: io.engine.clientsCount,
    roomsCount: io.sockets.adapter.rooms.size,
  });

  // Podpięcie modułowych handlerów logiki
  registerChatHandlers(io, socket, activeUsers);
  registerPlaygroundHandlers(io, socket, activeUsers);

  // Monitorowanie upgrade'u protokołu (np. z HTTP Long-Polling do WebSockets)
  socket.conn.on('upgrade', (transport) => {
    console.log(`[Transport] Socket ${socket.id} zaktualizował protokół do: ${transport.name}`);
    socket.emit('server:transport_upgrade', { transport: transport.name });
  });

  // Obsługa rozłączenia
  socket.on('disconnect', (reason) => {
    console.log(`[Socket.io] Klient rozłączony: ID=${socket.id} (powód: ${reason})`);
    io.emit('server:stats', {
      totalClients: io.engine.clientsCount,
      roomsCount: io.sockets.adapter.rooms.size,
    });
  });
});

// ==============================================================================
// 3. REST API — Integracja tradycyjnego HTTP z emisją Socket.io
// ==============================================================================

// Endpoint zwracający stan serwera i listę aktywnych połączeń
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    uptimeSeconds: Math.floor(process.uptime()),
    clientsCount: io.engine.clientsCount,
    users: Array.from(activeUsers.values()),
    timestamp: new Date().toISOString(),
  });
});

// Demonstracja wysyłania powiadomienia w czasie rzeczywistym z poziomu endpointu REST
// Przykład zastosowania: zewnętrzny webhook informuje serwer o zmianie statusu
app.post('/api/broadcast', (req, res) => {
  const { title = 'Alert Systemowy', message = 'Komunikat z endpointu REST Express' } = req.body;

  // Wysyłamy zdarzenie do wszystkich podłączonych socketów!
  io.emit('system:alert', {
    title,
    message,
    source: 'REST API POST /api/broadcast',
    time: new Date().toLocaleTimeString('pl-PL'),
  });

  res.json({ success: true, deliveredToClients: io.engine.clientsCount });
});

// 404 dla nieznanych tras HTTP
app.use((req, res) => {
  res.status(404).json({ error: 'Nie znaleziono żądanego zasobu' });
});

// Uruchomienie serwera
httpServer.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Serwer Socket.io działa pod adresem: http://localhost:${PORT}`);
  console.log(`💬 Interfejs przeglądarkowy:          http://localhost:${PORT}`);
  console.log(`📊 Endpoint statusu REST:              http://localhost:${PORT}/api/status`);
  console.log(`======================================================\n`);
});
