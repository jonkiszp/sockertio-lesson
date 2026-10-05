# Socket.io Lab – WebSockets w Node.js & Express

Interaktywny projekt demonstracyjny komunikacji dwukierunkowej w czasie rzeczywistym (*full-duplex*) z wykorzystaniem biblioteki **Socket.io**.
Materiał dydaktyczny do **Lekcji 92** (*WebSockets – komunikacja dwukierunkowa z Socket.io*) oraz **Lekcji 93** (*Tworzenie czatu lub systemu powiadomień w czasie rzeczywistym*).

---

## 🚀 Uruchomienie projektu

Wymagane środowisko: **Node.js (v18+)** oraz **npm**.

```bash
# 1. Przejdź do folderu projektu
cd socketio

# 2. Zainstaluj zależności (jeśli jeszcze nie zainstalowano)
npm install

# 3. Uruchom serwer w trybie deweloperskim (auto-restart przy zmianach w src/)
npm run dev
```

Serwer domyślnie nasłuchuje na porcie **4000**:
- 🌐 Interfejs graficzny: [http://localhost:4000](http://localhost:4000)
- 📊 Endpoint stanu REST API: [http://localhost:4000/api/status](http://localhost:4000/api/status)

*(Port 4000 został wybrany, aby nie kolidować z portem 3000 używanym w projekcie Multer).*

---

## 🛠️ Dostępne skrypty npm

| Polecenie | Co robi |
|---|---|
| `npm run dev` | Uruchamia serwer z flagą `--watch-path=src` (restart przy zmianach w kodzie) |
| `npm start` | Zwykłe uruchomienie produkcyjne serwera |
| `npm run client` | Uruchamia **konsolowego klienta w osobnym terminalu** (`examples/client-console.js`) |

> [!TIP]
> **Jak przetestować komunikację wieloosobową?**
> 1. Otwórz stronę [http://localhost:4000](http://localhost:4000) w **dwóch osobnych kartach/oknach** przeglądarki (np. jako *Uczeń 1* i *Uczeń 2*).
> 2. LUB kliknij w interfejsie przycisk **„Symuluj 2. klienta (Wirtualny Bot)”**.
> 3. LUB w osobnym terminalu uruchom `npm run client`.

---

## 📁 Struktura projektu

```
socketio/
├── package.json                   # Skrypty i zależności (express, socket.io, socket.io-client)
├── README.md                      # Dokumentacja projektu i lekcji
├── .gitignore                     # Ignorowanie node_modules
├── src/
│   ├── server.js                  # Inicjalizacja serwera HTTP, Express i Socket.io, middleware, REST API
│   └── handlers/
│       ├── chatHandler.js         # Obsługa pokojów (rooms), wiadomości, pisania (typing) i rozłączeń
│       └── playgroundHandler.js   # Demonstracja rodzajów emisji: unicast, broadcast, global, ack
├── public/
│   ├── index.html                 # Responsywny interfejs graficzny (Czat, Poligon, Inspektor)
│   ├── style.css                  # Nowoczesny arkusz stylów CSS (Dark theme, neon glow, HUD, responsive)
│   └── app.js                     # Klient Socket.io w przeglądarce, przechwytywanie pakietów (sniffer)
└── examples/
    └── client-console.js          # Samodzielny klient konsolowy Node.js (test z wiersza poleceń)
```

---

## 📚 Co gdzie jest (Powiązanie z programem nauczania)

### Lekcja 92: WebSockets – komunikacja dwukierunkowa z Socket.io

1. **Inicjalizacja serwera na bazie HTTP:**
   - Plik: `src/server.js`
   - Socket.io wymaga instancji `http.Server` (z modułu `node:http`), na którym współdziała z aplikacją Express:
     ```js
     const app = express();
     const httpServer = http.createServer(app);
     const io = new Server(httpServer, { cors: { origin: '*' } });
     ```

2. **Middleware w Socket.io:**
   - Plik: `src/server.js`
   - Walidacja danych klienta przed zaakceptowaniem gniazda (`io.use((socket, next) => { ... })`).

3. **Cykl życia połączenia i upgrade protokołu:**
   - Socket.io rozpoczyna połączenie od **HTTP Long-Polling** i po weryfikacji nagłówków podnosi je (*upgrade*) do trwałego **WebSocket**.
   - Na żywo widać to na pasku HUD oraz w diagramie flow w `index.html`.

4. **Rodzaje emisji komunikatów (Poligon doświadczalny):**
   - Plik: `src/handlers/playgroundHandler.js`

   | Metoda | Kto otrzymuje wiadomość? | Zastosowanie |
   |---|---|---|
   | `socket.emit('event', data)` | **Tylko ten jeden klient** (nadawca) | Odpowiedź na zapytanie, błąd walidacji, dane prywatne |
   | `socket.broadcast.emit('event', data)` | **Wszyscy POZA nadawcą** | Informacja „Uczeń X dołączył”, wskaźnik pisania |
   | `io.emit('event', data)` | **Wszyscy połączeni** (w tym nadawca) | Globalne ogłoszenie, zmiana stanu gry/aplikacji |
   | `io.to('pokoj').emit('event', data)` | **Wszyscy w danym pokoju** | Czat pokoju, prywatny kanał, stolik w grze |
   | `socket.emit('event', data, callback)` | **Klient + Serwer (Ack)** | Potwierdzenie zapisu (RPC) z czasem przetwarzania |

5. **Współpraca z tradycyjnym REST API:**
   - Plik: `src/server.js` (trasa `POST /api/broadcast`)
   - Pokazuje, jak zewnętrzny kontroler HTTP Express może rozesłać powiadomienie do podłączonych gniazd WebSocket (`io.emit`).

---

### Lekcja 93: Tworzenie czatu i systemu powiadomień w czasie rzeczywistym

1. **Obsługa pokojów (`rooms`):**
   - Plik: `src/handlers/chatHandler.js`
   - Dołączanie: `socket.join(roomName)`
   - Opuszczanie: `socket.leave(roomName)`
   - Pobieranie listy gniazd w pokoju: `io.sockets.adapter.rooms.get(roomName)`

2. **Wskaźnik pisania wiadomości w czasie rzeczywistym (*Typing Indicator*):**
   - Zdarzenie `chat:typing` emitowane podczas wpisywania tekstu przez użytkownika z wygaszaniem (debounce 1.5s).
   - Inni użytkownicy w pokoju widzą animowany wskaźnik `... pisze wiadomość`.

3. **Inspektor pakietów na żywo (*Packet Sniffer*):**
   - Plik: `public/app.js`
   - Wykorzystanie wbudowanego w Socket.io klienta mechanizmu `socket.onAny` do nasłuchu wszystkich przychodzących ramek oraz przechwytywanie ramek wychodzących w celach edukacyjnych.
