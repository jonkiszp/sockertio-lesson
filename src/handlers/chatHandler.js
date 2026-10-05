// ==============================================================================
// Handler zdarzeń czatu i zarządzania pokojami (Rooms)
// ==============================================================================
// W Socket.io "Room" to kanał, do którego gniazdo (socket) może dołączyć za pomocą:
//    socket.join(roomName)
// a opuścić za pomocą:
//    socket.leave(roomName)
// ==============================================================================

/**
 * @param {import('socket.io').Server} io - Instancja serwera Socket.io
 * @param {import('socket.io').Socket} socket - Gniazdo połączonego klienta
 * @param {Map<string, { username: string, room: string }>} users - Globalny stan użytkowników
 */
function registerChatHandlers(io, socket, users) {
  // 1. Dołączenie użytkownika do czatu i pokoju
  socket.on('chat:join', ({ username, room }, callback) => {
    const cleanNick = (username || `Gość_${socket.id.slice(0, 4)}`).trim().slice(0, 20);
    const cleanRoom = (room || 'ogolny').trim().toLowerCase();

    // Jeśli użytkownik był wcześniej w innym pokoju, opuszczamy go
    const currentUser = users.get(socket.id);
    if (currentUser && currentUser.room) {
      socket.leave(currentUser.room);
      // Powiadom stary pokój o opuszczeniu
      socket.to(currentUser.room).emit('chat:system', {
        type: 'leave',
        user: currentUser.username,
        room: currentUser.room,
        text: `Użytkownik ${currentUser.username} opuścił pokój #${currentUser.room}.`,
        time: new Date().toLocaleTimeString('pl-PL'),
      });
    }

    // Dołączamy socket do nowego pokoju w Socket.io
    socket.join(cleanRoom);
    users.set(socket.id, { username: cleanNick, room: cleanRoom });

    // Informujemy WSZYSTKICH w tym pokoju (oprócz dołączającego)
    // socket.to(room).emit(...)
    socket.to(cleanRoom).emit('chat:system', {
      type: 'join',
      user: cleanNick,
      room: cleanRoom,
      text: `Użytkownik ${cleanNick} dołączył do pokoju #${cleanRoom}.`,
      time: new Date().toLocaleTimeString('pl-PL'),
    });

    // Zwracamy potwierdzenie (acknowledgement) do samego klienta
    if (typeof callback === 'function') {
      callback({
        success: true,
        user: cleanNick,
        room: cleanRoom,
        activeUsersInRoom: getUsersInRoom(io, users, cleanRoom),
      });
    }

    // Rozgłaszamy aktualną listę aktywnych użytkowników
    broadcastRoomUsers(io, users, cleanRoom);
  });

  // 2. Wysłanie wiadomości tekstowej do pokoju
  socket.on('chat:message', (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      if (typeof callback === 'function') {
        callback({ error: 'Nie jesteś zarejestrowany na czacie. Dołącz najpierw.' });
      }
      return;
    }

    const text = String(data?.text || '').trim();
    if (!text) return;

    const messagePayload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: socket.id,
      username: user.username,
      room: user.room,
      text: text.slice(0, 500),
      time: new Date().toLocaleTimeString('pl-PL'),
    };

    // io.to(room).emit(...) wysyła wiadomość do WSZYSTKICH w pokoju, w tym do nadawcy!
    io.to(user.room).emit('chat:message', messagePayload);

    // Opcjonalne wywołanie potwierdzenia odbioru
    if (typeof callback === 'function') {
      callback({ success: true, messageId: messagePayload.id });
    }
  });

  // 3. Wskaźnik "Użytkownik pisze..." (Typing indicator)
  socket.on('chat:typing', ({ isTyping }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // socket.to(room).emit(...) - wysyłamy TYLKO do innych osób w pokoju, nie do samego siebie!
    socket.to(user.room).emit('chat:user_typing', {
      username: user.username,
      isTyping: Boolean(isTyping),
    });
  });

  // 4. Opuszczenie pokoju lub rozłączenie
  socket.on('disconnect', (reason) => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);

      // Powiadamiamy pozostałych użytkowników w danym pokoju
      socket.to(user.room).emit('chat:system', {
        type: 'disconnect',
        user: user.username,
        room: user.room,
        text: `Użytkownik ${user.username} rozłączył się (${reason}).`,
        time: new Date().toLocaleTimeString('pl-PL'),
      });

      broadcastRoomUsers(io, users, user.room);
    }
  });
}

function getUsersInRoom(io, users, room) {
  const result = [];
  const roomSockets = io.sockets.adapter.rooms.get(room);
  if (roomSockets) {
    for (const socketId of roomSockets) {
      const u = users.get(socketId);
      if (u) result.push({ id: socketId, username: u.username });
    }
  }
  return result;
}

function broadcastRoomUsers(io, users, room) {
  const list = getUsersInRoom(io, users, room);
  io.to(room).emit('chat:room_users', { room, users: list });
}

module.exports = { registerChatHandlers };
