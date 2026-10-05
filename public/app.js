// ==============================================================================
// Klient przeglądarkowy Socket.io — Logika aplikacji front-end
// ==============================================================================

(function () {
  'use strict';

  // ───────── Stan aplikacji ─────────
  const state = {
    username: localStorage.getItem('socketio_nick') || `Uczeń_${Math.floor(Math.random() * 89 + 10)}`,
    room: 'ogolny',
    packetCount: 0,
    typingTimeout: null,
    isTyping: false,
  };

  // ───────── Pobranie elementów DOM ─────────
  const dom = {
    // HUD
    dot: document.getElementById('hud-dot'),
    status: document.getElementById('hud-status'),
    socketId: document.getElementById('hud-socket-id'),
    transport: document.getElementById('hud-transport'),
    latency: document.getElementById('hud-latency'),
    clients: document.getElementById('hud-clients'),
    btnReconnect: document.getElementById('btn-reconnect'),

    // Flow
    flowSteps: {
      http: document.getElementById('flow-http'),
      polling: document.getElementById('flow-polling'),
      upgrade: document.getElementById('flow-upgrade'),
      ws: document.getElementById('flow-ws'),
    },

    // Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    packetCounter: document.getElementById('packet-counter'),

    // Czat
    inputNick: document.getElementById('input-nickname'),
    btnSaveNick: document.getElementById('btn-save-nick'),
    roomList: document.getElementById('room-list'),
    inputCustomRoom: document.getElementById('input-custom-room'),
    btnJoinCustomRoom: document.getElementById('btn-join-custom-room'),
    currentRoomName: document.getElementById('current-room-name'),
    usersInRoomList: document.getElementById('users-in-room-list'),
    chatHeaderTitle: document.getElementById('chat-header-title'),
    chatMessages: document.getElementById('chat-messages'),
    typingIndicator: document.getElementById('typing-indicator'),
    typingText: document.getElementById('typing-text'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    btnSpawnBot: document.getElementById('btn-spawn-simulated-client'),

    // Playground
    inputSelf: document.getElementById('input-self'),
    btnTestSelf: document.getElementById('btn-test-self'),
    inputBroadcast: document.getElementById('input-broadcast'),
    btnTestBroadcast: document.getElementById('btn-test-broadcast'),
    inputGlobal: document.getElementById('input-global'),
    btnTestGlobal: document.getElementById('btn-test-global'),
    selectPlaygroundRoom: document.getElementById('select-playground-room'),
    inputRoomMsg: document.getElementById('input-room-msg'),
    btnTestRoom: document.getElementById('btn-test-room'),
    btnTestAck: document.getElementById('btn-test-ack'),
    ackResultBox: document.getElementById('ack-result-box'),
    btnTestRestBroadcast: document.getElementById('btn-test-rest-broadcast'),
    playgroundResultsList: document.getElementById('playground-results-list'),
    btnClearPlayground: document.getElementById('btn-clear-playground-results'),

    // Inspektor
    inspectorTbody: document.getElementById('inspector-tbody'),
    checkAutoscroll: document.getElementById('check-autoscroll'),
    btnClearLogs: document.getElementById('btn-clear-logs'),
    manualEventName: document.getElementById('manual-event-name'),
    manualEventPayload: document.getElementById('manual-event-payload'),
    btnSendManualEvent: document.getElementById('btn-send-manual-event'),

    // Toasts
    toasts: document.getElementById('toast-container'),
  };

  // Ustawienie początkowego nicku w polu formularza
  dom.inputNick.value = state.username;

  // ───────── Inicjalizacja klienta Socket.io ─────────
  // Domyślnie klient łączy się z tym samym adresem (host:port), z którego serwowany jest HTML
  const socket = io({
    auth: {
      clientType: 'web-browser',
      username: state.username,
      version: '1.0.0',
    },
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  // ───────── Monitorowanie pakietów (Packet Sniffer) ─────────
  // Zastępujemy socket.emit, aby przechwytywać pakiety WYCHODZĄCE (OUT)
  const originalEmit = socket.emit.bind(socket);
  socket.emit = function (eventName, ...args) {
    // Nie logujemy wewnętrznych pingów do inspektora, by nie zaśmiecać widoku
    if (eventName !== 'ping:check') {
      const payload = args.length > 0 && typeof args[0] !== 'function' ? args[0] : null;
      logPacket('OUT', eventName, payload);
    }
    return originalEmit(eventName, ...args);
  };

  // Podsłuchujemy WSZYSTKIE pakiety PRZYCHODZĄCE (IN) za pomocą onAny
  socket.onAny((eventName, ...args) => {
    logPacket('IN', eventName, args.length === 1 ? args[0] : args);
  });

  function logPacket(direction, eventName, payload) {
    state.packetCount++;
    dom.packetCounter.textContent = state.packetCount;

    const row = document.createElement('tr');
    const time = new Date().toLocaleTimeString('pl-PL', { hour12: false, fractionalSecondDigits: 2 });
    const isOut = direction === 'OUT';

    row.innerHTML = `
      <td style="color: var(--faint);">${time}</td>
      <td>
        <span class="badge-dir ${isOut ? 'badge-out' : 'badge-in'}">${direction}</span>
      </td>
      <td><strong style="color: ${isOut ? 'var(--cyan)' : 'var(--green)'};">${escapeHtml(eventName)}</strong></td>
      <td><div class="json-cell">${escapeHtml(JSON.stringify(payload, null, 2) || '(brak)')}</div></td>
    `;

    dom.inspectorTbody.appendChild(row);

    if (dom.checkAutoscroll.checked) {
      dom.inspectorTbody.parentElement.scrollTop = dom.inspectorTbody.parentElement.scrollHeight;
    }
  }

  // ───────── Obsługa Cyklu Życia Połączenia ─────────
  socket.on('connect', () => {
    console.log('[Socket.io] Połączono! Socket ID:', socket.id);
    dom.dot.className = 'status-dot connected';
    dom.status.textContent = 'Połączono';
    dom.socketId.textContent = socket.id;

    const currentTransport = socket.io.engine.transport.name;
    updateTransportUI(currentTransport);

    // Aktualizacja wykresu flow
    dom.flowSteps.http.classList.remove('active');
    dom.flowSteps.polling.classList.toggle('active', currentTransport === 'polling');
    dom.flowSteps.ws.classList.toggle('active', currentTransport === 'websocket');

    showToast('Połączono z serwerem!', `Gniazdo aktywne (ID: ${socket.id.slice(0, 8)}...)`, 'green');

    // Automatyczne dołączenie do aktualnego pokoju
    joinSelectedRoom(state.room);

    // Nasłuchiwanie aktualizacji transportu (np. upgrade z polling do websocket)
    socket.io.engine.on('upgrade', (transport) => {
      console.log('[Socket.io Engine] Upgrade transportu do:', transport.name);
      updateTransportUI(transport.name);
      dom.flowSteps.upgrade.classList.add('active');
      dom.flowSteps.ws.classList.add('active');
      showToast('Upgrade protokołu!', `Socket.io zaktualizował połączenie do ${transport.name.toUpperCase()}`, 'cyan');
    });
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket.io] Rozłączono:', reason);
    dom.dot.className = 'status-dot disconnected';
    dom.status.textContent = 'Rozłączono';
    dom.socketId.textContent = 'brak';
    dom.latency.textContent = '-- ms';
    showToast('Rozłączono', `Powód: ${reason}`, 'red');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket.io] Błąd połączenia:', err);
    dom.dot.className = 'status-dot connecting';
    dom.status.textContent = 'Błąd połączenia';
    showToast('Błąd połączenia', err.message, 'amber');
  });

  socket.on('server:welcome', (data) => {
    console.log('[Serwer powitanie]:', data);
    dom.clients.textContent = data.totalClients || 1;
  });

  socket.on('server:stats', ({ totalClients }) => {
    dom.clients.textContent = totalClients;
  });

  socket.on('server:transport_upgrade', ({ transport }) => {
    updateTransportUI(transport);
  });

  function updateTransportUI(name) {
    dom.transport.textContent = name.toUpperCase();
    if (name === 'websocket') {
      dom.transport.style.color = 'var(--green)';
    } else {
      dom.transport.style.color = 'var(--amber)';
    }
  }

  // Pomiar opóźnienia sieciowego (Ping / Latency) co 4 sekundy
  setInterval(() => {
    if (socket.connected) {
      const start = Date.now();
      socket.emit('ping:check', start, () => {
        const latency = Date.now() - start;
        dom.latency.textContent = `${latency} ms`;
      });
    }
  }, 4000);

  // Wymuszenie ponownego połączenia
  dom.btnReconnect.addEventListener('click', () => {
    dom.status.textContent = 'Restartowanie...';
    dom.dot.className = 'status-dot connecting';
    socket.disconnect().connect();
  });

  // ───────── Obsługa Nawigacji / Zakładek ─────────
  dom.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      dom.tabButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      dom.tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // ───────── Obsługa Czatu i Pokoi ─────────

  // Zmiana pseudonimu
  dom.btnSaveNick.addEventListener('click', () => {
    const newNick = dom.inputNick.value.trim();
    if (newNick) {
      state.username = newNick;
      localStorage.setItem('socketio_nick', newNick);
      joinSelectedRoom(state.room);
      showToast('Zmieniono nick', `Aktualny pseudonim: ${newNick}`, 'cyan');
    }
  });

  // Wybór pokoju ze zdefiniowanych chipów
  dom.roomList.addEventListener('click', (e) => {
    const chip = e.target.closest('.room-chip');
    if (chip) {
      const room = chip.getAttribute('data-room');
      joinSelectedRoom(room);
    }
  });

  // Własny pokój
  dom.btnJoinCustomRoom.addEventListener('click', () => {
    const custom = dom.inputCustomRoom.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (custom) {
      joinSelectedRoom(custom);
      dom.inputCustomRoom.value = '';
    }
  });

  function joinSelectedRoom(roomName) {
    state.room = roomName;
    state.username = dom.inputNick.value.trim() || state.username;

    // Aktualizacja podświetlenia chipów
    document.querySelectorAll('.room-chip').forEach((c) => {
      c.classList.toggle('active', c.getAttribute('data-room') === roomName);
    });

    dom.currentRoomName.textContent = `#${roomName}`;
    dom.chatHeaderTitle.textContent = `#${roomName}`;

    // Emisja zdarzenia dołączenia do pokoju z callbackiem potwierdzenia
    socket.emit('chat:join', { username: state.username, room: roomName }, (response) => {
      if (response && response.success) {
        updateUsersInRoomUI(response.activeUsersInRoom || []);
        appendSystemMessage(`Dołączyłeś do pokoju #${response.room} jako ${response.user}.`);
      }
    });
  }

  // Odbiór wiadomości czatu
  socket.on('chat:message', (msg) => {
    appendChatMessage(msg);
  });

  // Odbiór komunikatu systemowego (ktoś dołączył/wyszedł)
  socket.on('chat:system', (sys) => {
    appendSystemMessage(sys.text);
  });

  // Aktualizacja listy użytkowników w pokoju
  socket.on('chat:room_users', ({ room, users }) => {
    if (room === state.room) {
      updateUsersInRoomUI(users);
    }
  });

  function updateUsersInRoomUI(users) {
    dom.usersInRoomList.innerHTML = '';
    if (!users || users.length === 0) {
      dom.usersInRoomList.innerHTML = '<li><span class="dot-online"></span> Brak innych</li>';
      return;
    }
    users.forEach((u) => {
      const isMe = u.id === socket.id;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="dot-online"></span>
        <span>${escapeHtml(u.username)} ${isMe ? '<small style="color:var(--cyan)">(Ty)</small>' : ''}</span>
      `;
      dom.usersInRoomList.appendChild(li);
    });
  }

  function appendChatMessage(msg) {
    const isMine = msg.senderId === socket.id;
    const row = document.createElement('div');
    row.className = `msg-row ${isMine ? 'outgoing' : 'incoming'}`;

    const initials = (msg.username || '??').slice(0, 2).toUpperCase();

    row.innerHTML = `
      <div class="msg-avatar">${initials}</div>
      <div class="msg-bubble">
        <div class="msg-meta">
          <span class="msg-author">${escapeHtml(msg.username)}</span>
          <span class="msg-time">${msg.time}</span>
        </div>
        <p class="msg-text">${escapeHtml(msg.text)}</p>
      </div>
    `;

    dom.chatMessages.appendChild(row);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  function appendSystemMessage(text) {
    const sys = document.createElement('div');
    sys.className = 'system-message';
    sys.innerHTML = `<span>${escapeHtml(text)}</span>`;
    dom.chatMessages.appendChild(sys);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  // Wysłanie wiadomości z formularza
  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = dom.chatInput.value.trim();
    if (!text) return;

    // Reset wskaźnika pisania
    if (state.isTyping) {
      state.isTyping = false;
      socket.emit('chat:typing', { isTyping: false });
    }

    socket.emit('chat:message', { text }, (ack) => {
      // Potwierdzenie dostarczenia do serwera
    });

    dom.chatInput.value = '';
    dom.chatInput.focus();
  });

  // Wskaźnik pisania (Typing Indicator)
  dom.chatInput.addEventListener('input', () => {
    if (!state.isTyping) {
      state.isTyping = true;
      socket.emit('chat:typing', { isTyping: true });
    }

    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      state.isTyping = false;
      socket.emit('chat:typing', { isTyping: false });
    }, 1500);
  });

  // Odbiór wskaźnika pisania od innych
  socket.on('chat:user_typing', ({ username, isTyping }) => {
    if (isTyping) {
      dom.typingText.textContent = `${username} pisze wiadomość...`;
      dom.typingIndicator.style.display = 'flex';
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    } else {
      dom.typingIndicator.style.display = 'none';
    }
  });

  // Szybkie przykłady tekstu
  document.querySelectorAll('.btn-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.chatInput.value = btn.getAttribute('data-text');
      dom.chatInput.focus();
    });
  });

  // Symulator drugiego klienta (Wirtualny Bot do testów w jednej karcie)
  dom.btnSpawnBot.addEventListener('click', () => {
    const botNick = `SymulatorBot_${Math.floor(Math.random() * 899 + 100)}`;
    showToast('Wirtualny Bot', `Uruchamiam bota ${botNick} w pokoju #${state.room}...`, 'violet');

    // Tworzymy drugie gniazdo w tle w pamięci przeglądarki!
    const botSocket = io({
      auth: { username: botNick, version: 'simulated-bot' },
    });

    botSocket.on('connect', () => {
      botSocket.emit('chat:join', { username: botNick, room: state.room }, () => {
        // Po chwili bot symuluje pisanie
        setTimeout(() => {
          botSocket.emit('chat:typing', { isTyping: true });
          setTimeout(() => {
            botSocket.emit('chat:typing', { isTyping: false });
            botSocket.emit('chat:message', {
              text: `Cześć! Jestem wirtualnym botem (${botNick}). Testuję komunikację WebSocket w czasie rzeczywistym! 🤖`,
            });
          }, 1200);
        }, 800);
      });
    });
  });

  // ───────── Obsługa Poligonu Emisji (Playground) ─────────

  // 1. Test socket.emit()
  dom.btnTestSelf.addEventListener('click', () => {
    const text = dom.inputSelf.value.trim();
    socket.emit('demo:self', { text });
  });

  // 2. Test socket.broadcast.emit()
  dom.btnTestBroadcast.addEventListener('click', () => {
    const text = dom.inputBroadcast.value.trim();
    socket.emit('demo:broadcast', { text });
  });

  // 3. Test io.emit()
  dom.btnTestGlobal.addEventListener('click', () => {
    const text = dom.inputGlobal.value.trim();
    socket.emit('demo:global', { text });
  });

  // 4. Test io.to(pokój).emit()
  dom.btnTestRoom.addEventListener('click', () => {
    const room = dom.selectPlaygroundRoom.value;
    const text = dom.inputRoomMsg.value.trim();
    socket.emit('demo:room', { room, text });
  });

  // 5. Test Ack Callback
  dom.btnTestAck.addEventListener('click', () => {
    const start = Date.now();
    dom.btnTestAck.disabled = true;
    dom.btnTestAck.textContent = 'Oczekiwanie na odpowiedź serwera...';

    socket.emit('demo:ack', { sentAt: start, message: 'Testowe zapytanie RPC z callbackiem' }, (response) => {
      const rtt = Date.now() - start;
      dom.btnTestAck.disabled = false;
      dom.btnTestAck.textContent = 'Przetestuj żądanie z callbackiem (Ack)';

      dom.ackResultBox.style.display = 'block';
      dom.ackResultBox.innerHTML = `
        <div style="color: var(--amber); font-weight:700; margin-bottom:4px;">
          ✔ Otrzymano potwierdzenie (RTT: ${rtt} ms, serwer: ${response.serverProcessingDurationMs} ms):
        </div>
        <pre style="margin:0; font-size:.78rem;">${escapeHtml(JSON.stringify(response, null, 2))}</pre>
      `;
      showToast('Odebrano ACK', `Serwer odpowiedział w callbacku (${rtt} ms)`, 'amber');
    });
  });

  // 6. Test wysyłki z REST POST /api/broadcast
  dom.btnTestRestBroadcast.addEventListener('click', async () => {
    try {
      dom.btnTestRestBroadcast.disabled = true;
      dom.btnTestRestBroadcast.textContent = 'Wysyłanie POST /api/broadcast...';

      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Wiadomość z REST API',
          message: 'To powiadomienie wygenerował endpoint HTTP Express i przekazał do Socket.io!',
        }),
      });
      const data = await res.json();
      showToast('Wysłano przez REST API', `Dostarczono do ${data.deliveredToClients} klientów`, 'pink');
    } catch (err) {
      showToast('Błąd HTTP', err.message, 'red');
    } finally {
      dom.btnTestRestBroadcast.disabled = false;
      dom.btnTestRestBroadcast.textContent = 'Wyślij alert przez REST POST /api/broadcast';
    }
  });

  // Odbiór wyników z poligonu
  socket.on('playground:result', (data) => {
    addPlaygroundResult(data);
    showToast(data.badge, data.title, getToastColorForType(data.type));
  });

  socket.on('playground:receipt', ({ method, message, time }) => {
    addPlaygroundResult({
      badge: method,
      title: 'Potwierdzenie wysłania broadcastu',
      description: message,
      time,
      payload: '(Wysłano do pozostałych gniazd)',
    });
  });

  // Alert systemowy
  socket.on('system:alert', (alert) => {
    showToast(`🚨 ${alert.title}`, alert.message, 'red');
    appendSystemMessage(`[ALERT REST] ${alert.title}: ${alert.message}`);
  });

  function getToastColorForType(type) {
    switch (type) {
      case 'self': return 'cyan';
      case 'broadcast': return 'pink';
      case 'global': return 'violet';
      case 'room': return 'green';
      default: return 'cyan';
    }
  }

  function addPlaygroundResult(data) {
    const empty = dom.playgroundResultsList.querySelector('.empty-state');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'feedback-item';
    item.innerHTML = `
      <div class="feedback-top">
        <span class="card-badge bg-${getToastColorForType(data.type)}">${escapeHtml(data.badge)}</span>
        <span class="mono" style="font-size: .75rem; color: var(--muted);">${data.time || new Date().toLocaleTimeString()}</span>
      </div>
      <div class="feedback-title">${escapeHtml(data.title)}</div>
      <div class="card-desc" style="margin: 0; font-size: .82rem;">${escapeHtml(data.description || '')}</div>
      ${data.payload ? `<pre class="code-box" style="margin: 6px 0 0;"><code style="font-size:.75rem;">${escapeHtml(JSON.stringify(data.payload, null, 2))}</code></pre>` : ''}
    `;

    dom.playgroundResultsList.prepend(item);
  }

  dom.btnClearPlayground.addEventListener('click', () => {
    dom.playgroundResultsList.innerHTML = '<div class="empty-state">Wyczyszczono wyniki. Wybierz test powyżej.</div>';
  });

  // ───────── Obsługa Inspektora Pakietów ─────────
  dom.btnClearLogs.addEventListener('click', () => {
    dom.inspectorTbody.innerHTML = '';
    state.packetCount = 0;
    dom.packetCounter.textContent = '0';
  });

  dom.btnSendManualEvent.addEventListener('click', () => {
    const eventName = dom.manualEventName.value.trim();
    const rawPayload = dom.manualEventPayload.value.trim();

    if (!eventName) {
      showToast('Błąd', 'Podaj nazwę zdarzenia (np. custom:ping)', 'amber');
      return;
    }

    let parsedPayload = rawPayload;
    try {
      parsedPayload = JSON.parse(rawPayload);
    } catch {
      // pozostawiamy jako string
    }

    socket.emit(eventName, parsedPayload);
    showToast('Wyemitowano ręcznie', `Wysłano zdarzenie: ${eventName}`, 'cyan');
  });

  // ───────── System Toastów (Floating Notifications) ─────────
  function showToast(title, desc, colorClass = 'cyan') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderLeft = `4px solid var(--${colorClass})`;

    toast.innerHTML = `
      <div style="flex:1;">
        <div class="toast-title" style="color: var(--${colorClass})">${escapeHtml(title)}</div>
        <div class="toast-desc">${escapeHtml(desc)}</div>
      </div>
    `;

    dom.toasts.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all .3s var(--ease)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Pomocnik bezpieczeństwa HTML
  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
