// ==============================================================================
// Handler poligonu doświadczalnego (Playground) rodzajów emisji Socket.io
// ==============================================================================
// Prezentuje 5 fundamentalnych sposobów nadawania komunikatów w Socket.io:
// 1. socket.emit()          -> Tylko do nadawcy (unicast / echo)
// 2. socket.broadcast.emit() -> Do wszystkich OPRÓCZ nadawcy
// 3. io.emit()              -> Do WSZYSTKICH podłączonych klientów
// 4. io.to(pokój).emit()    -> Tylko do klientów w danym pokoju
// 5. Ack Callback           -> Wzorzec żądanie-odpowiedź (RPC / Acknowledgement)
// ==============================================================================

/**
 * @param {import('socket.io').Server} io - Instancja serwera Socket.io
 * @param {import('socket.io').Socket} socket - Gniazdo połączonego klienta
 * @param {Map<string, { username: string, room: string }>} users - Globalny stan użytkowników
 */
function registerPlaygroundHandlers(io, socket, users) {
  // 1. socket.emit() — Echo zwrotne wyłącznie do nadawcy
  socket.on('demo:self', (data) => {
    console.log(`[Playground] demo:self od socket=${socket.id}:`, data);
    socket.emit('playground:result', {
      type: 'self',
      badge: 'socket.emit()',
      title: 'Emisja zwrotna (Tylko do Ciebie)',
      description: 'Ten komunikat trafił wyłącznie do gniazda, które go wysłało.',
      senderId: socket.id,
      payload: data,
      time: new Date().toLocaleTimeString('pl-PL'),
    });
  });

  // 2. socket.broadcast.emit() — Do wszystkich innych, z wykluczeniem nadawcy
  socket.on('demo:broadcast', (data) => {
    console.log(`[Playground] demo:broadcast od socket=${socket.id}:`, data);

    // Wysyłamy do innych
    socket.broadcast.emit('playground:result', {
      type: 'broadcast',
      badge: 'socket.broadcast.emit()',
      title: 'Rozgłoszenie do pozostałych',
      description: `Wysłane przez klienta ${socket.id.slice(0, 6)} do wszystkich OPRÓCZ niego samego.`,
      senderId: socket.id,
      payload: data,
      time: new Date().toLocaleTimeString('pl-PL'),
    });

    // Aby nadawca widział potwierdzenie w swoim UI
    socket.emit('playground:receipt', {
      method: 'socket.broadcast.emit()',
      message: 'Wiadomość została rozesłana do wszystkich innych podłączonych klientów!',
      time: new Date().toLocaleTimeString('pl-PL'),
    });
  });

  // 3. io.emit() — Globalne rozgłoszenie do wszystkich podłączonych gniazd
  socket.on('demo:global', (data) => {
    console.log(`[Playground] demo:global od socket=${socket.id}:`, data);
    io.emit('playground:result', {
      type: 'global',
      badge: 'io.emit()',
      title: 'Globalne rozgłoszenie (Wszyscy)',
      description: 'Ten komunikat otrzymał KAŻDY połączony klient (w tym nadawca).',
      senderId: socket.id,
      payload: data,
      time: new Date().toLocaleTimeString('pl-PL'),
    });
  });

  // 4. io.to(room).emit() — Do określonego pokoju
  socket.on('demo:room', ({ room, text }) => {
    const targetRoom = (room || 'ogolny').toLowerCase();
    console.log(`[Playground] demo:room do #${targetRoom} od socket=${socket.id}`);

    io.to(targetRoom).emit('playground:result', {
      type: 'room',
      badge: `io.to('${targetRoom}').emit()`,
      title: `Wiadomość do pokoju #${targetRoom}`,
      description: `Tylko gniazda, które wykonały socket.join('${targetRoom}'), odebrały to zdarzenie.`,
      senderId: socket.id,
      payload: { room: targetRoom, text },
      time: new Date().toLocaleTimeString('pl-PL'),
    });
  });

  // 5. Potwierdzenie zwrotne z danymi (Acknowledgements / Callback)
  // Klient wysyła trzeci argument (funkcję), którą serwer wywołuje zwrotnie z danymi!
  socket.on('demo:ack', (data, callback) => {
    console.log(`[Playground] demo:ack otrzymane z danymi:`, data);
    const start = data?.sentAt || Date.now();
    const serverProcessingTime = Math.floor(Math.random() * 20) + 5; // symulacja 5-25ms

    setTimeout(() => {
      if (typeof callback === 'function') {
        callback({
          status: 'success',
          receivedData: data,
          serverTimestamp: Date.now(),
          serverProcessingDurationMs: serverProcessingTime,
          message: 'Potwierdzenie odebrania pakietu przez serwer Node.js (Ack Callback)!',
        });
      }
    }, serverProcessingTime);
  });

  // 6. Prosty ping/pong pomiaru opóźnienia sieciowego (latency)
  socket.on('ping:check', (timestamp, callback) => {
    if (typeof callback === 'function') {
      callback({
        clientTime: timestamp,
        serverTime: Date.now(),
      });
    }
  });
}

module.exports = { registerPlaygroundHandlers };
