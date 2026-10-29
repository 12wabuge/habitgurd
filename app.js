(() => {
  'use strict';

  const STORE = 'habitguard.local.v1';
  const app = document.querySelector('#app');
  const modalRoot = document.querySelector('#modal-root');
  const fresh = () => ({
    profile: { name: 'Your space', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local timezone', theme: 'light' },
    habits: [], logs: [], badHabits: [], urges: [], occurrences: [], goals: [], journals: [],
    prefs: { remindersEnabled: false, reminderTime: '20:00', quietStart: '22:00' }
  });
  let state;
  try { state = { ...fresh(), ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { state = fresh(); }
  for (const key of Object.keys(fresh())) if (!state[key]) state[key] = fresh()[key];

  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = () => dateKey(new Date());
  const parseDate = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (key, n) => { const date = parseDate(key); date.setDate(date.getDate() + n); return dateKey(date); };
  const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const fmtDate = key => parseDate(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const save = () => { localStorage.setItem(STORE, JSON.stringify(state)); document.querySelector('#profile-name').textContent = state.profile.name || 'Your space'; };
  const activeHabits = () => state.habits.filter(h => h.status === 'active');
  const activeBad = () => state.badHabits.filter(h => h.status !== 'archived');
  const logFor = (id, day) => state.logs.find(log => log.habitId === id && log.date === day);
  const isScheduled = (habit, day) => {
    if (day < habit.startDate || (habit.endDate && day > habit.endDate)) return false;
    const weekday = parseDate(day).getDay();
    if (habit.frequency === 'daily') return true;
    if (habit.frequency === 'week') return (habit.days || []).includes(weekday);
    if (habit.frequency === 'weekly') return weekday === 1;
    if (habit.frequency === 'monthly') return parseDate(day).getDate() === 1;
    return (habit.days || []).includes(weekday);
  };
  const streakFor = habit => {
    let cursor = today();
    if (!isScheduled(habit, cursor)) cursor = addDays(cursor, -1);
    if (isScheduled(habit, cursor) && logFor(habit.id, cursor)?.status !== 'completed') cursor = addDays(cursor, -1);
    let count = 0;
    for (let i = 0; i < 2000; i++) {
      if (!isScheduled(habit, cursor)) { cursor = addDays(cursor, -1); continue; }
      if (logFor(habit.id, cursor)?.status !== 'completed') break;
      count++;
      cursor = addDays(cursor, -1);
    }
    return count;
  };
  const longestFor = habit => {
    let count = 0, longest = 0;
    for (let day = habit.startDate; day <= today(); day = addDays(day, 1)) {
      if (!isScheduled(habit, day)) continue;
      if (logFor(habit.id, day)?.status === 'completed') { count++; longest = Math.max(longest, count); }
      else count = 0;
    }
    return longest;
  };
  const abstinenceDays = habit => {
    const events = state.occurrences.filter(event => event.badId === habit.id).sort((a, b) => a.at.localeCompare(b.at));
    const from = events.length ? dateKey(new Date(events.at(-1).at)) : habit.startDate;
    return Math.max(0, diffDays(from, today()));
  };
  const longestAbstinence = habit => {
    const events = state.occurrences.filter(event => event.badId === habit.id).map(event => dateKey(new Date(event.at))).sort();
    let longest = 0, previous = habit.startDate;
    for (const event of events) { longest = Math.max(longest, diffDays(previous, event)); previous = event; }
    return Math.max(longest, diffDays(previous, today()), 0);
  };
  const scheduledToday = () => activeHabits().filter(h => isScheduled(h, today()));
  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
  const iconFor = habit => habit.icon || '✳';
  const pageNames = { dashboard: 'Overview', habits: 'My habits', 'say-no': 'Say no', calendar: 'Calendar', analytics: 'Insights', goals: 'Goals', journal: 'Journal', settings: 'Settings' };
  let monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDay = today();
  let calendarFilter = 'all';
  let modalHandler = null;

  const pageHead = (eyebrow, title, sub, action = '') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${action}</div>`;
  const empty = (symbol, title, copy, button = '') => `<div class="empty-state"><div class="empty-symbol">${symbol}</div><h3>${title}</h3><p>${copy}</p>${button}</div>`;
  const frequencyLabel = habit => ({ daily: 'Daily', week: 'Selected days', weekly: 'Weekly', monthly: 'Monthly' }[habit.frequency] || 'Custom');
  const nextScheduled = habit => { for (let i = 1; i <= 8; i++) { const key = addDays(today(), i); if (isScheduled(habit, key)) return parseDate(key).toLocaleDateString(undefined, { weekday: 'short' }); } return 'not scheduled'; };

  function habitRow(habit) {
    const log = logFor(habit.id, today());
    return `<div class="habit-row"><div class="habit-icon">${esc(iconFor(habit))}</div><div class="habit-main"><strong>${esc(habit.name)}</strong><div class="habit-meta">${esc(habit.category || 'Personal')} · ${esc(habit.time || 'Any time')} · ${esc(frequencyLabel(habit))}${log?.note ? ` · ${esc(log.note)}` : ''}${log?.status === 'in-progress' ? ` · ${esc(log.actual)} / ${esc(habit.target)} ${esc(habit.unit)}` : ''}</div></div><div class="habit-trail"><span class="streak">${streakFor(habit)} day streak</span><button class="check-button ${log?.status === 'completed' ? 'done' : ''}" data-action="toggle-log" data-id="${habit.id}" title="${log?.status === 'completed' ? 'Undo completion' : 'Mark complete'}" aria-label="${log?.status === 'completed' ? 'Undo' : 'Complete'} ${esc(habit.name)}">${log?.status === 'completed' ? '✓' : '○'}</button><button class="quiet-button" data-action="skip-log" data-id="${habit.id}" aria-label="Skip ${esc(habit.name)}">Skip</button></div></div>`;
  }

  function renderDashboard() {
    const due = scheduledToday(), done = due.filter(h => logFor(h.id, today())?.status === 'completed').length;
    const pending = due.filter(h => !['completed', 'skipped'].includes(logFor(h.id, today())?.status)).length;
    const longest = Math.max(0, ...activeHabits().map(longestFor));
    const streak = Math.max(0, ...activeHabits().map(streakFor));
    const freeDays = activeBad().length ? Math.min(...activeBad().map(abstinenceDays)) : null;
    const hour = new Date().getHours(), greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const quote = ['Small steps still move you forward.', 'You can begin again without starting over.', 'Notice what worked. Carry that forward.', 'A steady pace is a strong pace.'][new Date().getDate() % 4];
    return `${pageHead('A PRACTICE, NOT A PERFORMANCE', `${greeting}, ${esc(state.profile.name || 'there')}.`, quote, `<span class="date-label">${esc(new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>`)}
      <div class="overview-grid"><div class="panel welcome-panel"><div class="welcome-copy"><div class="eyebrow">YOUR DAY, YOUR PACE</div><h2>A little progress<br>adds up.</h2><p>${due.length ? `${done} of ${due.length} scheduled habits complete today.` : 'Start with one small, meaningful practice.'}</p><a class="button button-primary button-small" href="#habits">${due.length ? 'View today’s habits' : 'Create a habit'} <span>→</span></a></div><div class="welcome-mark">${due.length ? `${pct(done, due.length)}%` : '✳'}<span>${due.length ? '' : '·'}</span></div></div>
      <div class="panel stats-panel"><div class="stat"><div class="stat-label">Scheduled today</div><div class="stat-value">${due.length}</div><div class="stat-sub">positive habits</div></div><div class="stat"><div class="stat-label">Completed</div><div class="stat-value">${done}</div><div class="stat-sub">${pending} still open</div></div><div class="stat"><div class="stat-label">Current streak</div><div class="stat-value">${streak}<small style="font:500 10px 'DM Sans';color:#858a82"> ${streak === 1 ? 'day' : 'days'}</small></div><div class="stat-sub">best: ${longest} ${longest === 1 ? 'day' : 'days'}</div></div><div class="stat"><div class="stat-label">Say-no tracking</div><div class="stat-value">${freeDays === null ? '—' : freeDays}</div><div class="stat-sub">days since occurrence</div></div></div></div>
      <div class="section-row"><h2>Today’s habits</h2><a class="text-link" href="#habits">All habits →</a></div>
      ${due.length ? `<div class="habit-list">${due.map(habitRow).join('')}</div>` : empty('◉', 'Make room for a good habit', 'Your day is yours to shape. Add a positive habit when you’re ready.', '<a class="button button-primary button-small" href="#habits">＋ Add a habit</a>')}
      <div class="dashboard-lower"><div class="panel compact-panel sayno-preview"><h3>Say no, with care</h3><p>${activeBad().length ? `${activeBad().length} pattern${activeBad().length === 1 ? '' : 's'} in your care. Urges are information, not failure.` : 'Track a pattern you’d like to change, without judgment.'}</p><div class="quick-links"><a class="button button-secondary" href="#say-no">Open Say no →</a>${activeBad().length ? `<span class="pill coral">${activeBad().reduce((sum, h) => sum + abstinenceDays(h), 0)} days since last log</span>` : ''}</div></div><div class="panel compact-panel"><h3>A note for today</h3><p>${quote} Your tracking is here to help you notice, not to judge.</p><div class="quick-links"><a class="button button-secondary" href="#journal">Write a reflection →</a><a class="button button-secondary" href="#calendar">See calendar</a></div></div></div>`;
  }

  function renderHabits() {
    const groups = { active: state.habits.filter(h => h.status === 'active'), paused: state.habits.filter(h => h.status === 'paused'), archived: state.habits.filter(h => h.status === 'archived') };
    const card = h => `<article class="panel habit-card"><div class="habit-card-top"><div style="display:flex;gap:11px"><div class="habit-icon">${esc(iconFor(h))}</div><div><h3>${esc(h.name)}</h3><div class="habit-meta">${esc(h.category || 'Personal')} · ${esc(frequencyLabel(h))}</div></div></div><span class="pill">${esc(h.priority || 'Steady')}</span></div><p>${esc(h.description || 'A practice you’re building, one session at a time.')}</p><div class="card-meta"><span class="pill">${isScheduled(h, today()) ? 'Today' : `Next: ${nextScheduled(h)}`}</span>${h.target ? `<span class="pill blue">${esc(h.target)} ${esc(h.unit || '')} target</span>` : ''}<span class="pill">${streakFor(h)} day streak</span></div><div class="card-footer"><span class="habit-meta">${esc(h.time || 'No reminder')}</span><div class="row-actions"><button class="quiet-button" data-action="edit-habit" data-id="${h.id}">Edit</button><button class="quiet-button" data-action="habit-status" data-status="${h.status === 'active' ? 'paused' : 'active'}" data-id="${h.id}">${h.status === 'active' ? 'Pause' : h.status === 'paused' ? 'Resume' : 'Restore'}</button><button class="quiet-button" data-action="archive-habit" data-id="${h.id}">${h.status === 'archived' ? 'Delete' : 'Archive'}</button></div></div></article>`;
    const section = (label, items) => items.length ? `<div class="section-row"><h2>${label} <span class="habit-meta">(${items.length})</span></h2></div><div class="two-col">${items.map(card).join('')}</div>` : '';
    return `${pageHead('BUILD WHAT MATTERS', 'My habits', 'Small, repeatable actions that fit your real life.', '<button class="button button-primary" data-action="new-habit">＋ New habit</button>')}${section('Active', groups.active)}${groups.active.length ? '' : empty('◉', 'Your next small step starts here', 'Create a habit that matters to you. Set a schedule, a target, and a reminder.', '<button class="button button-primary button-small" data-action="new-habit">＋ Create your first habit</button>')}${section('Paused', groups.paused)}${section('Archived', groups.archived)}`;
  }

  function renderSayNo() {
    const cards = activeBad().map(h => {
      const days = abstinenceDays(h), longest = longestAbstinence(h), events = state.occurrences.filter(e => e.badId === h.id).length;
      return `<article class="panel habit-card sayno-card"><div class="habit-card-top"><div><div class="eyebrow">${esc(h.category || 'PERSONAL PATTERN')}</div><h3>${esc(h.name)}</h3></div><span class="pill coral">${days} days</span></div><p>${esc(h.reason || h.description || 'Change can start with noticing the pattern.')}</p><div class="metric-grid" style="grid-template-columns:repeat(3,1fr);margin:4px 0 13px"><div><span class="habit-meta">Current</span><strong style="display:block;font:700 17px Manrope;margin-top:4px">${days}d</strong></div><div><span class="habit-meta">Longest</span><strong style="display:block;font:700 17px Manrope;margin-top:4px">${longest}d</strong></div><div><span class="habit-meta">Occurrences</span><strong style="display:block;font:700 17px Manrope;margin-top:4px">${events}</strong></div></div><div class="habit-meta">Started ${esc(h.startDate)} · ${h.triggers?.length ? `Triggers: ${h.triggers.map(esc).join(', ')}` : 'No triggers listed'}</div><div class="card-footer"><div class="inline-actions"><button class="button button-secondary button-small" data-action="urge" data-id="${h.id}">＋ Urge check-in</button><button class="button button-secondary button-small" data-action="resisted" data-id="${h.id}">I resisted</button><button class="button button-danger button-small" data-action="slip" data-id="${h.id}">I slipped</button></div><div class="row-actions"><button class="quiet-button" data-action="edit-bad" data-id="${h.id}">Plan</button><button class="quiet-button" data-action="bad-status" data-id="${h.id}">Archive</button></div></div></article>`;
    }).join('');
    const recent = [...state.urges.map(x => ({ ...x, kind: 'Urge' })), ...state.occurrences.map(x => ({ ...x, kind: 'Occurrence' }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
    return `${pageHead('NOTICE WITHOUT JUDGMENT', 'Say no', 'Changing a pattern is not a straight line. An urge is not a setback.', '<button class="button button-primary" data-action="new-bad">＋ Add a pattern</button>')}${activeBad().length ? `<div class="two-col">${cards}</div>` : empty('◎', 'A space for patterns you want to change', 'Add a pattern to begin tracking urges, resistance, and occurrences in a private, nonjudgmental way.', '<button class="button button-primary button-small" data-action="new-bad">＋ Add a pattern</button>')}<div class="section-row"><h2>Recent check-ins</h2><span class="habit-meta">Urges and occurrences are tracked separately.</span></div><div class="panel compact-panel">${recent.length ? `<div class="table-list">${recent.map(e => { const h = state.badHabits.find(x => x.id === e.badId);return `<div class="list-row"><div><strong>${esc(h?.name || 'Archived pattern')}</strong><small>${new Date(e.at).toLocaleString()} · ${e.kind}${e.kind === 'Urge' ? ` · intensity ${e.intensity}/10` : ''}</small></div><div class="row-actions"><span class="pill ${e.kind === 'Occurrence' ? 'coral' : 'blue'}">${e.kind}</span>${e.kind === 'Occurrence' ? `<button class="quiet-button" data-action="edit-occurrence" data-id="${e.id}">Edit</button><button class="quiet-button" data-action="delete-occurrence" data-id="${e.id}">Delete</button>` : ''}</div></div>`;}).join('')}</div>` : '<div class="empty-inline">No check-ins recorded yet. An urge can be logged without counting as an occurrence.</div>'}</div>`;
  }

  function renderCalendar() {
    const year = monthCursor.getFullYear(), month = monthCursor.getMonth(), first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay());
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return dateKey(d); });
    const opts = activeHabits().map(h => `<option value="${h.id}" ${calendarFilter === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
    const cells = days.map(key => {
      const d = parseDate(key), logs = state.logs.filter(l => l.date === key && l.status === 'completed' && (calendarFilter === 'all' || l.habitId === calendarFilter));
      const occurrences = state.occurrences.filter(e => dateKey(new Date(e.at)) === key), urges = state.urges.filter(e => dateKey(new Date(e.at)) === key);
      const scheduled = activeHabits().filter(h => (calendarFilter === 'all' || h.id === calendarFilter) && isScheduled(h, key));
      const incomplete = scheduled.filter(h => !['completed', 'skipped'].includes(logFor(h.id, key)?.status));
      const markers = `${logs.map(() => '<i class="marker" title="Habit completed"></i>').join('')}${occurrences.map(() => '<i class="marker bad" title="Recorded occurrence"></i>').join('')}${urges.map(() => '<i class="marker urge" title="Urge check-in"></i>').join('')}${incomplete.length ? '<i class="marker" style="background:#e2e0d7" title="Scheduled, not completed"></i>' : ''}`;
      return `<button class="calendar-day ${d.getMonth() === month ? '' : 'outside'} ${key === today() ? 'today' : ''} ${key === selectedDay ? 'selected' : ''}" data-action="select-day" data-day="${key}" aria-label="${fmtDate(key)}: ${logs.length} completed, ${incomplete.length} pending, ${occurrences.length} occurrences, ${urges.length} urges"><span class="day-num">${d.getDate()}</span><div class="day-markers">${markers}</div></button>`;
    }).join('');
    const dayLogs = state.logs.filter(l => l.date === selectedDay && (calendarFilter === 'all' || l.habitId === calendarFilter));
    const dayOcc = state.occurrences.filter(e => dateKey(new Date(e.at)) === selectedDay), dayUrges = state.urges.filter(e => dateKey(new Date(e.at)) === selectedDay);
    const scheduled = activeHabits().filter(h => (calendarFilter === 'all' || h.id === calendarFilter) && isScheduled(h, selectedDay));
    const records = [...dayLogs.map(log => ({ type: log.status === 'completed' ? 'Completed' : log.status === 'skipped' ? 'Skipped' : 'In progress', name: state.habits.find(h => h.id === log.habitId)?.name || 'Habit' })), ...dayOcc.map(e => ({ type: 'Occurrence', name: state.badHabits.find(h => h.id === e.badId)?.name || 'Pattern' })), ...dayUrges.map(e => ({ type: 'Urge', name: state.badHabits.find(h => h.id === e.badId)?.name || 'Pattern' }))];
    return `${pageHead('SEE THE WHOLE PICTURE', 'Habit calendar', 'A blank day means untracked, not unsuccessful.', `<div class="filters"><select class="field-control" id="calendar-filter"><option value="all">All habits</option>${opts}</select><button class="button button-secondary" data-action="month-prev" aria-label="Previous month">←</button><span class="date-label">${monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><button class="button button-secondary" data-action="month-next" aria-label="Next month">→</button></div>`)}<div class="calendar-legend"><span><i class="legend-dot"></i>Habit completed</span><span><i class="legend-dot yellow"></i>Urge check-in</span><span><i class="legend-dot red"></i>Occurrence</span><span>○ Scheduled / untracked</span></div><div class="panel calendar-wrap"><div class="calendar"><div class="calendar-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div><div class="day-detail"><h3>${fmtDate(selectedDay)}</h3>${records.length ? `<div class="table-list">${records.map(r => `<div class="list-row"><strong>${esc(r.name)}</strong><span class="pill ${r.type === 'Occurrence' ? 'coral' : r.type === 'Urge' ? 'blue' : ''}">${r.type}</span></div>`).join('')}</div>` : `<p>${scheduled.length ? `${scheduled.length} habit${scheduled.length === 1 ? '' : 's'} scheduled. No activity recorded.` : 'No habits scheduled.'} This date is not counted as a confirmed success.</p>`}</div></div>`;
  }

  function renderAnalytics() {
    const range = Number(document.querySelector('#analytics-range')?.value || 14);
    const keys = Array.from({ length: range }, (_, i) => addDays(today(), i - range + 1)), habits = activeHabits();
    const scheduled = keys.flatMap(day => habits.filter(h => isScheduled(h, day)).map(h => ({ h, day })));
    const complete = scheduled.filter(item => logFor(item.h.id, item.day)?.status === 'completed').length;
    const loggedDays = new Set(state.logs.map(log => log.date)).size;
    const bars = keys.map(day => { const due = habits.filter(h => isScheduled(h, day)), done = due.filter(h => logFor(h.id, day)?.status === 'completed').length; return { day, value: pct(done, due.length), count: due.length, label: parseDate(day).toLocaleDateString(undefined, { weekday: 'narrow', day: 'numeric' }) }; });
    const maxOccurrences = Math.max(1, ...keys.map(day => state.occurrences.filter(e => dateKey(new Date(e.at)) === day).length));
    const periodUrges = state.urges.filter(e => keys.includes(dateKey(new Date(e.at))));
    const triggers = {}; periodUrges.forEach(e => { const key = e.trigger || 'Unspecified'; triggers[key] = (triggers[key] || 0) + 1; });
    return `${pageHead('REAL DATA, CLEAR DEFINITIONS', 'Insights', 'Completion = completed scheduled habit sessions ÷ scheduled sessions.', `<div class="filters"><select class="field-control" id="analytics-range"><option value="7" ${range === 7 ? 'selected' : ''}>Last 7 days</option><option value="14" ${range === 14 ? 'selected' : ''}>Last 14 days</option><option value="30" ${range === 30 ? 'selected' : ''}>Last 30 days</option></select><button class="button button-secondary" data-action="export-csv">↓ Export CSV</button><button class="button button-secondary" data-action="print">Print</button></div>`)}
      <div class="metric-grid"><div class="panel metric-card"><span>Scheduled completion</span><strong>${scheduled.length ? `${pct(complete, scheduled.length)}%` : '—'}</strong></div><div class="panel metric-card"><span>Sessions completed</span><strong>${complete}<small style="font:500 10px 'DM Sans';color:#92968e"> / ${scheduled.length}</small></strong></div><div class="panel metric-card"><span>Tracking days</span><strong>${loggedDays}</strong></div></div>
      <div class="panel chart-panel"><h3>Daily completion</h3><p>Scheduled sessions only. Unscheduled and untracked dates are excluded.</p>${scheduled.length ? `<div class="bars">${bars.map(b => `<div class="bar-col" title="${b.day}: ${b.count ? `${b.value}%` : 'No scheduled habits'}"><span class="bar-value">${b.count ? `${b.value}%` : '·'}</span><div class="bar" style="height:${b.count ? Math.max(3, b.value) : 2}%"></div><span class="bar-label">${b.label}</span></div>`).join('')}</div>` : empty('⌁', 'Not enough data yet', 'Add a scheduled habit and record a few sessions to see a trend.')}</div>
      <div class="two-col"><div class="panel chart-panel"><h3>Habit consistency</h3><p>Completed ÷ scheduled sessions over this period.</p>${habits.length ? `<div class="table-list">${habits.map(h => { const total = keys.filter(day => isScheduled(h, day)).length, done = keys.filter(day => isScheduled(h, day) && logFor(h.id, day)?.status === 'completed').length; return `<div class="list-row"><div><strong>${esc(h.name)}</strong><small>${done} of ${total} scheduled</small></div><span class="pill">${total ? `${pct(done, total)}%` : 'No sessions'}</span></div>`; }).join('')}</div>` : '<div class="empty-inline">No habits to compare yet.</div>'}</div><div class="panel chart-panel"><h3>Say-no occurrences</h3><p>Confirmed occurrences per day. Urges do not count as occurrences.</p>${state.badHabits.length ? `<div class="bars">${keys.map(day => { const n = state.occurrences.filter(e => dateKey(new Date(e.at)) === day).length; return `<div class="bar-col" title="${day}: ${n} occurrence(s)"><span class="bar-value">${n || '·'}</span><div class="bar bad-bar" style="height:${n ? Math.max(4, n / maxOccurrences * 100) : 2}%"></div><span class="bar-label">${parseDate(day).toLocaleDateString(undefined, { weekday: 'narrow', day: 'numeric' })}</span></div>`; }).join('')}</div>` : '<div class="empty-inline">Add a pattern to start tracking.</div>'}</div></div>
      <div class="panel chart-panel" style="margin-top:14px"><h3>Urge check-ins & triggers</h3><p>${periodUrges.length ? `${periodUrges.length} urge check-ins in this period. Patterns are descriptive, not proof of cause.` : 'No urge check-ins in this period yet.'}</p>${Object.entries(triggers).sort((a, b) => b[1] - a[1]).map(([trigger, n]) => `<div class="list-row"><strong>${esc(trigger)}</strong><span class="pill blue">${n} check-in${n === 1 ? '' : 's'}</span></div>`).join('')}</div>`;
  }

  function renderGoals() {
    const cards = state.goals.map(g => { const progress = Math.min(100, pct(g.current || 0, g.target)); return `<article class="panel goal-card"><div class="habit-card-top"><div><h3 style="font:700 13px Manrope;margin:0">${esc(g.title)}</h3><p class="habit-meta" style="margin:5px 0">${esc(g.description || 'A goal you chose for yourself.')}</p></div><span class="pill blue">${esc(g.period || 'Custom')}</span></div><div class="progress-track"><div class="progress-fill blue-fill" style="width:${progress}%"></div></div><div class="goal-progress"><span>${g.current || 0} of ${g.target} ${esc(g.unit || 'sessions')}</span><span>${progress}%${g.targetDate ? ` · due ${esc(g.targetDate)}` : ''}</span></div><div class="card-footer"><span class="habit-meta">${progress >= 100 ? 'Target reached' : 'In progress'}</span><div class="row-actions"><button class="quiet-button" data-action="goal-progress" data-id="${g.id}">＋ Add progress</button><button class="quiet-button" data-action="edit-goal" data-id="${g.id}">Edit</button><button class="quiet-button" data-action="delete-goal" data-id="${g.id}">Delete</button></div></div></article>`; }).join('');
    const completions = state.logs.filter(l => l.status === 'completed').length, resistances = state.urges.filter(e => e.resisted).length;
    const badges = [[completions >= 1, 'First practice', 'First positive habit session'], [completions >= 30, 'Showing up', '30 completed sessions'], [resistances >= 1, 'Pause & choose', 'First recorded urge resistance'], [Math.max(0, ...activeHabits().map(longestFor)) >= 7, 'A week of practice', 'Seven-day positive streak'], [Math.max(0, ...activeBad().map(longestAbstinence)) >= 7, 'A week of space', 'Seven days without a recorded occurrence']].filter(x => x[0]);
    return `${pageHead('AIM FOR WHAT MATTERS', 'Goals', 'Set goals that support your life, not pressure it.', '<button class="button button-primary" data-action="new-goal">＋ New goal</button>')}${cards ? `<div class="two-col">${cards}</div>` : empty('↗', 'Choose a direction, not a deadline', 'Create a simple goal and update progress when it feels useful.', '<button class="button button-primary button-small" data-action="new-goal">＋ Create a goal</button>')}<div class="section-row"><h2>Milestones</h2></div><div class="panel compact-panel">${badges.length ? `<div class="quick-links">${badges.map(b => `<span class="pill">✳ ${b[1]} · ${b[2]}</span>`).join('')}</div>` : '<div class="empty-inline">Milestones appear here when earned through saved tracking records.</div>'}</div>`;
  }

  function renderJournal() {
    const query = document.querySelector('#journal-search')?.value?.trim().toLowerCase() || '';
    const entries = state.journals.filter(j => !query || `${j.reflection} ${j.gratitude} ${j.priority} ${j.date}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
    return `${pageHead('MAKE SPACE TO NOTICE', 'Daily journal', 'Private reflections, saved in this browser.', '<button class="button button-primary" data-action="new-journal">＋ Write today</button>')}<div style="margin-bottom:13px"><input class="field-control" id="journal-search" placeholder="Search your reflections…" value="${esc(query)}" aria-label="Search journal"></div>${entries.length ? entries.map(j => `<article class="panel journal-entry"><div class="habit-card-top"><div><h3>${fmtDate(j.date)}</h3><small>${j.mood ? `Mood: ${esc(j.mood)} · ` : ''}${j.gratitude ? `Grateful for: ${esc(j.gratitude)}` : ''}</small></div><div class="row-actions"><button class="quiet-button" data-action="edit-journal" data-id="${j.id}">Edit</button><button class="quiet-button" data-action="delete-journal" data-id="${j.id}">Delete</button></div></div>${j.reflection ? `<p>${esc(j.reflection)}</p>` : ''}${j.priority ? `<small>Tomorrow: ${esc(j.priority)}</small>` : ''}</article>`).join('') : empty('▤', query ? 'No matching entries' : 'A few lines can be enough', 'Capture what went well, what was difficult, and one thing you learned.', '<button class="button button-primary button-small" data-action="new-journal">＋ Write a reflection</button>')}`;
  }

  function renderSettings() {
    return `${pageHead('YOUR PREFERENCES', 'Settings', 'Manage this local workspace and your data.')}<div class="panel settings-section"><h2>More pages</h2><p>Explore your progress and reflections.</p><div class="quick-links"><a class="button button-secondary" href="#analytics">⌁ Insights</a><a class="button button-secondary" href="#goals">↗ Goals</a><a class="button button-secondary" href="#journal">▤ Journal</a><a class="button button-secondary" href="#calendar">▦ Calendar</a></div></div><div class="panel settings-section"><h2>Profile</h2><p>These preferences stay in this browser.</p><form id="settings-form"><div class="form-grid"><div class="form-field"><label for="display-name">Display name</label><input id="display-name" name="name" value="${esc(state.profile.name)}" maxlength="60"></div><div class="form-field"><label for="timezone">Timezone</label><input id="timezone" name="timezone" value="${esc(state.profile.timezone)}"></div><div class="form-field"><label for="theme-select">Theme</label><select id="theme-select" name="theme"><option value="light" ${state.profile.theme !== 'dark' ? 'selected' : ''}>Light</option><option value="dark" ${state.profile.theme === 'dark' ? 'selected' : ''}>Dark</option></select></div><div class="form-field"><label>Language</label><input value="Browser default" disabled></div></div><div class="modal-actions"><button class="button button-primary" type="submit">Save profile</button></div></form></div>
      <div class="panel settings-section"><h2>Reminders</h2><p>Preferences can be saved here. Browser notifications and background scheduling are not configured in this local demo.</p><form id="reminder-form"><div class="settings-row"><div><strong>Daily review reminder</strong><small>Saved preference only; no notification will be sent.</small></div><input type="checkbox" name="enabled" ${state.prefs.remindersEnabled ? 'checked' : ''} aria-label="Enable reminder preference"></div><div class="form-grid"><div class="form-field"><label for="reminder-time">Reminder time</label><input id="reminder-time" type="time" name="time" value="${esc(state.prefs.reminderTime)}"></div><div class="form-field"><label for="quiet-hours">Quiet hours start</label><input id="quiet-hours" type="time" name="quietStart" value="${esc(state.prefs.quietStart)}"></div></div><div class="modal-actions"><button class="button button-secondary" type="submit">Save reminder preferences</button></div></form></div>
      <div class="panel settings-section"><h2>Data & privacy</h2><p>Local demo data is stored in this browser’s local storage. It is not synced or backed up. Avoid using a shared device for sensitive journal entries.</p><div class="quick-links"><button class="button button-secondary" data-action="export-json">↓ Export all data (JSON)</button><button class="button button-secondary" data-action="export-csv">↓ Export tracking (CSV)</button><button class="button button-danger" data-action="clear-data">Delete local data</button></div></div>
      <div class="panel settings-section"><h2>Connect a secure backend</h2><p>Supabase Auth, database synchronization, account deletion, and RLS policies are prepared as setup work but are not connected in this browser app. See README.md and supabase/migrations/001_initial_schema.sql. Never place a service-role key in browser code.</p><span class="pill coral">Backend not connected · changes stay on this device</span></div>`;
  }

  function render() {
    let route = location.hash.slice(1) || 'dashboard';
    if (!pageNames[route]) route = 'dashboard';
    document.querySelector('#page-crumb').textContent = pageNames[route];
    document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
    document.body.classList.toggle('dark', state.profile.theme === 'dark');
    const views = { dashboard: renderDashboard, habits: renderHabits, 'say-no': renderSayNo, calendar: renderCalendar, analytics: renderAnalytics, goals: renderGoals, journal: renderJournal, settings: renderSettings };
    app.innerHTML = views[route]();
  }

  function toast(message) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
    document.querySelector('#toast-region').append(el); setTimeout(() => el.remove(), 2800);
  }
  function closeModal() { modalRoot.innerHTML = ''; modalHandler = null; }
  function showModal(title, subtitle, body) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${title}</h2><p>${subtitle || ''}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">×</button></div>${body}<div class="modal-actions"><button class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary" data-action="modal-submit">Save</button></div></section></div>`;
    modalRoot.querySelector('input,select,textarea,button')?.focus();
  }
  const field = (label, name, value = '', type = 'text', options = {}) => `<div class="form-field ${options.full ? 'full' : ''}"><label for="f-${name}">${label}</label>${options.select ? `<select id="f-${name}" name="${name}">${options.select.map(([v, text]) => `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>` : type === 'textarea' ? `<textarea id="f-${name}" name="${name}" ${options.required ? 'required' : ''} maxlength="${options.max || 1000}">${esc(value)}</textarea>` : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${options.required ? 'required' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} ${options.step ? `step="${options.step}"` : ''} maxlength="${options.maxlength || ''}>`}${options.help ? `<span class="form-help">${options.help}</span>` : ''}</div>`;
  function formModal(title, subtitle, fields, handler, label = 'Save') {
    modalHandler = handler; showModal(title, subtitle, `<form id="modal-form" class="form-grid">${fields}</form>`);
    modalRoot.querySelector('[data-action="modal-submit"]').textContent = label;
  }

  function habitForm(habit = {}) {
    const selectedDays = habit.days || [0, 1, 2, 3, 4, 5, 6];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => `<label><input type="checkbox" name="days" value="${i}" ${selectedDays.includes(i) ? 'checked' : ''}>${day}</label>`).join('');
    formModal(habit.id ? 'Edit habit' : 'Create a habit', 'Build around a schedule that works for you.',
      `${field('Habit name', 'name', habit.name || '', 'text', { required: true, maxlength: 80 })}${field('Category', 'category', habit.category || 'Personal')}${field('Icon (emoji or symbol)', 'icon', habit.icon || '✳', 'text', { maxlength: 8 })}${field('Priority', 'priority', habit.priority || 'Steady')}${field('Description or personal reason', 'description', habit.description || '', 'textarea', { full: true, max: 500 })}${field('Frequency', 'frequency', habit.frequency || 'daily', 'text', { select: [['daily', 'Every day'], ['week', 'Selected weekdays'], ['weekly', 'Once a week (Monday)'], ['monthly', 'Once a month (1st)']] })}${field('Reminder time (optional)', 'time', habit.time || '', 'time')}<div class="form-field full"><label>Weekdays (for selected weekdays)</label><div class="checkbox-row">${days}</div></div>${field('Target (optional)', 'target', habit.target || '', 'number', { min: 0, step: 'any' })}${field('Target unit', 'unit', habit.unit || 'sessions')}${field('Start date', 'startDate', habit.startDate || today(), 'date', { required: true })}${field('End date (optional)', 'endDate', habit.endDate || '', 'date')}`,
      data => {
        const previous = state.habits.find(x => x.id === habit.id);
        if (data.target && Number(data.target) <= 0) throw new Error('Target must be greater than zero.');
        const next = { ...previous, ...data, id: habit.id || uid(), days: data.days.length ? data.days : [0, 1, 2, 3, 4, 5, 6], status: previous?.status || 'active' };
        if (next.endDate && next.endDate < next.startDate) throw new Error('End date must be on or after the start date.');
        next.target = next.target ? Number(next.target) : '';
        state.habits = previous ? state.habits.map(x => x.id === habit.id ? next : x) : [...state.habits, next];
        save(); closeModal(); render(); toast(previous ? 'Habit updated.' : 'Habit created.');
      }, habit.id ? 'Save changes' : 'Create habit');
  }

  function badForm(habit = {}) {
    formModal(habit.id ? 'Edit your plan' : 'Add a pattern', 'You choose what to track and what support would help.',
      `${field('Pattern name', 'name', habit.name || '', 'text', { required: true, maxlength: 80 })}${field('Category', 'category', habit.category || 'Personal')}${field('Tracking begins', 'startDate', habit.startDate || today(), 'date', { required: true })}${field('Personal reason', 'reason', habit.reason || '', 'textarea', { full: true, max: 350 })}${field('Common triggers (comma-separated)', 'triggers', (habit.triggers || []).join(', '), 'text', { full: true })}${field('Prevention or recovery plan', 'plan', habit.plan || '', 'textarea', { full: true, max: 700, help: 'A practical next step, support person, or environmental change.' })}`,
      data => {
        const previous = state.badHabits.find(x => x.id === habit.id), next = { ...previous, ...data, id: habit.id || uid(), triggers: data.triggers.split(',').map(x => x.trim()).filter(Boolean), status: previous?.status || 'active' };
        state.badHabits = previous ? state.badHabits.map(x => x.id === habit.id ? next : x) : [...state.badHabits, next];
        save(); closeModal(); render(); toast(previous ? 'Plan updated.' : 'Pattern added.');
      }, habit.id ? 'Save plan' : 'Add pattern');
  }

  function urgeForm(id, resisted = false) {
    const triggers = ['Stress', 'Boredom', 'Fatigue', 'Loneliness', 'Social pressure', 'Environmental cues', 'Easy access', 'Emotional distress', 'Unstructured time', 'Other'];
    formModal(resisted ? 'Record resistance' : 'Urge check-in', 'An urge is a moment to notice, not a failure.',
      `${field('Intensity (1–10)', 'intensity', '5', 'number', { required: true, min: 1, max: 10 })}${field('Trigger', 'trigger', '', 'text', { select: [['', 'Choose if known'], ...triggers.map(x => [x, x])] })}${field('What were you feeling?', 'mood')}${field('Where were you?', 'where')}${field('What helped?', 'coping')}${field('Optional notes', 'notes', '', 'textarea', { full: true, max: 500 })}`,
      data => {
        state.urges.push({ id: uid(), badId: id, at: new Date().toISOString(), intensity: Number(data.intensity), trigger: data.trigger, mood: data.mood, where: data.where, resisted, coping: data.coping, notes: data.notes });
        save(); closeModal(); render(); toast(resisted ? 'Resistance saved.' : 'Urge saved; no occurrence recorded.');
      }, resisted ? 'Save check-in' : 'Save urge');
  }

  function slipForm(id, event = {}) {
    const triggers = ['Stress', 'Boredom', 'Fatigue', 'Loneliness', 'Social pressure', 'Environmental cues', 'Easy access', 'Emotional distress', 'Unstructured time', 'Other'];
    const localDateTime = event.at ? new Date(new Date(event.at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    formModal(event.id ? 'Correct occurrence' : 'Log an occurrence', 'This record helps you understand the pattern. It does not erase your progress.',
      `${field('Date and time', 'at', localDateTime, 'datetime-local', { required: true })}${field('Trigger', 'trigger', event.trigger || '', 'text', { select: [['', 'Choose if known'], ...triggers.map(x => [x, x])] })}${field('What was happening?', 'context', event.context || '', 'textarea', { full: true, max: 300 })}${field('Optional note', 'notes', event.notes || '', 'textarea', { full: true, max: 300 })}`,
      data => {
        const record = { id: event.id || uid(), badId: id, at: new Date(data.at).toISOString(), trigger: data.trigger, context: data.context, notes: data.notes };
        state.occurrences = event.id ? state.occurrences.map(x => x.id === event.id ? record : x) : [...state.occurrences, record];
        save(); closeModal(); render();
        if (!event.id) {
          const recovery = document.createElement('div'); recovery.className = 'panel recovery';
          recovery.innerHTML = `<h3>A setback is information, not your identity.</h3><p>${data.trigger ? `You noted ${esc(data.trigger)} as a trigger. ` : ''}Take a breath, identify one practical adjustment for next time, and continue at your own pace.</p><div class="quick-links"><button class="button button-secondary button-small" data-action="edit-bad" data-id="${id}">Update my plan</button><button class="button button-primary button-small" data-action="close-recovery">Continue tracking</button></div>`;
          app.prepend(recovery); recovery.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Occurrence recorded. Your previous progress remains part of your history.');
        } else toast('Occurrence corrected; streaks and reports have been recalculated.');
      }, event.id ? 'Save correction' : 'Save and continue');
  }

  function goalForm(goal = {}) {
    formModal(goal.id ? 'Edit goal' : 'Create a goal', 'Choose a target that feels useful to you.',
      `${field('Goal title', 'title', goal.title || '', 'text', { required: true, maxlength: 100 })}${field('Period', 'period', goal.period || 'Monthly', 'text', { select: [['Daily', 'Daily'], ['Weekly', 'Weekly'], ['Monthly', 'Monthly'], ['Custom', 'Custom']] })}${field('Description', 'description', goal.description || '', 'textarea', { full: true, max: 400 })}${field('Target value', 'target', goal.target || 1, 'number', { required: true, min: 1 })}${field('Unit', 'unit', goal.unit || 'sessions')}${field('Current progress', 'current', goal.current || 0, 'number', { min: 0 })}${field('Target date (optional)', 'targetDate', goal.targetDate || '', 'date')}`,
      data => {
        const previous = state.goals.find(x => x.id === goal.id), item = { ...previous, ...data, id: goal.id || uid(), target: Number(data.target), current: Number(data.current || 0), status: Number(data.current) >= Number(data.target) ? 'complete' : 'active' };
        state.goals = previous ? state.goals.map(x => x.id === goal.id ? item : x) : [...state.goals, item];
        save(); closeModal(); render(); toast(previous ? 'Goal updated.' : 'Goal created.');
      });
  }

  function journalForm(entry = {}) {
    formModal(entry.id ? 'Edit reflection' : 'Daily reflection', 'A few honest lines are enough.',
      `${field('Date', 'date', entry.date || today(), 'date', { required: true })}${field('Mood (optional)', 'mood', entry.mood || '', 'text', { select: [['', 'Choose later'], ['Calm', 'Calm'], ['Good', 'Good'], ['Mixed', 'Mixed'], ['Low', 'Low'], ['Energized', 'Energized']] })}${field('What went well? What did you learn?', 'reflection', entry.reflection || '', 'textarea', { full: true, max: 2000 })}${field('Grateful for (optional)', 'gratitude', entry.gratitude || '', 'textarea', { full: true, max: 400 })}${field('One priority for tomorrow', 'priority', entry.priority || '', 'text', { full: true, maxlength: 180 })}`,
      data => {
        const previous = state.journals.find(x => x.id === entry.id), item = { ...previous, ...data, id: entry.id || uid() };
        state.journals = previous ? state.journals.map(x => x.id === entry.id ? item : x) : [...state.journals, item];
        save(); closeModal(); render(); toast(previous ? 'Reflection updated.' : 'Reflection saved.');
      });
  }

  function goalProgress(id) {
    const goal = state.goals.find(x => x.id === id); if (!goal) return;
    formModal('Add progress', goal.title, field('Amount to add', 'amount', 1, 'number', { required: true, min: 1 }), data => {
      goal.current = Number(goal.current || 0) + Number(data.amount); goal.status = goal.current >= goal.target ? 'complete' : 'active';
      save(); closeModal(); render(); toast('Goal progress updated.');
    }, 'Add progress');
  }

  function download(name, content, type) {
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([content], { type })); anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href);
  }
  function exportCSV() {
    const rows = [['record_type', 'date', 'record_name', 'status_or_trigger', 'value', 'notes']];
    state.logs.forEach(l => rows.push(['habit', l.date, state.habits.find(h => h.id === l.habitId)?.name || '', l.status, l.actual || '', l.note || '']));
    state.urges.forEach(e => rows.push(['urge', e.at, state.badHabits.find(h => h.id === e.badId)?.name || '', e.trigger || '', e.intensity, e.notes || '']));
    state.occurrences.forEach(e => rows.push(['occurrence', e.at, state.badHabits.find(h => h.id === e.badId)?.name || '', e.trigger || '', '', e.notes || '']));
    download('habitguard-tracking.csv', rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n'), 'text/csv'); toast('Tracking CSV exported.');
  }

  function action(name, id, element) {
    const habit = state.habits.find(x => x.id === id), bad = state.badHabits.find(x => x.id === id);
    switch (name) {
      case 'new-habit': habitForm(); break;
      case 'edit-habit': habitForm(habit); break;
      case 'habit-status': if (habit) { habit.status = element.dataset.status; save(); render(); toast(`Habit ${habit.status}.`); } break;
      case 'archive-habit':
        if (habit?.status === 'archived') { if (confirm('Permanently delete this habit and its history?')) { state.habits = state.habits.filter(x => x.id !== id); state.logs = state.logs.filter(x => x.habitId !== id); save(); render(); toast('Habit and logs deleted.'); } }
        else if (habit && confirm('Archive this habit? Its history will be kept.')) { habit.status = 'archived'; save(); render(); toast('Habit archived.'); }
        break;
      case 'toggle-log': {
        const existing = logFor(id, today());
        if (existing?.status === 'completed') { existing.status = 'pending'; existing.actual = ''; save(); render(); toast('Completion undone.'); break; }
        if (habit?.target) {
          formModal('Record your progress', habit.name, `${field(`Actual progress (${habit.unit || 'units'})`, 'actual', '', 'number', { required: true, min: 0, step: 'any' })}${field('Note (optional)', 'note')}`,
            data => { const actual = Number(data.actual); state.logs = state.logs.filter(x => !(x.habitId === id && x.date === today())); state.logs.push({ id: uid(), habitId: id, date: today(), status: actual >= Number(habit.target) ? 'completed' : 'in-progress', actual, note: data.note, completedAt: actual >= Number(habit.target) ? new Date().toISOString() : null }); save(); closeModal(); render(); toast(actual >= Number(habit.target) ? 'Habit completed.' : `Progress saved (${actual}/${habit.target} ${habit.unit || ''}).`); });
        } else {
          const note = prompt('Optional note for this session:', ''); state.logs = state.logs.filter(x => !(x.habitId === id && x.date === today()));
          state.logs.push({ id: uid(), habitId: id, date: today(), status: 'completed', note: note || '', completedAt: new Date().toISOString() }); save(); render(); toast('Habit completed.');
        }
        break;
      }
      case 'skip-log': {
        const reason = prompt('Optional reason for skipping:', ''); if (reason === null) break;
        state.logs = state.logs.filter(x => !(x.habitId === id && x.date === today())); state.logs.push({ id: uid(), habitId: id, date: today(), status: 'skipped', note: reason }); save(); render(); toast('Skip recorded; it does not count as completed.'); break;
      }
      case 'new-bad': badForm(); break;
      case 'edit-bad': badForm(bad); break;
      case 'bad-status': if (bad) { bad.status = 'archived'; save(); render(); toast('Pattern archived.'); } break;
      case 'urge': urgeForm(id); break;
      case 'resisted': urgeForm(id, true); break;
      case 'slip': slipForm(id); break;
      case 'edit-occurrence': { const event = state.occurrences.find(x => x.id === id); if (event) slipForm(event.badId, event); break; }
      case 'delete-occurrence': if (confirm('Delete this occurrence record? Streaks and reports will be recalculated.')) { state.occurrences = state.occurrences.filter(x => x.id !== id); save(); render(); toast('Occurrence deleted; tracking recalculated.'); } break;
      case 'new-goal': goalForm(); break;
      case 'edit-goal': goalForm(state.goals.find(x => x.id === id)); break;
      case 'goal-progress': goalProgress(id); break;
      case 'delete-goal': if (confirm('Delete this goal?')) { state.goals = state.goals.filter(x => x.id !== id); save(); render(); toast('Goal deleted.'); } break;
      case 'new-journal': journalForm(); break;
      case 'edit-journal': journalForm(state.journals.find(x => x.id === id)); break;
      case 'delete-journal': if (confirm('Delete this journal entry?')) { state.journals = state.journals.filter(x => x.id !== id); save(); render(); toast('Entry deleted.'); } break;
      case 'select-day': selectedDay = element.dataset.day; render(); break;
      case 'month-prev': monthCursor.setMonth(monthCursor.getMonth() - 1); render(); break;
      case 'month-next': monthCursor.setMonth(monthCursor.getMonth() + 1); render(); break;
      case 'export-csv': exportCSV(); break;
      case 'export-json': download('habitguard-data.json', JSON.stringify(state, null, 2), 'application/json'); toast('Data export downloaded.'); break;
      case 'print': window.print(); break;
      case 'clear-data': if (confirm('Delete all HabitGuard data saved in this browser? This cannot be undone.')) { localStorage.removeItem(STORE); state = fresh(); save(); render(); toast('Local data deleted.'); } break;
      case 'close-modal': closeModal(); break;
      case 'modal-submit': document.querySelector('#modal-form')?.requestSubmit(); break;
      case 'close-recovery': element.closest('.recovery')?.remove(); break;
      default: break;
    }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]'); if (!target) return;
    if (target.dataset.action === 'backdrop' && event.target === target) { closeModal(); return; }
    action(target.dataset.action, target.dataset.id, target);
  });
  document.addEventListener('submit', event => {
    if (event.target.id === 'modal-form') {
      event.preventDefault(); const fd = new FormData(event.target), data = Object.fromEntries(fd.entries()); data.days = fd.getAll('days').map(Number);
      try { modalHandler?.(data); } catch (error) { toast(error.message || 'Please check the form.'); }
    } else if (event.target.id === 'settings-form') {
      event.preventDefault(); const fd = new FormData(event.target); state.profile.name = fd.get('name')?.trim() || 'Your space'; state.profile.timezone = fd.get('timezone') || state.profile.timezone; state.profile.theme = fd.get('theme') || 'light'; save(); render(); toast('Profile saved.');
    } else if (event.target.id === 'reminder-form') {
      event.preventDefault(); const fd = new FormData(event.target); state.prefs.remindersEnabled = fd.has('enabled'); state.prefs.reminderTime = fd.get('time'); state.prefs.quietStart = fd.get('quietStart'); save(); render(); toast('Preferences saved; no notification is scheduled.');
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'calendar-filter') { calendarFilter = event.target.value; render(); }
    if (event.target.id === 'analytics-range') render();
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'journal-search') { const position = event.target.selectionStart; render(); const input = document.querySelector('#journal-search'); input?.focus(); input?.setSelectionRange(position, position); }
  });
  document.querySelector('#theme-toggle').addEventListener('click', () => { state.profile.theme = state.profile.theme === 'dark' ? 'light' : 'dark'; save(); render(); });
  document.querySelector('#mobile-menu').addEventListener('click', () => { location.hash = '#settings'; });
  window.addEventListener('hashchange', render);
  save();
  if (!location.hash) location.hash = '#dashboard'; else render();
})();