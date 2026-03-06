/**
 * app.js — Главная логика MAX Трекер Привычек
 *
 * Архитектура: один объект App с методами для каждого экрана.
 * Навигация: модальные экраны (screen-modal) въезжают справа.
 * Данные: всё через Storage (localStorage).
 * SDK: window.MaxWebApp (нативный или мок).
 */

'use strict';

// ──────────────────────────────────────────────────────────────
//  Глобальные переменные состояния
// ──────────────────────────────────────────────────────────────

// Текущий открытый модальный экран
let _currentModal = null;

// Данные формы добавления/редактирования привычки
let _editingHabit = null;   // null = создание новой, объект = редактирование
let _formData = {};         // текущие данные формы

// Текущий habitId в контекстном меню
let _contextHabitId = null;

// Текущий месяц в heatmap (детали привычки)
let _heatmapYear = new Date().getFullYear();
let _heatmapMonth = new Date().getMonth();

// Выбранное напоминание в онбординге
let _selectedReminder = 'morning';

// Выбранные шаблоны в онбординге
const _selectedTemplates = new Set();

// ──────────────────────────────────────────────────────────────
//  Вспомогательные функции
// ──────────────────────────────────────────────────────────────

/** Возвращает человекочитаемую дату: "Среда, 5 марта" */
function formatTodayLabel() {
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const months = ['января','февраля','марта','апреля','мая','июня',
                  'июля','августа','сентября','октября','ноября','декабря'];
  const d = new Date();
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

/** Название месяца в родительном падеже для heatmap */
function monthName(month, year) {
  const names = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                 'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${names[month]} ${year}`;
}

/** Названия дней недели для отображения частоты */
function freqLabel(habit) {
  if (habit.frequency === 'daily') return 'Каждый день';
  if (Array.isArray(habit.frequency)) {
    const labels = { mon:'Пн',tue:'Вт',wed:'Ср',thu:'Чт',fri:'Пт',sat:'Сб',sun:'Вс' };
    return habit.frequency.map(d => labels[d]).join(', ');
  }
  return 'Ежедневно';
}

/** Сегодня YYYY-MM-DD */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/** Применяет тему к document.documentElement */
function applyTheme(scheme) {
  const root = document.documentElement;
  if (scheme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (scheme === 'light') {
    root.removeAttribute('data-theme');
  } else {
    // 'auto' — по системе
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    prefersDark ? root.setAttribute('data-theme','dark') : root.removeAttribute('data-theme');
  }
}

/** Плавно показывает экран */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

/** Показывает уведомление-тост снизу */
function showToast(msg, duration = 2000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    Object.assign(toast.style, {
      position: 'fixed', bottom: 'calc(70px + env(safe-area-inset-bottom))',
      left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(50,50,50,0.92)', color: '#fff',
      padding: '10px 20px', borderRadius: '20px',
      fontSize: '14px', fontWeight: '500',
      zIndex: '9999', opacity: '0',
      transition: 'opacity 0.2s',
      whiteSpace: 'nowrap', maxWidth: '80vw',
      backdropFilter: 'blur(8px)',
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// ──────────────────────────────────────────────────────────────
//  Инициализация приложения
// ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const SDK = window.MaxWebApp;
  SDK.ready();
  SDK.expand();

  // Применяем тему
  const settings = Storage.getSettings();
  applyTheme(settings.theme !== 'auto' ? settings.theme : SDK.colorScheme);

  // Обновляем тему при изменении системной
  document.addEventListener('sdk:themeChanged', (e) => {
    const s = Storage.getSettings();
    if (s.theme === 'auto') applyTheme(e.detail.scheme);
  });

  // SDK BackButton — глобальный обработчик
  SDK.BackButton.onClick(() => App.handleBack());

  // MainButton — сохранить привычку
  document.addEventListener('sdk:mainbtn', () => {});

  // После сплэша — решаем, что показывать
  setTimeout(() => {
    const splash = document.getElementById('screen-splash');
    splash.classList.add('fade-out');
    setTimeout(() => {
      if (Storage.isOnboardingDone()) {
        App.showApp();
      } else if (new URLSearchParams(location.search).get('onboarding') === '1') {
        App.showOnboarding();
      } else {
        Storage.seedDemoData();
        App.showApp();
      }
    }, 350);
  }, 900);
});

// ──────────────────────────────────────────────────────────────
//  Главный объект приложения App
// ──────────────────────────────────────────────────────────────

const App = {

  // ── Навигация ─────────────────────────────────────────────

  /** Открывает основное приложение (после онбординга или при повторном запуске) */
  showApp() {
    showScreen('screen-app');
    this.renderToday();
    // Инициализируем пользователя из SDK
    const user = window.MaxWebApp.initDataUnsafe.user;
    const s = Storage.getSettings();
    if (user && !s.userName) Storage.saveSettings({ userName: user.first_name });
  },

  /** Показывает онбординг (только для новых пользователей) */
  showOnboarding() {
    showScreen('screen-onboarding');
    this._renderTemplateGrid();
  },

  /** Открывает модальный экран (слайд справа) */
  openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    _currentModal = id;
    el.classList.add('active');
    window.MaxWebApp.BackButton.show();
    // Скрываем FAB пока открыт модальный экран
    const fab = document.getElementById('fab-add');
    if (fab) fab.style.display = 'none';
  },

  /** Закрывает текущий модальный экран */
  closeModal() {
    if (!_currentModal) return;
    const el = document.getElementById(_currentModal);
    if (el) el.classList.remove('active');
    // Скрываем MainButton если был показан
    window.MaxWebApp.MainButton.hide();
    window.MaxWebApp.BackButton.hide();
    _currentModal = null;
    _editingHabit = null;
    _formData = {};
    // Возвращаем FAB
    const fab = document.getElementById('fab-add');
    if (fab) fab.style.display = '';
    this.renderToday();
  },

  /** Глобальный обработчик BackButton */
  handleBack() {
    if (_currentModal) { this.closeModal(); return; }
    if (document.getElementById('overlay-context').classList.contains('active')) {
      this.closeContextMenu(); return;
    }
  },

  /** Переключает вкладку */
  switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('nav-' + tabId).classList.add('active');
    if (tabId === 'progress') this.renderProgress();
    if (tabId === 'settings') this.renderSettings();
    if (tabId === 'today')    this.renderToday();
  },

  // ── Онбординг ─────────────────────────────────────────────

  /** Рендерит сетку шаблонов привычек */
  _renderTemplateGrid() {
    const grid = document.getElementById('template-grid');
    grid.innerHTML = HABIT_TEMPLATES.map((t, i) => `
      <div class="template-card" data-index="${i}" onclick="App.toggleTemplate(${i})">
        <span class="template-card-icon">${t.icon}</span>
        <span class="template-card-name">${t.name}</span>
      </div>
    `).join('');
  },

  /** Переключает выбор шаблона привычки */
  toggleTemplate(index) {
    const card = document.querySelector(`.template-card[data-index="${index}"]`);
    if (_selectedTemplates.has(index)) {
      _selectedTemplates.delete(index);
      card.classList.remove('selected');
    } else {
      if (_selectedTemplates.size >= 3) {
        showToast('Выбери не больше 3 привычек для начала');
        return;
      }
      _selectedTemplates.add(index);
      card.classList.add('selected');
    }
    window.MaxWebApp.HapticFeedback.selectionChanged();
    document.getElementById('ob-btn-2').disabled = _selectedTemplates.size === 0;
  },

  /** Переход к следующему шагу онбординга */
  obNext(fromStep) {
    window.MaxWebApp.HapticFeedback.impactOccurred('light');
    const current = document.getElementById(`ob-step-${fromStep}`);
    const next = document.getElementById(`ob-step-${fromStep + 1}`);
    current.classList.remove('active');
    next.classList.add('active');
  },

  /** Выбор типа напоминания */
  selectReminder(value) {
    _selectedReminder = value;
    document.querySelectorAll('.reminder-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.value === value);
    });
    window.MaxWebApp.HapticFeedback.selectionChanged();
  },

  /** Завершение онбординга */
  obFinish() {
    window.MaxWebApp.HapticFeedback.notificationOccurred('success');

    // Создаём выбранные привычки
    _selectedTemplates.forEach(idx => {
      Storage.createFromTemplate(HABIT_TEMPLATES[idx]);
    });

    // Сохраняем настройку напоминаний
    const remMap = {
      morning: { remindersEnabled: true, morningTime: '08:00' },
      evening: { remindersEnabled: true, eveningTime: '21:00' },
      both:    { remindersEnabled: true, morningTime: '08:00', eveningTime: '21:00' },
      none:    { remindersEnabled: false },
    };
    Storage.saveSettings(remMap[_selectedReminder] || {});

    Storage.setOnboardingDone();
    this.showApp();
  },

  // ── Вкладка Сегодня ───────────────────────────────────────

  /** Полный перерендер главного экрана */
  renderToday() {
    // Дата
    document.getElementById('today-date').textContent = formatTodayLabel();

    // Прогресс
    const { done, total, percent } = Storage.getTodayProgress();
    document.getElementById('progress-count').textContent = `${done} из ${total}`;
    const fill = document.getElementById('progress-bar-fill');
    fill.style.width = (total ? percent : 0) + '%';
    fill.className = 'progress-bar-fill' + (percent === 100 ? ' full' : '');

    // Глобальный streak — максимальный среди всех привычек
    const habits = Storage.getHabits();
    const maxStreak = habits.reduce((m, h) => Math.max(m, Storage.getStreak(h.id)), 0);
    document.getElementById('global-streak-num').textContent = maxStreak;
    const badge = document.getElementById('global-streak-badge');
    badge.style.display = maxStreak > 0 ? 'flex' : 'none';

    // Список привычек
    const list = document.getElementById('habits-list');
    if (!habits.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🌱</div>
          <div class="empty-state-title">Привычки живут здесь</div>
          <div class="empty-state-sub">Начни с одной — даже маленький шаг меняет жизнь</div>
          <button class="btn-primary" onclick="App.showAddHabit()">Добавить привычку</button>
        </div>
      `;
      return;
    }

    // Группируем по секциям
    const sections = { morning: [], evening: [], any: [] };
    habits.forEach(h => sections[h.section || 'any'].push(h));

    const sectionLabels = { morning: 'Утро', evening: 'Вечер', any: '' };
    let html = '';

    // Разделяем выполненные и невыполненные
    const today = todayStr();
    ['morning','evening','any'].forEach(sec => {
      const list = sections[sec];
      if (!list.length) return;
      const undone = list.filter(h => !Storage.isCompleted(h.id, today));
      const done2  = list.filter(h =>  Storage.isCompleted(h.id, today));
      const all = [...undone, ...done2];
      if (sectionLabels[sec]) {
        html += `<div class="section-label">${sectionLabels[sec]}</div>`;
      }
      all.forEach(h => { html += this._habitCardHTML(h); });
    });

    list.innerHTML = html;
  },

  /** HTML одной карточки привычки */
  _habitCardHTML(habit) {
    const today = todayStr();
    const done = Storage.isCompleted(habit.id, today);
    const streak = Storage.getStreak(habit.id);
    const streakHtml = streak > 0
      ? `<div class="habit-streak"><span class="habit-streak-icon">🔥</span><span class="habit-streak-num">${streak}</span></div>`
      : '';
    return `
      <div class="habit-card ${done ? 'done' : ''}"
           data-id="${habit.id}"
           onclick="App.onHabitCardClick(event, '${habit.id}')"
           oncontextmenu="event.preventDefault(); App.showContextMenu('${habit.id}')">
        <div class="habit-card-stripe" style="background:${habit.color}"></div>
        <div class="habit-card-icon">${habit.icon}</div>
        <div class="habit-card-info">
          <div class="habit-card-name">${habit.name}</div>
          <div class="habit-card-freq">${freqLabel(habit)}</div>
        </div>
        ${streakHtml}
        <button class="habit-check-btn ${done ? 'done' : ''}"
                data-id="${habit.id}"
                onclick="event.stopPropagation(); App.toggleHabit('${habit.id}')">
          <span class="habit-check-icon">✓</span>
        </button>
      </div>
    `;
  },

  /** Тап по карточке: если не на кнопке чекбокса — открыть детали */
  onHabitCardClick(event, habitId) {
    // Если клик пришёл от кнопки — не открывать детали
    if (event.target.closest('.habit-check-btn')) return;
    this.showHabitDetail(habitId);
  },

  /** Переключить выполнение привычки */
  toggleHabit(habitId) {
    const isDone = Storage.toggleCompletion(habitId);
    window.MaxWebApp.HapticFeedback.impactOccurred(isDone ? 'medium' : 'light');

    // Обновляем карточку без полного перерендера
    const card = document.querySelector(`.habit-card[data-id="${habitId}"]`);
    const btn = document.querySelector(`.habit-check-btn[data-id="${habitId}"]`);
    if (card) card.classList.toggle('done', isDone);
    if (btn)  btn.classList.toggle('done', isDone);

    // Обновляем прогресс-бар и streak
    const { done, total, percent } = Storage.getTodayProgress();
    document.getElementById('progress-count').textContent = `${done} из ${total}`;
    const fill = document.getElementById('progress-bar-fill');
    fill.style.width = (total ? percent : 0) + '%';
    fill.className = 'progress-bar-fill' + (percent === 100 ? ' full' : '');

    // Если всё выполнено — показываем праздник
    if (isDone && done === total && total > 0) {
      setTimeout(() => this.showDoneOverlay(), 300);
    }

    // Перемещаем карточку через полный перерендер (сортировка done-вниз)
    setTimeout(() => this.renderToday(), 250);
  },

  // ── Оверлей "Все выполнено" ───────────────────────────────

  showDoneOverlay() {
    window.MaxWebApp.HapticFeedback.notificationOccurred('success');
    const habits = Storage.getHabits();
    const maxStreak = habits.reduce((m, h) => Math.max(m, Storage.getStreak(h.id)), 0);
    document.getElementById('done-streak-text').textContent = `🔥 Серия: ${maxStreak} ${this._dayWord(maxStreak)}`;
    document.getElementById('overlay-done').classList.add('active');
    this._launchConfetti();
    setTimeout(() => this.closeDoneOverlay(), 3500);
  },

  closeDoneOverlay() {
    document.getElementById('overlay-done').classList.remove('active');
    document.getElementById('confetti-container').innerHTML = '';
  },

  /** Запускает анимацию конфетти */
  _launchConfetti() {
    const colors = ['#2AABEE','#FF9500','#30D158','#BF5AF2','#FF375F','#FFD60A'];
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.cssText = `
        left: ${Math.random() * 100}%;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${6 + Math.random() * 6}px;
        height: ${6 + Math.random() * 6}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-delay: ${Math.random() * 0.6}s;
        animation-duration: ${1.4 + Math.random() * 0.8}s;
      `;
      container.appendChild(piece);
    }
  },

  /** Склонение слова "день" */
  _dayWord(n) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return 'день';
    if ([2,3,4].includes(n10) && ![12,13,14].includes(n100)) return 'дня';
    return 'дней';
  },

  // ── Добавить / Редактировать привычку ─────────────────────

  showAddHabit(habitId) {
    _editingHabit = habitId ? Storage.getHabit(habitId) : null;
    _formData = _editingHabit ? { ..._editingHabit } : {
      name: '',
      icon: '⭐',
      color: HABIT_COLORS[0],
      section: 'any',
      frequency: 'daily',
      createdAt: todayStr(),
    };

    document.getElementById('add-habit-title').textContent =
      _editingHabit ? 'Редактировать' : 'Новая привычка';

    this._renderAddHabitForm();
    this.openModal('screen-add-habit');

    // MainButton SDK для сохранения
    const SDK = window.MaxWebApp;
    SDK.MainButton
      .setText(_editingHabit ? 'Сохранить изменения' : 'Создать привычку')
      .onClick(() => App.saveHabit())
      .show();
    this._updateSaveBtn();
  },

  /** Рендерит форму добавления/редактирования */
  _renderAddHabitForm() {
    const form = document.getElementById('add-habit-form');
    const freq = _formData.frequency;
    const days = Array.isArray(freq) ? freq : [];

    form.innerHTML = `
      <!-- Название -->
      <div class="form-section">
        <div class="form-label">Название</div>
        <input class="form-input" id="habit-name-input" type="text"
               placeholder="Например: Пить воду"
               value="${_formData.name || ''}"
               oninput="App.onNameInput(this.value)"
               maxlength="40" />
      </div>

      <!-- Иконка -->
      <div class="form-section">
        <div class="form-label">Иконка</div>
        <div class="icon-picker-scroll">
          <div class="icon-picker-row" id="icon-picker-row">
            ${HABIT_ICONS.map(ic => `
              <button class="icon-btn ${ic === _formData.icon ? 'selected' : ''}"
                      onclick="App.selectIcon('${ic}')">${ic}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Цвет -->
      <div class="form-section">
        <div class="form-label">Цвет</div>
        <div class="color-picker-row" id="color-picker-row">
          ${HABIT_COLORS.map(c => `
            <button class="color-btn ${c === _formData.color ? 'selected' : ''}"
                    onclick="App.selectColor('${c}')"
                    style="background: transparent;">
              <div class="color-btn-inner" style="background:${c}"></div>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Когда выполнять -->
      <div class="form-section">
        <div class="form-label">Когда выполнять</div>
        <div class="freq-buttons">
          <button class="freq-btn ${_formData.section==='morning'?'active':''}"
                  onclick="App.selectSection('morning')">🌅 Утром</button>
          <button class="freq-btn ${_formData.section==='evening'?'active':''}"
                  onclick="App.selectSection('evening')">🌙 Вечером</button>
          <button class="freq-btn ${_formData.section==='any'?'active':''}"
                  onclick="App.selectSection('any')">🕐 Любое</button>
        </div>
      </div>

      <!-- Частота -->
      <div class="form-section">
        <div class="form-label">Частота</div>
        <div class="freq-buttons">
          <button class="freq-btn ${_formData.frequency==='daily'?'active':''}"
                  onclick="App.selectFreq('daily')">Каждый день</button>
          <button class="freq-btn ${Array.isArray(_formData.frequency)?'active':''}"
                  onclick="App.selectFreq('custom')">Дни недели</button>
        </div>
        ${Array.isArray(freq) ? `
          <div class="weekdays-row" style="margin-top:8px">
            ${[['mon','Пн'],['tue','Вт'],['wed','Ср'],['thu','Чт'],
               ['fri','Пт'],['sat','Сб'],['sun','Вс']].map(([k,l]) => `
              <button class="wd-btn ${days.includes(k)?'active':''}"
                      onclick="App.toggleDay('${k}')">${l}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>

      ${_editingHabit ? `
        <button class="btn-danger" onclick="App.deleteHabit('${_editingHabit.id}')">
          🗑️ Удалить привычку
        </button>
      ` : ''}
    `;

    // Фокус на поле названия
    setTimeout(() => document.getElementById('habit-name-input')?.focus(), 300);
  },

  onNameInput(val) {
    _formData.name = val.trim();
    this._updateSaveBtn();
  },

  selectIcon(icon) {
    _formData.icon = icon;
    document.querySelectorAll('.icon-btn').forEach(b => {
      b.classList.toggle('selected', b.textContent === icon);
    });
    window.MaxWebApp.HapticFeedback.selectionChanged();
  },

  selectColor(color) {
    _formData.color = color;
    document.querySelectorAll('.color-btn').forEach(b => {
      b.classList.toggle('selected', b.querySelector('.color-btn-inner').style.background === color);
    });
    window.MaxWebApp.HapticFeedback.selectionChanged();
  },

  selectSection(sec) {
    _formData.section = sec;
    document.querySelectorAll('.freq-buttons button').forEach((b, i) => {
      if (i < 3) b.classList.toggle('active', ['morning','evening','any'][i] === sec);
    });
    this._rerenderSectionButtons();
  },

  _rerenderSectionButtons() {
    const secs = ['morning','evening','any'];
    document.querySelectorAll('#add-habit-form .form-section').forEach((section, idx) => {
      if (idx === 3) { // секция "Когда выполнять"
        section.querySelectorAll('.freq-btn').forEach((b, i) => {
          b.classList.toggle('active', secs[i] === _formData.section);
        });
      }
    });
  },

  selectFreq(type) {
    if (type === 'daily') {
      _formData.frequency = 'daily';
    } else {
      _formData.frequency = _formData.frequency === 'daily' ? ['mon','tue','wed','thu','fri'] : _formData.frequency;
    }
    this._renderAddHabitForm();
  },

  toggleDay(day) {
    if (!Array.isArray(_formData.frequency)) _formData.frequency = [];
    const idx = _formData.frequency.indexOf(day);
    if (idx !== -1) {
      _formData.frequency.splice(idx, 1);
    } else {
      _formData.frequency.push(day);
    }
    // Обновляем кнопку дня
    const btns = document.querySelectorAll('.wd-btn');
    const dayKeys = ['mon','tue','wed','thu','fri','sat','sun'];
    btns.forEach((b, i) => b.classList.toggle('active', _formData.frequency.includes(dayKeys[i])));
    window.MaxWebApp.HapticFeedback.selectionChanged();
  },

  _updateSaveBtn() {
    const hasName = (_formData.name || '').trim().length > 0;
    const SDK = window.MaxWebApp;
    hasName ? SDK.MainButton.enable() : SDK.MainButton.disable();
  },

  /** Сохраняет привычку */
  saveHabit() {
    const name = (_formData.name || '').trim();
    if (!name) { showToast('Введи название привычки'); return; }

    const habit = {
      id: _editingHabit?.id,
      name,
      icon: _formData.icon || '⭐',
      color: _formData.color || HABIT_COLORS[0],
      section: _formData.section || 'any',
      frequency: _formData.frequency || 'daily',
      createdAt: _formData.createdAt || todayStr(),
      archivedAt: null,
    };

    Storage.saveHabit(habit);
    window.MaxWebApp.HapticFeedback.notificationOccurred('success');
    showToast(_editingHabit ? 'Привычка обновлена' : 'Привычка добавлена ✓');
    this.closeModal();
  },

  /** Удаляет (архивирует) привычку с подтверждением */
  deleteHabit(habitId) {
    window.MaxWebApp.showConfirm(
      'Удалить привычку?\nВся история будет сохранена в архиве.',
      (ok) => {
        if (!ok) return;
        Storage.archiveHabit(habitId);
        window.MaxWebApp.HapticFeedback.notificationOccurred('warning');
        showToast('Привычка удалена');
        this.closeModal();
      }
    );
  },

  // ── Детали привычки ───────────────────────────────────────

  showHabitDetail(habitId) {
    _heatmapYear = new Date().getFullYear();
    _heatmapMonth = new Date().getMonth();

    const habit = Storage.getHabit(habitId);
    if (!habit) return;

    document.getElementById('detail-title').textContent = `${habit.icon} ${habit.name}`;
    document.getElementById('detail-edit-btn').onclick = () => {
      this.closeModal();
      setTimeout(() => this.showAddHabit(habitId), 300);
    };

    this._renderDetailContent(habitId);
    this.openModal('screen-habit-detail');
  },

  _renderDetailContent(habitId) {
    const habit = Storage.getHabit(habitId);
    if (!habit) return;

    const streak = Storage.getStreak(habitId);
    const maxStreak = Storage.getMaxStreak(habitId);
    const rate30 = Storage.getCompletionRate(habitId, 30);
    const completions = Storage.getCompletions(habitId);

    document.getElementById('detail-content').innerHTML = `
      <!-- Streak-блок -->
      <div class="detail-streak-block">
        <div class="detail-streak-num">${streak}</div>
        <div class="detail-streak-label">🔥 дней подряд</div>
        <div class="detail-streak-record">Рекорд: ${maxStreak} ${this._dayWord(maxStreak)}</div>
      </div>

      <!-- Статистика -->
      <div class="detail-stats-row">
        <div class="detail-stat-card">
          <div class="detail-stat-num">${rate30}%</div>
          <div class="detail-stat-label">за 30 дней</div>
        </div>
        <div class="detail-stat-card">
          <div class="detail-stat-num">${completions.length}</div>
          <div class="detail-stat-label">всего раз</div>
        </div>
        <div class="detail-stat-card">
          <div class="detail-stat-num">${maxStreak}</div>
          <div class="detail-stat-label">рекорд дней</div>
        </div>
      </div>

      <!-- Heatmap -->
      <div class="heatmap-block" id="heatmap-block">
        ${this._renderHeatmap(habitId, _heatmapYear, _heatmapMonth)}
      </div>
    `;

    // Сохраняем habitId для навигации по месяцам
    document.getElementById('heatmap-block').dataset.habitId = habitId;
  },

  /** Рендерит heatmap для месяца */
  _renderHeatmap(habitId, year, month) {
    const data = Storage.getHeatmapData(habitId, year, month);
    const today = todayStr();
    const habit = Storage.getHabit(habitId);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    // Смещение: в России неделя начинается с понедельника (1=Пн ... 0=Вс)
    const offset = (firstDay + 6) % 7;

    const wdLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    let html = `
      <div class="heatmap-header">
        <div class="heatmap-month-label">${monthName(month, year)}</div>
        <div class="heatmap-nav">
          <button class="heatmap-nav-btn" onclick="App.heatmapPrev()"
                  ${(year === 2024 && month === 0) ? 'disabled' : ''}>‹</button>
          <button class="heatmap-nav-btn" onclick="App.heatmapNext()"
                  ${(year === new Date().getFullYear() && month === new Date().getMonth()) ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <div class="heatmap-weekdays">
        ${wdLabels.map(d => `<div class="heatmap-wd">${d}</div>`).join('')}
      </div>
      <div class="heatmap-grid">
    `;

    // Пустые ячейки до начала месяца
    for (let i = 0; i < offset; i++) {
      html += `<div class="heatmap-cell empty"></div>`;
    }

    // Дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isDone = data[dateStr];
      const isToday = dateStr === today;
      const isFuture = dateStr > today;
      const classes = ['heatmap-cell',
        isDone ? 'done' : '',
        isToday ? 'today' : '',
        isFuture ? 'future' : '',
      ].filter(Boolean).join(' ');
      const style = isDone ? `style="background:${habit.color}"` : '';
      html += `<div class="${classes}" ${style}>${day}</div>`;
    }

    html += `</div>`;
    return html;
  },

  heatmapPrev() {
    _heatmapMonth--;
    if (_heatmapMonth < 0) { _heatmapMonth = 11; _heatmapYear--; }
    const block = document.getElementById('heatmap-block');
    block.innerHTML = this._renderHeatmap(block.dataset.habitId, _heatmapYear, _heatmapMonth);
    block.dataset.habitId = block.dataset.habitId; // preserve
  },

  heatmapNext() {
    const now = new Date();
    if (_heatmapYear === now.getFullYear() && _heatmapMonth === now.getMonth()) return;
    _heatmapMonth++;
    if (_heatmapMonth > 11) { _heatmapMonth = 0; _heatmapYear++; }
    const block = document.getElementById('heatmap-block');
    block.innerHTML = this._renderHeatmap(block.dataset.habitId, _heatmapYear, _heatmapMonth);
    block.dataset.habitId = block.dataset.habitId;
  },

  // ── Вкладка: Прогресс ─────────────────────────────────────

  renderProgress() {
    const habits = Storage.getHabits();
    const container = document.getElementById('progress-content');

    if (!habits.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding-top:40px">
          <div class="empty-state-icon">📊</div>
          <div class="empty-state-title">Пока нет данных</div>
          <div class="empty-state-sub">Добавь привычки и возвращайся сюда через неделю</div>
        </div>`;
      return;
    }

    // Прогресс этой недели
    const today = new Date();
    let weekDone = 0, weekTotal = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      habits.forEach(h => {
        weekTotal++;
        if (Storage.isCompleted(h.id, ds)) weekDone++;
      });
    }
    const weekPercent = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

    // Лучший день
    const dayStats = {};
    const dayNames = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const dn = d.getDay();
      if (!dayStats[dn]) dayStats[dn] = { done: 0, total: 0 };
      habits.forEach(h => {
        dayStats[dn].total++;
        if (Storage.isCompleted(h.id, ds)) dayStats[dn].done++;
      });
    }
    let bestDay = 0, bestPct = 0;
    Object.entries(dayStats).forEach(([day, s]) => {
      const pct = s.total ? s.done / s.total : 0;
      if (pct > bestPct) { bestPct = pct; bestDay = +day; }
    });

    // Сортируем по streak
    const sorted = [...habits].sort((a, b) => Storage.getStreak(b.id) - Storage.getStreak(a.id));

    container.innerHTML = `
      <!-- Неделя -->
      <div class="progress-section">
        <div class="section-title">Эта неделя</div>
        <div class="week-progress-card">
          <div class="week-prog-row">
            <span class="week-prog-label">Общий прогресс</span>
            <span class="week-prog-percent">${weekPercent}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill ${weekPercent===100?'full':''}"
                 style="width:${weekPercent}%"></div>
          </div>
        </div>
      </div>

      <!-- Серии -->
      <div class="progress-section">
        <div class="section-title">Серии привычек</div>
        ${sorted.map(h => {
          const streak = Storage.getStreak(h.id);
          return `
            <div class="progress-habit-card" onclick="App.showHabitDetail('${h.id}')">
              <span class="progress-habit-icon">${h.icon}</span>
              <span class="progress-habit-name">${h.name}</span>
              <span class="progress-habit-streak">🔥 ${streak}</span>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Инсайт -->
      ${bestPct > 0 ? `
      <div class="progress-section">
        <div class="section-title">Инсайт</div>
        <div class="insight-card">
          <span class="insight-icon">📅</span>
          <span>Лучший день — <strong>${dayNames[bestDay]}</strong> (${Math.round(bestPct*100)}% выполнения)</span>
        </div>
      </div>
      ` : ''}
    `;
  },

  // ── Вкладка: Настройки ────────────────────────────────────

  renderSettings() {
    const settings = Storage.getSettings();
    const userName = settings.userName || window.MaxWebApp.initDataUnsafe.user?.first_name || 'Пользователь';
    const container = document.getElementById('settings-content');

    container.innerHTML = `
      <!-- Аккаунт -->
      <div class="settings-group">
        <div class="settings-group-label">Аккаунт</div>
        <div class="settings-block">
          <div class="settings-row">
            <span class="settings-row-icon">👤</span>
            <span class="settings-row-label">${userName}</span>
            <span class="settings-row-value">${window.MaxWebApp.initDataUnsafe.user?.username ? '@' + window.MaxWebApp.initDataUnsafe.user.username : ''}</span>
          </div>
        </div>
      </div>

      <!-- Уведомления -->
      <div class="settings-group">
        <div class="settings-group-label">Уведомления</div>
        <div class="settings-block">
          <div class="settings-row">
            <span class="settings-row-icon">🔔</span>
            <span class="settings-row-label">Напоминания</span>
            <label class="toggle">
              <input type="checkbox" ${settings.remindersEnabled ? 'checked' : ''}
                     onchange="App.toggleReminders(this.checked)">
              <div class="toggle-track"></div>
              <div class="toggle-thumb"></div>
            </label>
          </div>
          ${settings.remindersEnabled ? `
            <div class="settings-row" onclick="App.pickTime('morning')">
              <span class="settings-row-icon">🌅</span>
              <span class="settings-row-label">Утреннее</span>
              <span class="settings-row-value text-accent">${settings.morningTime}</span>
            </div>
            <div class="settings-row" onclick="App.pickTime('evening')">
              <span class="settings-row-icon">🌙</span>
              <span class="settings-row-label">Вечернее</span>
              <span class="settings-row-value text-accent">${settings.eveningTime}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Внешний вид -->
      <div class="settings-group">
        <div class="settings-group-label">Внешний вид</div>
        <div class="settings-block">
          <div class="settings-row" onclick="App.cycleTheme()">
            <span class="settings-row-icon">🎨</span>
            <span class="settings-row-label">Тема</span>
            <span class="settings-row-value" id="theme-value-label">
              ${{ auto: 'Системная', light: 'Светлая', dark: 'Тёмная' }[settings.theme]}
            </span>
          </div>
          <div class="settings-row" onclick="App.toggleWeekStart()">
            <span class="settings-row-icon">📅</span>
            <span class="settings-row-label">Начало недели</span>
            <span class="settings-row-value" id="weekstart-label">
              ${settings.weekStart === 'mon' ? 'Понедельник' : 'Воскресенье'}
            </span>
          </div>
        </div>
      </div>

      <!-- О приложении -->
      <div class="settings-group">
        <div class="settings-group-label">Другое</div>
        <div class="settings-block">
          <div class="settings-row" onclick="App.clearData()">
            <span class="settings-row-icon">🗑️</span>
            <span class="settings-row-label text-danger">Очистить все данные</span>
          </div>
          <div class="settings-row">
            <span class="settings-row-icon">ℹ️</span>
            <span class="settings-row-label">Версия</span>
            <span class="settings-row-value">1.0.0</span>
          </div>
        </div>
      </div>
    `;
  },

  toggleReminders(enabled) {
    Storage.saveSettings({ remindersEnabled: enabled });
    this.renderSettings();
  },

  pickTime(period) {
    const settings = Storage.getSettings();
    const cur = period === 'morning' ? settings.morningTime : settings.eveningTime;
    // В реальном MAX используем нативный time picker, в моке — prompt
    const val = prompt(`Время ${period === 'morning' ? 'утреннего' : 'вечернего'} напоминания:`, cur);
    if (val && /^\d{2}:\d{2}$/.test(val)) {
      Storage.saveSettings(period === 'morning' ? { morningTime: val } : { eveningTime: val });
      this.renderSettings();
    }
  },

  cycleTheme() {
    const s = Storage.getSettings();
    const themes = ['auto', 'light', 'dark'];
    const next = themes[(themes.indexOf(s.theme) + 1) % themes.length];
    Storage.saveSettings({ theme: next });
    applyTheme(next === 'auto' ? window.MaxWebApp.colorScheme : next);
    this.renderSettings();
    window.MaxWebApp.HapticFeedback.selectionChanged();
  },

  toggleWeekStart() {
    const s = Storage.getSettings();
    Storage.saveSettings({ weekStart: s.weekStart === 'mon' ? 'sun' : 'mon' });
    this.renderSettings();
    window.MaxWebApp.HapticFeedback.selectionChanged();
  },

  clearData() {
    window.MaxWebApp.showConfirm(
      'Удалить все данные?\nЭто действие необратимо.',
      (ok) => {
        if (!ok) return;
        localStorage.removeItem('mxt_habits');
        localStorage.removeItem('mxt_completions');
        localStorage.removeItem('mxt_settings');
        localStorage.removeItem('mxt_onboarding');
        window.MaxWebApp.HapticFeedback.notificationOccurred('warning');
        location.reload();
      }
    );
  },

  // ── Контекстное меню ──────────────────────────────────────

  showContextMenu(habitId) {
    _contextHabitId = habitId;
    const habit = Storage.getHabit(habitId);
    document.getElementById('context-habit-name').textContent =
      habit ? `${habit.icon} ${habit.name}` : 'Привычка';
    document.getElementById('overlay-context').classList.add('active');
    window.MaxWebApp.HapticFeedback.impactOccurred('medium');
  },

  closeContextMenu() {
    document.getElementById('overlay-context').classList.remove('active');
    _contextHabitId = null;
  },

  contextEdit() {
    const id = _contextHabitId;
    this.closeContextMenu();
    setTimeout(() => this.showAddHabit(id), 250);
  },

  contextSkip() {
    if (!_contextHabitId) return;
    // "Пропустить" = отметить как выполнено (не ломает серию)
    const isCompleted = Storage.isCompleted(_contextHabitId, todayStr());
    if (!isCompleted) Storage.toggleCompletion(_contextHabitId);
    this.closeContextMenu();
    showToast('Привычка пропущена на сегодня');
    this.renderToday();
    window.MaxWebApp.HapticFeedback.impactOccurred('light');
  },

  contextDelete() {
    const id = _contextHabitId;
    this.closeContextMenu();
    setTimeout(() => this.deleteHabit(id), 250);
  },

};
