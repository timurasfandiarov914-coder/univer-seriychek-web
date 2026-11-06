(() => {
  "use strict";

  const STORAGE_KEY = "univer-seriychek-pwa-v1";
  const CLOUD_KEY = "univer-seriychek-cloud-v1";
  const SESSION_KEY = "univer-seriychek-session-v1";
  const app = document.getElementById("app");
  const nav = document.querySelector(".bottom-nav");
  const syncIndicator = document.getElementById("sync-indicator");
  const avatar = document.getElementById("profile-shortcut");

  const defaults = {
    version: 1,
    userName: "",
    university: "",
    latitude: null,
    longitude: null,
    radiusMeters: 250,
    allowedFrom: "06:00",
    allowedUntil: "22:00",
    weekdays: [1, 2, 3, 4, 5],
    records: []
  };

  let state = loadState();
  let activeTab = "home";
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDate = dateKey(new Date());
  let cloudBusy = false;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return saved && typeof saved === "object" ? { ...defaults, ...saved } : { ...defaults };
    } catch (_) {
      return { ...defaults };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    avatar.textContent = state.userName ? state.userName.trim().charAt(0).toUpperCase() : "U";
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function todayKey() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  }

  function dateFromKey(key) {
    const parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function formatDate(key, options) {
    return dateFromKey(key).toLocaleDateString("ru-RU", options || { day: "numeric", month: "long" });
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function visitedSet() {
    return new Set(state.records.map(record => record.date));
  }

  function currentStreak() {
    const visited = visitedSet();
    const today = dateFromKey(todayKey());
    const [endHour, endMinute] = state.allowedUntil.split(":").map(Number);
    const end = new Date();
    end.setHours(endHour || 22, endMinute || 0, 0, 0);
    let cursor = new Date(today);
    if (state.weekdays.includes(cursor.getDay() || 7) && !visited.has(todayKey()) && new Date() <= end) {
      cursor.setDate(cursor.getDate() - 1);
    }
    let count = 0;
    for (let i = 0; i < 370; i++) {
      const day = cursor.getDay() || 7;
      if (state.weekdays.includes(day)) {
        if (visited.has(dateKey(cursor))) count++;
        else break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function bestStreak() {
    const visited = state.records.map(r => r.date).sort();
    if (!visited.length) return 0;
    let best = 1, chain = 1;
    for (let i = 1; i < visited.length; i++) {
      let cursor = dateFromKey(visited[i - 1]);
      cursor.setDate(cursor.getDate() + 1);
      let missed = false;
      while (dateKey(cursor) < visited[i]) {
        const weekday = cursor.getDay() || 7;
        if (state.weekdays.includes(weekday)) { missed = true; break; }
        cursor.setDate(cursor.getDate() + 1);
      }
      chain = missed ? 1 : chain + 1;
      best = Math.max(best, chain);
    }
    return best;
  }

  function attendancePercent() {
    if (!state.records.length) return 0;
    const dates = state.records.map(r => r.date).sort();
    let cursor = dateFromKey(dates[0]);
    const end = dateFromKey(todayKey());
    let scheduled = 0;
    while (cursor <= end) {
      if (state.weekdays.includes(cursor.getDay() || 7)) scheduled++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return scheduled ? Math.min(100, Math.round(state.records.length * 100 / scheduled)) : 0;
  }

  function toast(message, type) {
    const region = document.getElementById("toast-region");
    region.innerHTML = '<div class="toast ' + (type || "") + '">' + esc(message) + "</div>";
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { region.innerHTML = ""; }, 3800);
  }

  function setCloudStatus(text, connected) {
    syncIndicator.classList.toggle("online", !!connected);
    syncIndicator.querySelector("span").textContent = text;
  }

  function metric(value, label) {
    return '<div class="metric"><strong>' + esc(value) + '</strong><span>' + esc(label) + "</span></div>";
  }

  function historyItem(record) {
    return '<div class="history-item"><div class="history-left"><span class="history-flame">🔥</span><div class="history-date"><b>' +
      esc(formatDate(record.date, { day: "numeric", month: "long", year: "numeric" })) +
      '</b><small>' + esc(formatTime(record.timestamp)) + " · " + Math.round(record.distanceMeters) +
      ' м до кампуса</small></div></div><span class="history-level">LVL ' + esc(record.levelAfter) + "</span></div>";
  }

  function homeView() {
    const checked = visitedSet().has(todayKey());
    const streak = currentStreak();
    const recent = [...state.records].sort((a, b) => b.timestamp - a.timestamp).slice(0, 4);
    const name = state.userName ? "Привет, " + esc(state.userName) : "Твоя серия начинается здесь";
    let claimText = "ЗАБРАТЬ ОГОНЁК 🔥";
    if (checked) claimText = "СЕГОДНЯ ТЫ УЖЕ ОТМЕТИЛСЯ ✓";
    const configured = !!(state.university && Number.isFinite(state.latitude) && Number.isFinite(state.longitude));
    return '<section class="page">' +
      '<div class="eyebrow">' + esc(new Date().toLocaleDateString("ru-RU", { weekday: "long" }).toUpperCase()) + ' · ' + esc(formatDate(todayKey(), { day: "numeric", month: "long" }).toUpperCase()) + '</div>' +
      '<h1 class="greeting">' + name + '</h1>' +
      '<section class="hero">' +
        '<div class="hero-top"><span class="hero-caption">ТВОЙ УНИВЕРСИТЕТСКИЙ РИТМ</span><span class="level-pill">LEVEL ' + state.records.length + '</span></div>' +
        '<div class="flame-orbit"><span class="flame-emoji">🔥</span></div>' +
        '<div class="flame-count">' + state.records.length + '</div><div class="flame-label">ОГОНЬКОВ СОБРАНО</div>' +
        '<div class="hero-stats">' + metric(streak + " дн.", "ТЕКУЩАЯ СЕРИЯ") + metric(bestStreak() + " дн.", "ЛУЧШИЙ РЕКОРД") + metric(state.records.length, "УРОВЕНЬ") + '</div>' +
        '<button class="primary-button" data-action="claim" ' + (checked || !configured ? "disabled" : "") + '>' + claimText + "</button>" +
        '<p class="helper">' + (checked ? "Сегодняшний огонёк уже в коллекции. Увидимся в следующий учебный день." :
          configured ? "Отметка доступна только в заданном радиусе от кампуса и в разрешённое время." :
          "Сначала настрой университет в профиле, чтобы открыть возможность получать огоньки.") + '</p>' +
      '</section>' +
      '<div class="section-head"><h2>ПОСЛЕДНИЕ ПОСЕЩЕНИЯ</h2><button class="text-link" data-tab="calendar">ВЕСЬ КАЛЕНДАРЬ ↗</button></div>' +
      (recent.length ? '<div class="history-list">' + recent.map(historyItem).join("") + '</div>' :
        '<div class="empty-state">Здесь появится твоя история огоньков.<br>Первый визит запускает серию 🔥</div>') +
      '<p class="helper">Не прерывай огонь. Каждый учебный день имеет значение.</p>' +
    '</section>';
  }

  function calendarView() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    const visited = visitedSet();
    const today = todayKey();
    let cells = "";
    for (let i = 0; i < offset; i++) cells += '<div class="day-cell blank"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const key = dateKey(date);
      const weekday = date.getDay() || 7;
      const scheduled = state.weekdays.includes(weekday);
      let cls = "day-cell";
      if (visited.has(key)) cls += " visited";
      else if (scheduled && key < today) cls += " missed";
      if (key === today) cls += " today";
      if (key > today) cls += " future";
      cells += '<button class="' + cls + '" data-action="select-date" data-date="' + key + '">' +
        (visited.has(key) ? "🔥" : day) + "</button>";
    }
    const selected = state.records.find(r => r.date === selectedDate);
    const selectedInfo = selected
      ? '<b>🔥 Посещение подтверждено</b><br>' + esc(formatDate(selected.date, { day: "numeric", month: "long", year: "numeric" })) +
        '<br>Время: ' + esc(formatTime(selected.timestamp)) + '<br>Достигнут уровень: ' + selected.levelAfter
      : '<b>' + esc(formatDate(selectedDate, { day: "numeric", month: "long", year: "numeric" })) + '</b><br>' +
        (dateFromKey(selectedDate) > dateFromKey(today) ? "Этот день ещё впереди." :
          state.weekdays.includes(dateFromKey(selectedDate).getDay() || 7) ? "В этот учебный день отметки нет." : "По твоему расписанию это выходной.");
    return '<section class="page"><div class="eyebrow">ТВОЯ ИСТОРИЯ</div><h1 class="page-title">Календарь</h1>' +
      '<div class="panel"><div class="calendar-head"><b>' +
      esc(calendarMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })) +
      '</b><div class="month-switch"><button data-action="month-prev" aria-label="Предыдущий месяц">‹</button><button data-action="month-next" aria-label="Следующий месяц">›</button></div></div>' +
      '<div class="calendar-grid">' + ["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"].map(x => '<div class="weekday">' + x + "</div>").join("") + cells + '</div>' +
      '<div class="legend"><span><i></i> Посещение</span><span><i class="missed-dot"></i> Пропуск</span><span><i class="off-dot"></i> Выходной</span></div></div>' +
      '<div class="detail-box">' + selectedInfo + '</div>' +
      '<div class="section-head"><h2>ВСЕ ОТМЕТКИ</h2><span class="eyebrow">' + state.records.length + " ДНЕЙ</span></div>" +
      (state.records.length ? '<div class="history-list">' + [...state.records].sort((a,b) => b.timestamp-a.timestamp).map(historyItem).join("") + '</div>' :
        '<div class="empty-state">Пока нет подтверждённых посещений.</div>') + '</section>';
  }

  const achievements = [
    { title: "Первый огонёк", desc: "Первое посещение", icon: "🔥", test: () => state.records.length >= 1 },
    { title: "Разогрев", desc: "3 посещения", icon: "♨️", test: () => state.records.length >= 3 },
    { title: "Начинающий", desc: "5 огоньков", icon: "🟠", test: () => state.records.length >= 5 },
    { title: "Вошёл в ритм", desc: "10 огоньков", icon: "⚡", test: () => state.records.length >= 10 },
    { title: "Железная дисциплина", desc: "20 огоньков", icon: "🛡️", test: () => state.records.length >= 20 },
    { title: "Универ стал привычкой", desc: "30 огоньков", icon: "🎓", test: () => state.records.length >= 30 },
    { title: "Несокрушимый", desc: "50 огоньков", icon: "💎", test: () => state.records.length >= 50 },
    { title: "Легенда университета", desc: "100 огоньков", icon: "👑", test: () => state.records.length >= 100 },
    { title: "Абсолютная дисциплина", desc: "200 огоньков", icon: "🏆", test: () => state.records.length >= 200 },
    { title: "Три дня в строю", desc: "3 учебных дня подряд", icon: "🔥", test: () => bestStreak() >= 3 },
    { title: "Неделя дисциплины", desc: "5 учебных дней подряд", icon: "📅", test: () => bestStreak() >= 5 },
    { title: "Несгибаемый", desc: "10 учебных дней подряд", icon: "⚔️", test: () => bestStreak() >= 10 },
    { title: "Марафонец", desc: "20 учебных дней подряд", icon: "🚀", test: () => bestStreak() >= 20 },
    { title: "Легенда серии", desc: "30 учебных дней подряд", icon: "🌟", test: () => bestStreak() >= 30 }
  ];

  function statsView() {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const week = state.records.filter(r => dateFromKey(r.date) >= new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate())).length;
    const month = state.records.filter(r => {
      const d = dateFromKey(r.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const unlocked = achievements.filter(a => a.test()).length;
    const items = achievements.map(a => {
      const yes = a.test();
      return '<div class="achievement ' + (yes ? "unlocked" : "") + '"><span class="achievement-icon">' +
        (yes ? a.icon : "🔒") + '</span><div class="achievement-copy"><b>' + esc(a.title) +
        '</b><small>' + esc(a.desc) + '</small></div><span class="achievement-status">' +
        (yes ? "ОТКРЫТО" : "ЗАКРЫТО") + "</span></div>";
    }).join("");
    return '<section class="page"><div class="eyebrow">ТВОИ РЕЗУЛЬТАТЫ</div><h1 class="page-title">Статистика</h1>' +
      '<div class="stats-grid">' +
      metric(state.records.length, "ВСЕГО ОГОНЬКОВ") +
      metric(currentStreak(), "ТЕКУЩАЯ СЕРИЯ") +
      metric(bestStreak(), "ЛУЧШАЯ СЕРИЯ") +
      metric(week, "ЗА 7 ДНЕЙ") +
      metric(month, "ЗА ЭТОТ МЕСЯЦ") +
      metric(attendancePercent() + "%", "ПОСЕЩАЕМОСТЬ") +
      '</div><div class="section-head"><h2>ПРОГРЕСС ДО СЛЕДУЮЩЕЙ ЦЕЛИ</h2><b class="achievement-status">' + unlocked + "/" + achievements.length + '</b></div>' +
      '<div class="panel"><div class="range-row"><span>Достижения открыты</span><b>' + Math.round(unlocked * 100 / achievements.length) + '%</b></div><div class="progress-track" style="margin-top:10px"><div class="progress-fill" style="width:' + (unlocked * 100 / achievements.length) + '%"></div></div></div>' +
      '<div class="section-head"><h2>ДОСТИЖЕНИЯ</h2></div><div class="achievement-list">' + items + '</div></section>';
  }

  function profileView() {
    const cloud = loadCloudConfig();
    const session = loadSession();
    const weekdayNames = ["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"];
    const weekdays = weekdayNames.map((name, i) => '<button type="button" class="day-toggle ' +
      (state.weekdays.includes(i + 1) ? "selected" : "") + '" data-action="toggle-day" data-day="' + (i + 1) + '">' + name + "</button>").join("");
    return '<section class="page"><div class="eyebrow">ТВОИ ДАННЫЕ</div><h1 class="page-title">Профиль</h1>' +
      '<form id="profile-form" class="panel form-stack">' +
      '<div class="field"><label for="user-name">ИМЯ</label><input id="user-name" name="userName" value="' + esc(state.userName) + '" placeholder="Как тебя называть"></div>' +
      '<div class="field"><label for="university">УНИВЕРСИТЕТ</label><input id="university" name="university" value="' + esc(state.university) + '" placeholder="Например, УУНиТ" required></div>' +
      '<div class="form-divider"></div><div class="field"><span class="field-label">КООРДИНАТЫ КАМПУСА</span>' +
      '<div class="field-row"><input id="latitude" name="latitude" inputmode="decimal" value="' + (state.latitude == null ? "" : esc(state.latitude)) + '" placeholder="Широта" aria-label="Широта">' +
      '<input id="longitude" name="longitude" inputmode="decimal" value="' + (state.longitude == null ? "" : esc(state.longitude)) + '" placeholder="Долгота" aria-label="Долгота"></div>' +
      '<button type="button" class="secondary-button full-width" data-action="capture-campus">◎ Определить мои координаты</button>' +
      '<span class="form-note">Нажми на территории университета. Браузер запросит разрешение на геолокацию.</span></div>' +
      '<div class="field"><div class="range-row"><label for="radius">РАДИУС ПРОВЕРКИ</label><b id="radius-value">' + state.radiusMeters + " м</b></div>" +
      '<input id="radius" name="radiusMeters" type="range" min="50" max="1000" step="25" value="' + state.radiusMeters + '"></div>' +
      '<div class="field"><span class="field-label">ВРЕМЯ ОТМЕТКИ</span><div class="field-row">' +
      '<input id="allowed-from" name="allowedFrom" type="time" value="' + esc(state.allowedFrom) + '" aria-label="Начало времени отметки">' +
      '<input id="allowed-until" name="allowedUntil" type="time" value="' + esc(state.allowedUntil) + '" aria-label="Окончание времени отметки"></div></div>' +
      '<div class="field"><span class="field-label">УЧЕБНЫЕ ДНИ</span><div class="days-grid">' + weekdays + '</div></div>' +
      '<button class="primary-button" type="submit">СОХРАНИТЬ НАСТРОЙКИ</button></form>' +
      '<div class="section-head"><h2>ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ</h2></div>' +
      '<div class="panel form-stack"><div id="cloud-status" class="cloud-status ' + (session ? "connected" : "") + '">' +
      (session ? "Есть авторизованная сессия облака. Можно синхронизировать историю между устройствами." : "Пока данные хранятся на этом устройстве. Подключи облако, чтобы переносить огоньки между iPhone и Android.") +
      '</div><div class="field"><label for="cloud-url">SUPABASE PROJECT URL</label><input id="cloud-url" type="url" value="' + esc(cloud.url || "") + '" placeholder="https://xxxx.supabase.co" autocomplete="url"></div>' +
      '<div class="field"><label for="cloud-key">SUPABASE ANON / PUBLISHABLE KEY</label><input id="cloud-key" type="password" value="' + esc(cloud.key || "") + '" placeholder="Публичный ключ проекта" autocomplete="off"></div>' +
      '<div class="field-row"><div class="field"><label for="cloud-email">EMAIL</label><input id="cloud-email" type="email" value="' + esc(cloud.email || "") + '" placeholder="email@example.com" autocomplete="email"></div>' +
      '<div class="field"><label for="cloud-password">ПАРОЛЬ</label><input id="cloud-password" type="password" placeholder="Пароль аккаунта" autocomplete="current-password"></div></div>' +
      '<div class="action-row"><button type="button" class="secondary-button" data-action="cloud-signup">Создать аккаунт</button><button type="button" class="primary-button" data-action="cloud-login">Войти и синхронизировать</button></div>' +
      '<button type="button" class="outline-button full-width" data-action="cloud-sync" ' + (session ? "" : "disabled") + '>Синхронизировать сейчас</button>' +
      '<button type="button" class="text-link" data-action="cloud-logout">Отключить облачный аккаунт</button>' +
      '<span class="form-note">Нужен бесплатный Supabase-проект и таблица из инструкции в репозитории. Пароль не сохраняется в браузере. Не вставляй сюда service_role key.</span></div>' +
      '<div class="section-head"><h2>РЕЗЕРВНАЯ КОПИЯ</h2></div><div class="panel form-stack">' +
      '<button class="secondary-button full-width" data-action="export">↓ Экспортировать мои данные</button>' +
      '<button class="outline-button full-width" data-action="import">↑ Импортировать резервную копию</button>' +
      '<input id="import-file" type="file" accept="application/json,.json" hidden>' +
      '<span class="form-note">Файл резервной копии можно перенести на другое устройство вручную. Импорт объединяет отметки по датам, не создавая дубликаты.</span></div>' +
      '<p class="helper">Геолокация в браузере зависит от разрешения и точности устройства. Она не обеспечивает абсолютную защиту от подмены координат или системного времени.</p>' +
      '</section>';
  }

  function render() {
    app.innerHTML = activeTab === "home" ? homeView() :
      activeTab === "calendar" ? calendarView() :
      activeTab === "stats" ? statsView() : profileView();
    nav.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.tab === activeTab));
    avatar.textContent = state.userName ? state.userName.trim().charAt(0).toUpperCase() : "U";
  }

  function switchTab(tab) {
    activeTab = tab;
    render();
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const rad = value => value * Math.PI / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Этот браузер не поддерживает геолокацию."));
        return;
      }
      if (!window.isSecureContext) {
        reject(new Error("Для GPS нужен защищённый HTTPS-адрес."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        position => resolve(position),
        error => {
          const messages = {
            1: "Нет разрешения на геолокацию. Разреши доступ в настройках Safari или браузера.",
            2: "Устройство пока не может определить координаты. Проверь службы геолокации.",
            3: "GPS отвечает слишком долго. Попробуй ещё раз на открытом месте."
          };
          reject(new Error(messages[error.code] || "Не удалось определить местоположение."));
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 18000 }
      );
    });
  }

  function isAllowedNow() {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const fromParts = state.allowedFrom.split(":").map(Number);
    const untilParts = state.allowedUntil.split(":").map(Number);
    const from = fromParts[0] * 60 + fromParts[1];
    const until = untilParts[0] * 60 + untilParts[1];
    return from <= until ? current >= from && current <= until : current >= from || current <= until;
  }

  async function claimFlame() {
    if (visitedSet().has(todayKey())) {
      toast("Сегодня ты уже забрал свой огонёк.");
      render();
      return;
    }
    if (!state.university || !Number.isFinite(state.latitude) || !Number.isFinite(state.longitude)) {
      toast("Сначала настрой университет и координаты в профиле.");
      switchTab("profile");
      return;
    }
    if (!state.weekdays.includes(new Date().getDay() || 7)) {
      toast("Сегодня нет учебного дня по твоему расписанию.");
      return;
    }
    if (!isAllowedNow()) {
      toast("Сейчас время отметки закрыто. Проверь интервал в профиле.");
      return;
    }
    const button = app.querySelector('[data-action="claim"]');
    if (button) {
      button.disabled = true;
      button.textContent = "ПРОВЕРЯЕМ МЕСТОПОЛОЖЕНИЕ...";
    }
    try {
      const position = await getPosition();
      const accuracy = position.coords.accuracy;
      if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 100) {
        throw new Error("GPS пока неточный (" + Math.round(accuracy || 0) + " м). Подожди немного и повтори проверку.");
      }
      const distance = haversine(position.coords.latitude, position.coords.longitude, state.latitude, state.longitude);
      if (distance > state.radiusMeters) {
        throw new Error("Ты вне радиуса университета. Расстояние сейчас " + Math.round(distance) + " м.");
      }
      const date = todayKey();
      if (visitedSet().has(date)) {
        toast("Отметка за сегодня уже есть.");
        render();
        return;
      }
      const level = state.records.length + 1;
      state.records.push({
        date,
        timestamp: Date.now(),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy,
        distanceMeters: distance,
        levelAfter: level
      });
      state.records.sort((a, b) => a.timestamp - b.timestamp);
      saveState();
      render();
      toast("Огонёк получен! Теперь твой уровень " + level + " 🔥", "success");
      syncToCloud(false);
    } catch (error) {
      render();
      toast(error.message || "Не удалось подтвердить посещение.");
    }
  }

  async function captureCampus() {
    toast("Определяем координаты кампуса...");
    try {
      const position = await getPosition();
      state.latitude = Number(position.coords.latitude.toFixed(6));
      state.longitude = Number(position.coords.longitude.toFixed(6));
      saveState();
      render();
      toast("Координаты кампуса сохранены. Проверь радиус и нажми «Сохранить настройки».", "success");
    } catch (error) {
      toast(error.message || "Не удалось определить координаты.");
    }
  }

  function saveProfile(form) {
    const data = new FormData(form);
    const userName = String(data.get("userName") || "").trim();
    const university = String(data.get("university") || "").trim();
    const latitude = String(data.get("latitude") || "").trim() === "" ? null : Number(data.get("latitude"));
    const longitude = String(data.get("longitude") || "").trim() === "" ? null : Number(data.get("longitude"));
    const radiusMeters = Number(data.get("radiusMeters"));
    const allowedFrom = String(data.get("allowedFrom") || "06:00");
    const allowedUntil = String(data.get("allowedUntil") || "22:00");
    const weekdays = [...form.querySelectorAll(".day-toggle.selected")].map(x => Number(x.dataset.day)).sort();
    if (!university) return toast("Укажи название университета.");
    if ((latitude == null) !== (longitude == null)) return toast("Заполни обе координаты или оставь обе пустыми.");
    if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return toast("Проверь широту.");
    if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return toast("Проверь долготу.");
    if (!weekdays.length) return toast("Выбери хотя бы один учебный день.");
    state = { ...state, userName, university, latitude, longitude, radiusMeters, allowedFrom, allowedUntil, weekdays };
    saveState();
    render();
    toast("Настройки сохранены.", "success");
    syncToCloud(false);
  }

  function loadCloudConfig() {
    try { return JSON.parse(localStorage.getItem(CLOUD_KEY) || "{}"); } catch (_) { return {}; }
  }
  function saveCloudConfig(config) {
    localStorage.setItem(CLOUD_KEY, JSON.stringify(config));
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
  }
  function saveSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function supabaseFetch(path, options) {
    const config = loadCloudConfig();
    if (!config.url || !config.key) throw new Error("Сначала заполни URL и public anon key.");
    const session = loadSession();
    const headers = {
      "Content-Type": "application/json",
      "apikey": config.key,
      "Authorization": "Bearer " + (session && session.access_token ? session.access_token : config.key),
      ...(options && options.headers ? options.headers : {})
    };
    const response = await fetch(config.url.replace(/\/$/, "") + path, {
      ...(options || {}),
      headers
    });
    const body = await response.text();
    let parsed = null;
    try { parsed = body ? JSON.parse(body) : null; } catch (_) { parsed = body; }
    if (!response.ok) {
      const message = parsed && (parsed.msg || parsed.message || parsed.error_description || parsed.error) || "Ошибка облачного сервиса (" + response.status + ").";
      throw new Error(String(message));
    }
    return parsed;
  }

  async function cloudAuthenticate(createAccount) {
    const url = (document.getElementById("cloud-url") || {}).value || "";
    const key = (document.getElementById("cloud-key") || {}).value || "";
    const email = (document.getElementById("cloud-email") || {}).value || "";
    const password = (document.getElementById("cloud-password") || {}).value || "";
    if (!url.startsWith("https://") || !key.trim() || !email.trim() || password.length < 8) {
      return toast("Проверь URL, ключ, email и пароль (не короче 8 символов).");
    }
    const config = { url: url.trim().replace(/\/$/, ""), key: key.trim(), email: email.trim() };
    saveCloudConfig(config);
    setCloudStatus("Подключаем облачный аккаунт...", false);
    try {
      let session;
      if (createAccount) {
        const signup = await fetch(config.url + "/auth/v1/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": config.key },
          body: JSON.stringify({ email: config.email, password })
        });
        const signupData = await signup.json().catch(() => ({}));
        if (!signup.ok) throw new Error(signupData.msg || signupData.message || signupData.error_description || "Не удалось создать аккаунт.");
        if (signupData.access_token) session = signupData;
        else {
          const login = await fetch(config.url + "/auth/v1/token?grant_type=password", {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": config.key },
            body: JSON.stringify({ email: config.email, password })
          });
          const loginData = await login.json().catch(() => ({}));
          if (!login.ok || !loginData.access_token) throw new Error("Аккаунт создан. Подтверди email, если это требуется в Supabase, и затем войди.");
          session = loginData;
        }
      } else {
        const login = await fetch(config.url + "/auth/v1/token?grant_type=password", {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": config.key },
          body: JSON.stringify({ email: config.email, password })
        });
        const loginData = await login.json().catch(() => ({}));
        if (!login.ok || !loginData.access_token) throw new Error(loginData.msg || loginData.message || loginData.error_description || "Не удалось войти.");
        session = loginData;
      }
      saveSession(session);
      const input = document.getElementById("cloud-password");
      if (input) input.value = "";
      await syncToCloud(true);
    } catch (error) {
      setCloudStatus("Облачная синхронизация пока не подключена.", false);
      toast(error.message || "Ошибка подключения к облаку.");
    }
  }

  function mergeRecords(localRecords, remoteRecords) {
    const byDate = new Map();
    [...(remoteRecords || []), ...(localRecords || [])].forEach(record => {
      if (record && record.date) {
        const previous = byDate.get(record.date);
        if (!previous || Number(record.timestamp) >= Number(previous.timestamp)) byDate.set(record.date, record);
      }
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async function syncToCloud(showSuccess) {
    const session = loadSession();
    if (!session || !session.access_token || cloudBusy) return;
    cloudBusy = true;
    setCloudStatus("Синхронизируем...", false);
    try {
      const remoteRows = await supabaseFetch("/rest/v1/attendance_profiles?select=data&user_id=eq." + encodeURIComponent(session.user.id));
      const remoteState = remoteRows && remoteRows.length ? remoteRows[0].data : null;
      if (remoteState && typeof remoteState === "object") {
        const localHasSettings = !!(state.university || state.latitude != null);
        state = {
          ...defaults,
          ...remoteState,
          ...state,
          userName: localHasSettings ? state.userName : (remoteState.userName || state.userName),
          university: localHasSettings ? state.university : (remoteState.university || state.university),
          latitude: localHasSettings ? state.latitude : (remoteState.latitude ?? state.latitude),
          longitude: localHasSettings ? state.longitude : (remoteState.longitude ?? state.longitude),
          weekdays: localHasSettings ? state.weekdays : (remoteState.weekdays || state.weekdays),
          records: mergeRecords(state.records, remoteState.records)
        };
        saveState();
      }
      const response = await supabaseFetch("/rest/v1/attendance_profiles?on_conflict=user_id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: session.user.id,
          data: state,
          updated_at: new Date().toISOString()
        })
      });
      setCloudStatus("ОБЛАКО СИНХРОНИЗИРОВАНО", true);
      render();
      if (showSuccess) toast("История объединена и сохранена в облаке на всех устройствах.", "success");
    } catch (error) {
      setCloudStatus("ОШИБКА СИНХРОНИЗАЦИИ", false);
      if (showSuccess) toast(error.message || "Не удалось синхронизировать данные.");
    } finally {
      cloudBusy = false;
    }
  }

  function exportBackup() {
    const payload = {
      app: "Универ Серийчек",
      exportedAt: new Date().toISOString(),
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "univer-seriychek-backup-" + todayKey() + ".json";
    link.click();
    URL.revokeObjectURL(url);
    toast("Резервная копия подготовлена.", "success");
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        const imported = payload.state || payload;
        if (!imported || !Array.isArray(imported.records)) throw new Error("Файл не похож на резервную копию Серийчека.");
        state = {
          ...state,
          ...imported,
          records: mergeRecords(state.records, imported.records)
        };
        saveState();
        render();
        toast("Резервная копия импортирована.", "success");
        syncToCloud(false);
      } catch (error) {
        toast(error.message || "Не удалось прочитать файл.");
      }
    };
    reader.readAsText(file);
  }

  nav.addEventListener("click", event => {
    const button = event.target.closest("[data-tab]");
    if (button) switchTab(button.dataset.tab);
  });
  avatar.addEventListener("click", () => switchTab("profile"));

  app.addEventListener("input", event => {
    if (event.target.id === "radius") {
      const label = document.getElementById("radius-value");
      if (label) label.textContent = event.target.value + " м";
    }
  });

  app.addEventListener("submit", event => {
    if (event.target.id === "profile-form") {
      event.preventDefault();
      saveProfile(event.target);
    }
  });

  app.addEventListener("click", event => {
    const button = event.target.closest("[data-action], [data-tab]");
    if (!button) return;
    if (button.dataset.tab) return switchTab(button.dataset.tab);
    const action = button.dataset.action;
    if (action === "claim") claimFlame();
    if (action === "capture-campus") captureCampus();
    if (action === "toggle-day") {
      const day = Number(button.dataset.day);
      state.weekdays = state.weekdays.includes(day) ? state.weekdays.filter(x => x !== day) : [...state.weekdays, day].sort();
      render();
    }
    if (action === "month-prev") {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
      render();
    }
    if (action === "month-next") {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
      render();
    }
    if (action === "select-date") {
      selectedDate = button.dataset.date;
      render();
    }
    if (action === "export") exportBackup();
    if (action === "import") document.getElementById("import-file").click();
    if (action === "cloud-signup") cloudAuthenticate(true);
    if (action === "cloud-login") cloudAuthenticate(false);
    if (action === "cloud-sync") syncToCloud(true);
    if (action === "cloud-logout") {
      saveSession(null);
      setCloudStatus("Облачный аккаунт отключён. Локальные данные сохранены.", false);
      render();
      toast("Облачный аккаунт отключён. Огоньки на этом устройстве не удалены.");
    }
  });

  app.addEventListener("change", event => {
    if (event.target.id === "import-file" && event.target.files && event.target.files[0]) {
      importBackup(event.target.files[0]);
      event.target.value = "";
    }
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  saveState();
  render();
  if (loadSession()) syncToCloud(false);
  else setCloudStatus("НА УСТРОЙСТВЕ", false);
})();
