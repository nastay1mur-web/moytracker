/**
 * MAX-web-app.js
 * Мок-реализация MAX Web App SDK для локальной разработки.
 * Совместима с Telegram WebApp API — в MAX Mini App оба интерфейса одинаковы.
 *
 * В реальном окружении MAX/Telegram этот файл не нужен:
 * там window.Telegram.WebApp предоставляет нативный SDK.
 */

(function () {
  'use strict';

  // Если уже запущены внутри Telegram/MAX — используем нативный SDK
  if (window.Telegram && window.Telegram.WebApp) {
    window.MaxWebApp = window.Telegram.WebApp;
    return;
  }

  // ──────────────────────────────────────────────
  //  Определяем системную тему
  // ──────────────────────────────────────────────
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  // ──────────────────────────────────────────────
  //  Моковый пользователь
  // ──────────────────────────────────────────────
  const MOCK_USER = {
    id: 100000001,
    first_name: 'Алексей',
    last_name: '',
    username: 'alex_habits',
    language_code: 'ru',
  };

  // ──────────────────────────────────────────────
  //  Параметры тёмной и светлой темы
  // ──────────────────────────────────────────────
  const THEME_LIGHT = {
    bg_color: '#F2F2F7',
    secondary_bg_color: '#FFFFFF',
    text_color: '#000000',
    hint_color: '#8E8E93',
    link_color: '#2AABEE',
    button_color: '#2AABEE',
    button_text_color: '#FFFFFF',
  };

  const THEME_DARK = {
    bg_color: '#1C1C1E',
    secondary_bg_color: '#2C2C2E',
    text_color: '#FFFFFF',
    hint_color: '#8E8E93',
    link_color: '#2AABEE',
    button_color: '#2AABEE',
    button_text_color: '#FFFFFF',
  };

  // ──────────────────────────────────────────────
  //  MainButton — нативная полноширинная кнопка
  //  В Telegram она рисуется ВНЕ WebView.
  //  В моке инжектируем в DOM с position:fixed.
  // ──────────────────────────────────────────────
  let _mainBtnEl = null;
  let _mainBtnCb = null;

  function _ensureMainBtnEl() {
    if (_mainBtnEl) return;
    _mainBtnEl = document.createElement('button');
    _mainBtnEl.id = 'sdk-main-button';
    Object.assign(_mainBtnEl.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      right: '0',
      height: '56px',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      background: '#2AABEE',
      color: '#fff',
      fontSize: '16px',
      fontWeight: '600',
      border: 'none',
      cursor: 'pointer',
      zIndex: '9000',
      display: 'none',
      transition: 'opacity 0.15s, background 0.15s',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      letterSpacing: '0.2px',
    });
    _mainBtnEl.addEventListener('click', () => {
      if (_mainBtnCb && !_mainBtnEl.disabled) _mainBtnCb();
    });
    document.body.appendChild(_mainBtnEl);
  }

  const MainButton = {
    text: 'ОК',
    color: '#2AABEE',
    textColor: '#FFFFFF',
    isVisible: false,
    isActive: true,

    setText(t) {
      this.text = t;
      this._sync();
      return this;
    },
    show() {
      this.isVisible = true;
      this._sync();
      // Сообщаем приложению, чтобы добавило отступ снизу
      document.dispatchEvent(new CustomEvent('sdk:mainbtn', { detail: { visible: true } }));
      return this;
    },
    hide() {
      this.isVisible = false;
      this._sync();
      document.dispatchEvent(new CustomEvent('sdk:mainbtn', { detail: { visible: false } }));
      return this;
    },
    enable() {
      this.isActive = true;
      this._sync();
      return this;
    },
    disable() {
      this.isActive = false;
      this._sync();
      return this;
    },
    onClick(cb) {
      _mainBtnCb = cb;
      return this;
    },
    offClick() {
      _mainBtnCb = null;
      return this;
    },
    _sync() {
      _ensureMainBtnEl();
      _mainBtnEl.textContent = this.text;
      _mainBtnEl.style.display = this.isVisible ? 'block' : 'none';
      _mainBtnEl.style.background = this.color;
      _mainBtnEl.style.color = this.textColor;
      _mainBtnEl.style.opacity = this.isActive ? '1' : '0.55';
      _mainBtnEl.disabled = !this.isActive;
    },
  };

  // ──────────────────────────────────────────────
  //  BackButton — кнопка «назад» в шапке
  //  В Telegram рисуется нативно в хедере.
  //  В моке эмулируем через событие.
  // ──────────────────────────────────────────────
  let _backBtnCb = null;

  const BackButton = {
    isVisible: false,
    show() {
      this.isVisible = true;
      document.dispatchEvent(new CustomEvent('sdk:backbtn', { detail: { visible: true } }));
      return this;
    },
    hide() {
      this.isVisible = false;
      document.dispatchEvent(new CustomEvent('sdk:backbtn', { detail: { visible: false } }));
      return this;
    },
    onClick(cb) {
      _backBtnCb = cb;
      return this;
    },
    offClick() {
      _backBtnCb = null;
      return this;
    },
    _trigger() {
      if (_backBtnCb) _backBtnCb();
    },
  };

  // Клавиша Escape и Android back — триггер BackButton
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && BackButton.isVisible) BackButton._trigger();
  });

  // ──────────────────────────────────────────────
  //  HapticFeedback
  // ──────────────────────────────────────────────
  const HapticFeedback = {
    impactOccurred(style) {
      if (!navigator.vibrate) return;
      const ms = { light: 8, medium: 15, heavy: 30, rigid: 12, soft: 6 };
      navigator.vibrate(ms[style] || 15);
    },
    notificationOccurred(type) {
      if (!navigator.vibrate) return;
      const pat = { success: [10, 8, 20], error: [40, 20, 40], warning: [20, 15, 20] };
      navigator.vibrate(pat[type] || [15]);
    },
    selectionChanged() {
      if (navigator.vibrate) navigator.vibrate(5);
    },
  };

  // ──────────────────────────────────────────────
  //  Основной объект SDK
  // ──────────────────────────────────────────────
  window.MaxWebApp = {
    initData: 'mock_data',
    initDataUnsafe: {
      user: MOCK_USER,
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'mock_hash_000',
    },
    version: '7.0',
    platform: 'web',
    colorScheme: prefersDark ? 'dark' : 'light',
    themeParams: prefersDark ? THEME_DARK : THEME_LIGHT,
    isExpanded: false,
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,

    MainButton,
    BackButton,
    HapticFeedback,

    ready() {
      // Сигнал: SDK готов, можно рисовать UI
      document.dispatchEvent(new Event('sdk:ready'));
    },

    expand() {
      this.isExpanded = true;
      // В Telegram разворачивает шторку. В моке — ничего дополнительного.
    },

    close() {
      window.history.back();
    },

    showAlert(msg, cb) {
      // eslint-disable-next-line no-alert
      alert(msg);
      if (cb) cb();
    },

    showConfirm(msg, cb) {
      // eslint-disable-next-line no-alert
      const res = confirm(msg);
      if (cb) cb(res);
    },

    openLink(url) {
      window.open(url, '_blank');
    },

    setHeaderColor(color) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', color);
    },

    setBackgroundColor(color) {
      document.documentElement.style.background = color;
    },

    disableVerticalSwipes() {},
    enableClosingConfirmation() {},
    disableClosingConfirmation() {},
  };

  // Обновляем тему при изменении системных настроек
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    window.MaxWebApp.colorScheme = e.matches ? 'dark' : 'light';
    window.MaxWebApp.themeParams = e.matches ? THEME_DARK : THEME_LIGHT;
    document.dispatchEvent(new CustomEvent('sdk:themeChanged', { detail: { scheme: window.MaxWebApp.colorScheme } }));
  });

  // Обновляем viewportHeight при resize
  window.addEventListener('resize', () => {
    window.MaxWebApp.viewportHeight = window.innerHeight;
    window.MaxWebApp.viewportStableHeight = window.innerHeight;
  });

})();
