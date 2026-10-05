// ==============================================================================
// Konsolowy klient Socket.io w Node.js (Lekcja 92/93)
// ==============================================================================
// Uruchomienie z terminala:
//    npm run client
// lub:
//    node examples/client-console.js [opcjonalny_nick] [opcjonalny_pokoj]
// ==============================================================================

const readline = require('node:readline');
const { io } = require('socket.io-client');

const PORT = Number(process.env.PORT) || 4000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

const username = process.argv[2] || `KonsolowyBot_${Math.floor(Math.random() * 900 + 100)}`;
let currentRoom = process.argv[3] || 'ogolny';

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '  Klient konsolowy Socket.io — Demonstracja Node.js    ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════');
console.log(`Łączenie z serwerem: \x1b[33m${SERVER_URL}\x1b[0m jako \x1b[32m${username}\x1b[0m...\n`);

const socket = io(SERVER_URL, {
  auth: {
    version: 'console-cli-1.0',
    username,
  },
  transports: ['websocket', 'polling'],
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `\x1b[35m[${username}#${currentRoom}] > \x1b[0m`,
});

// Zdarzenie 1: Pomyślne połączenie
socket.on('connect', () => {
  console.log(`\x1b[32m✔ Połączono!\x1b[0m Socket ID: \x1b[33m${socket.id}\x1b[0m (transport: ${socket.io.engine.transport.name})`);

  // Dołączamy do pokoju
  socket.emit('chat:join', { username, room: currentRoom }, (ack) => {
    console.log(`\x1b[32m✔ Dołączono do pokoju #${ack.room}.\x1b[0m Aktywni: ${ack.activeUsersInRoom.length}`);
    rl.prompt();
  });
});

// Zdarzenie 2: Komunikat powitalny z serwera
socket.on('server:welcome', (info) => {
  console.log(`\x1b[34mℹ Serwer:\x1b[0m ${info.message} | Klientów online: ${info.totalClients}`);
  rl.prompt();
});

// Zdarzenie 3: Nowa wiadomość na czacie
socket.on('chat:message', (msg) => {
  if (msg.senderId !== socket.id) {
    console.log(`\n\x1b[32m[${msg.time}] <${msg.username}>:\x1b[0m ${msg.text}`);
    rl.prompt();
  }
});

// Zdarzenie 4: Komunikat systemowy czatu (ktoś dołączył/wyszedł)
socket.on('chat:system', (sys) => {
  console.log(`\n\x1b[90m[SYSTEM ${sys.time}] ${sys.text}\x1b[0m`);
  rl.prompt();
});

// Zdarzenie 5: Ktoś pisze w pokoju
socket.on('chat:user_typing', ({ username: typingUser, isTyping }) => {
  if (isTyping) {
    process.stdout.write(`\r\x1b[33m✍ ${typingUser} pisze wiadomość...\x1b[0m\r`);
  }
});

// Zdarzenie 6: Wynik z poligonu emisji
socket.on('playground:result', (res) => {
  console.log(`\n\x1b[36m[EMISJA ${res.badge}] ${res.title}\x1b[0m:`, res.payload);
  rl.prompt();
});

// Zdarzenie 7: Alert systemowy z REST API
socket.on('system:alert', (alert) => {
  console.log(`\n\x1b[41m\x1b[37m ALERT SYSTEMOWY \x1b[0m \x1b[31m${alert.title}:\x1b[0m ${alert.message}`);
  rl.prompt();
});

// Zdarzenie 8: Błąd połączenia
socket.on('connect_error', (err) => {
  console.error(`\x1b[31m✖ Błąd połączenia:\x1b[0m ${err.message}`);
});

// Zdarzenie 9: Rozłączenie
socket.on('disconnect', (reason) => {
  console.log(`\n\x1b[31m✖ Rozłączono z serwerem:\x1b[0m ${reason}`);
  rl.close();
  process.exit(0);
});

// Obsługa wpisywania z klawiatury
rl.on('line', (line) => {
  const text = line.trim();

  if (!text) {
    rl.prompt();
    return;
  }

  if (text === '/quit' || text === '/exit') {
    socket.disconnect();
    process.exit(0);
  }

  if (text.startsWith('/join ')) {
    const newRoom = text.split(' ')[1];
    if (newRoom) {
      currentRoom = newRoom.toLowerCase();
      socket.emit('chat:join', { username, room: currentRoom }, (ack) => {
        console.log(`\x1b[32m✔ Zmieniono pokój na #${ack.room}\x1b[0m`);
        rl.setPrompt(`\x1b[35m[${username}#${currentRoom}] > \x1b[0m`);
        rl.prompt();
      });
      return;
    }
  }

  if (text === '/ack') {
    console.log('\x1b[33mWysyłanie demo:ack z callbackiem...\x1b[0m');
    const start = Date.now();
    socket.emit('demo:ack', { sentAt: start, msg: 'Wiadomość z konsoli' }, (response) => {
      const duration = Date.now() - start;
      console.log(`\x1b[32m✔ Odebrano potwierdzenie serwera (RTT: ${duration}ms):\x1b[0m`, response);
      rl.prompt();
    });
    return;
  }

  // Wysłanie zwykłej wiadomości
  socket.emit('chat:message', { text }, (ack) => {
    // Potwierdzenie wysłania
  });

  rl.prompt();
});
