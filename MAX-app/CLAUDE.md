# CLAUDE.md — Документация проекта MAX Трекер Привычек

## Структура файлов

```
MAX-app/
├── index.html        — Точка входа. HTML-оболочка: все экраны как div-ы
├── app.css           — Все стили. CSS-переменные для тем, компоненты, анимации
├── MAX-web-app.js    — Мок MAX/Telegram SDK для локальной разработки
├── storage.js        — Работа с данными через localStorage
├── app.js            — Вся логика: экраны, навигация, события
└── CLAUDE.md         — Этот файл
```

---

## Что делает каждый файл

### index.html
Статическая HTML-оболочка. Содержит:
- `#screen-splash` — сплэш при запуске
- `#screen-onboarding` — онбординг (3 шага внутри)
- `#screen-app` — основное приложение с 3 вкладками + bottom nav
- `#screen-add-habit` — модальный экран добавить/редактировать привычку
- `#screen-habit-detail` — модальный экран деталей привычки
- `#overlay-done` — оверлей "Все выполнено" с конфетти
- `#overlay-context` — контекстное меню (bottom sheet)

Порядок загрузки скриптов строго: `MAX-web-app.js` → `storage.js` → `app.js`

### app.css
Все стили в одном файле. Разделы:
1. CSS-переменные (`:root` светлая, `[data-theme="dark"]` тёмная)
2. Сброс и базовые стили
3. Контейнер и экраны
4. Сплэш
5. Онбординг
6. Главный экран (today)
7. Bottom nav + FAB
8. Добавить привычку (форма)
9. Детали привычки + heatmap
10. Прогресс
11. Настройки
12. Контекстное меню
13. Конфетти-анимация
14. Утилиты

**Чтобы изменить цвета:** редактируй переменные в `:root` и `[data-theme="dark"]`
**Чтобы изменить акцент:** замени `#2AABEE` в `:root` → `--accent`
**Чтобы изменить радиус:** замени `--radius: 12px`

### MAX-web-app.js
Мок SDK для разработки вне MAX/Telegram. В реальном окружении файл не нужен —
`window.Telegram.WebApp` предоставляет тот же интерфейс.

Что эмулирует:
- `MaxWebApp.initDataUnsafe.user` — моковый пользователь "Алексей"
- `MaxWebApp.MainButton` — кнопка внизу экрана (DOM-элемент `#sdk-main-button`)
- `MaxWebApp.BackButton` — кнопка назад (события + Escape)
- `MaxWebApp.HapticFeedback` — вибрация через `navigator.vibrate()`
- `MaxWebApp.colorScheme` — `light`/`dark` из `prefers-color-scheme`
- `MaxWebApp.themeParams` — цвета темы

**Для production:** подключить настоящий SDK Telegram/MAX вместо этого файла.
**Моковый пользователь:** изменить `MOCK_USER` в начале файла.

### storage.js
Управление данными через localStorage. Ключи хранилища:
- `mxt_habits` — массив привычек
- `mxt_completions` — массив отметок выполнения
- `mxt_settings` — настройки пользователя
- `mxt_onboarding` — флаг завершения онбординга

Экспортирует:
- `Storage` — объект с методами (getHabits, saveHabit, toggleCompletion, getStreak, ...)
- `HABIT_TEMPLATES` — массив шаблонов привычек для онбординга
- `HABIT_COLORS` — палитра цветов для выбора
- `HABIT_ICONS` — набор иконок для выбора

**Чтобы добавить шаблон привычки:** добавить объект в `HABIT_TEMPLATES`
**Чтобы добавить цвет:** добавить hex в `HABIT_COLORS`
**Чтобы добавить иконку:** добавить эмодзи в `HABIT_ICONS`

**Для замены localStorage на API:** заменить методы Storage на fetch-вызовы.
Интерфейс методов менять не нужно — app.js использует только Storage.

### app.js
Вся логика приложения. Один объект `App` с методами:

| Метод | Что делает |
|-------|-----------|
| `App.showApp()` | Показывает основное приложение |
| `App.showOnboarding()` | Показывает онбординг |
| `App.openModal(id)` | Открывает модальный экран (слайд справа) |
| `App.closeModal()` | Закрывает модальный экран |
| `App.switchTab(name)` | Переключает вкладку (today/progress/settings) |
| `App.renderToday()` | Перерисовывает вкладку "Сегодня" |
| `App.toggleHabit(id)` | Отмечает/снимает выполнение привычки |
| `App.showAddHabit(id?)` | Открывает форму (id = редактирование, без id = создание) |
| `App.saveHabit()` | Сохраняет данные формы в Storage |
| `App.showHabitDetail(id)` | Открывает экран деталей привычки |
| `App.showDoneOverlay()` | Показывает "Все выполнено" с конфетти |
| `App.renderProgress()` | Отрисовывает вкладку прогресса |
| `App.renderSettings()` | Отрисовывает вкладку настроек |
| `App.showContextMenu(id)` | Показывает bottom sheet для привычки |
| `App.obNext(step)` | Следующий шаг онбординга |
| `App.obFinish()` | Завершает онбординг, создаёт привычки |

---

## Навигация между экранами

```
Сплэш (0.9с)
    │
    ├─ новый пользователь ──→ Онбординг (шаг 1 → 2 → 3) ──→ screen-app
    │
    └─ вернувшийся ─────────────────────────────────────────→ screen-app
                                                                   │
                                        ┌──────────────────────────┤
                                        │         Bottom Nav        │
                                  tab-today  tab-progress  tab-settings
                                        │
                          ┌─────────────┴──────────────┐
                          ↓                             ↓
                  screen-add-habit            screen-habit-detail
                  (слайд справа)              (слайд справа)
                          │                             │
                     BackButton                    BackButton
                     MainButton                   (edit → add)
                          │
                     saveHabit()
```

**Модальные экраны** (`.screen-modal`) открываются через `App.openModal(id)`.
Они накладываются поверх `screen-app` с CSS-трансформом `translateX(0)`.

**BackButton** SDK показывается при открытии модального экрана,
скрывается при закрытии. Обработчик: `App.handleBack()`.

---

## Где менять данные

### Шаблоны привычек (онбординг, шаг 2)
**Файл:** `storage.js`, массив `HABIT_TEMPLATES`
```js
{ name: 'Название', icon: '🏃', color: '#FF9500', section: 'morning' }
// section: 'morning' | 'evening' | 'any'
```

### Цвета привычек
**Файл:** `storage.js`, массив `HABIT_COLORS`

### Иконки привычек
**Файл:** `storage.js`, массив `HABIT_ICONS`

### Цвет акцента (#2AABEE)
**Файл:** `app.css`, переменная `--accent`

### Моковый пользователь
**Файл:** `MAX-web-app.js`, объект `MOCK_USER`

### Настройки по умолчанию
**Файл:** `storage.js`, объект `DEFAULT_SETTINGS`
(тема, время напоминаний, начало недели)

---

## Темизация

Тема применяется через атрибут `data-theme` на `<html>`.

```js
// Принудительно тёмная:
document.documentElement.setAttribute('data-theme', 'dark');

// Принудительно светлая:
document.documentElement.removeAttribute('data-theme');
```

В `app.js` за это отвечает функция `applyTheme(scheme)`.
Пользователь может выбрать в Настройках: Системная / Светлая / Тёмная.

---

## Добавление нового экрана (инструкция)

1. В `index.html` добавить `<div id="screen-new" class="screen-modal">...</div>`
2. В `app.css` добавить стили если нужны
3. В `app.js` добавить метод `App.showNew()`:
   ```js
   showNew() {
     // Наполнить содержимое
     document.getElementById('screen-new').querySelector('.content').innerHTML = '...';
     this.openModal('screen-new');
     // Настроить MainButton если нужна кнопка действия
     window.MaxWebApp.MainButton.setText('Сохранить').onClick(() => this.saveNew()).show();
   }
   ```

---

## Известные ограничения v1.0

- Данные хранятся в `localStorage` — не синхронизируются между устройствами
- Нет ретроактивной отметки (нельзя отметить привычку за вчера)
- Нет streak freeze (заморозки серии)
- Напоминания через бота не реализованы (только настройка времени)
- `prompt()` для выбора времени в настройках — нужен нативный time picker
- Нет quantity-привычек (только бинарные да/нет)

---

## Запуск для разработки

Достаточно открыть `index.html` в браузере — никаких сборщиков не нужно.

Для корректной работы с `viewport-fit=cover` и `safe-area-inset-*`
рекомендуется тестировать через mobile DevTools (iPhone simulation в Chrome).

Для тестирования тёмной темы: DevTools → Rendering → Emulate CSS prefers-color-scheme.
