/* ===========================================================
   AKIBA — Expense Tracker
   All data lives in localStorage. Nothing leaves the device.
=========================================================== */

(function(){
  'use strict';

  const STORAGE_KEY = 'akiba.v1';

  const DEFAULT_CATEGORIES = [
    { id: 'food',      name: 'Food & Dining', icon: '🍲', color: 'var(--cat-1)' },
    { id: 'transport',  name: 'Transport',     icon: '🚌', color: 'var(--cat-4)' },
    { id: 'housing',    name: 'Housing & Rent',icon: '🏠', color: 'var(--cat-2)' },
    { id: 'utilities',  name: 'Utilities',     icon: '💡', color: 'var(--cat-5)' },
    { id: 'health',     name: 'Health',        icon: '💊', color: 'var(--cat-3)' },
    { id: 'shopping',   name: 'Shopping',      icon: '🛍️', color: 'var(--cat-2)' },
    { id: 'entertain',  name: 'Entertainment', icon: '🎬', color: 'var(--cat-3)' },
    { id: 'education',  name: 'Education',     icon: '📚', color: 'var(--cat-4)' },
    { id: 'airtime',    name: 'Airtime & Data',icon: '📱', color: 'var(--cat-5)' },
    { id: 'other',      name: 'Other',         icon: '✨', color: 'var(--cat-6)' },
  ];

  const INCOME_CATEGORIES = [
    { id: 'salary',   name: 'Salary',     icon: '💼', color: 'var(--cat-1)' },
    { id: 'business', name: 'Business',   icon: '📈', color: 'var(--cat-4)' },
    { id: 'gift',     name: 'Gift',       icon: '🎁', color: 'var(--cat-3)' },
    { id: 'other-in', name: 'Other',      icon: '✨', color: 'var(--cat-6)' },
  ];

  const EMOJI_OPTIONS = ['🍲','🚌','🏠','💡','💊','🛍️','🎬','📚','📱','✨','💼','📈','🎁','🐾','🧾','🎓','⚽','🍻','🚗','🧸','💳','🌾'];

  const WEEKDAY_LABELS = ['S','M','T','W','T','F','S'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  /* -----------------------------------------------------------
     State
  ----------------------------------------------------------- */
  let state = {
    name: '',
    categories: DEFAULT_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
    transactions: [], // { id, type: 'income'|'expense', amount, categoryId, note, date (YYYY-MM-DD), createdAt }
  };

  let statsMonthOffset = 0; // 0 = current month, -1 = prev, etc.
  let historyFilter = 'all';
  let historySearch = '';
  let editingTxId = null;
  let pendingDeleteId = null;
  let selectedAddType = 'expense';
  let selectedCategoryId = null;
  let pendingNewCategory = null;

  /* -----------------------------------------------------------
     Storage
  ----------------------------------------------------------- */
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        state = Object.assign({}, state, parsed);
        if(!state.categories || !state.categories.length) state.categories = DEFAULT_CATEGORIES;
        if(!state.incomeCategories || !state.incomeCategories.length) state.incomeCategories = INCOME_CATEGORIES;
      }
    }catch(e){
      console.warn('Could not load saved data, starting fresh.', e);
    }
  }

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      showToast("Couldn't save — storage might be full");
    }
  }

  /* -----------------------------------------------------------
     Utilities
  ----------------------------------------------------------- */
  function uid(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatMoney(n){
    const rounded = Math.round(n);
    const sign = rounded < 0 ? '-' : '';
    return sign + 'TSh ' + Math.abs(rounded).toLocaleString('en-US');
  }

  function formatMoneyShort(n){
    const abs = Math.abs(n);
    if(abs >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
    if(abs >= 1000) return (n/1000).toFixed(0) + 'K';
    return Math.round(n).toString();
  }

  function todayISO(){
    const d = new Date();
    return localISO(d);
  }

  function localISO(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function parseISO(s){
    const [y,m,d] = s.split('-').map(Number);
    return new Date(y, m-1, d);
  }

  function isSameMonth(dateStr, year, month){
    const d = parseISO(dateStr);
    return d.getFullYear() === year && d.getMonth() === month;
  }

  function getCategory(id, type){
    const list = type === 'income' ? state.incomeCategories : state.categories;
    return list.find(c => c.id === id) || { name: 'Other', icon: '✨', color: 'var(--cat-6)' };
  }

  function allCategoriesFlat(){
    return state.categories.concat(state.incomeCategories);
  }

  function getCategoryAny(id){
    return allCategoriesFlat().find(c => c.id === id) || { name: 'Other', icon: '✨', color: 'var(--cat-6)' };
  }

  /* -----------------------------------------------------------
     Toast
  ----------------------------------------------------------- */
  let toastTimer = null;
  function showToast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  /* -----------------------------------------------------------
     Navigation
  ----------------------------------------------------------- */
  function navigateTo(viewName){
    document.querySelectorAll('.view').forEach(v => {
      v.hidden = v.dataset.view !== viewName;
    });
    document.querySelectorAll('.tabbar__item').forEach(b => {
      b.classList.toggle('is-active', b.dataset.nav === viewName);
    });
    if(viewName === 'home') renderHome();
    if(viewName === 'stats') renderStats();
    if(viewName === 'history') renderHistory();
    if(viewName === 'settings') renderSettings();
    window.scrollTo(0,0);
  }

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });

  /* -----------------------------------------------------------
     Greeting
  ----------------------------------------------------------- */
  function updateGreeting(){
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if(hour < 12) greeting = 'Good morning';
    else if(hour < 17) greeting = 'Good afternoon';
    const name = state.name ? `, ${state.name}` : '';
    document.getElementById('greeting-text').textContent = greeting + name;

    const now = new Date();
    document.getElementById('current-month').textContent = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  }

  /* -----------------------------------------------------------
     HOME RENDER
  ----------------------------------------------------------- */
  function renderHome(){
    updateGreeting();

    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();

    const monthTx = state.transactions.filter(t => isSameMonth(t.date, y, m));
    const income = monthTx.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
    const expenses = monthTx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
    const net = income - expenses;

    document.getElementById('net-balance').textContent = formatMoney(net);
    document.getElementById('total-income').textContent = formatMoney(income);
    document.getElementById('total-expenses').textContent = formatMoney(expenses);

    // delta message
    const deltaEl = document.getElementById('balance-delta');
    if(monthTx.length === 0){
      deltaEl.textContent = 'Add your first entry to get started';
      deltaEl.className = 'balance-card__delta';
    } else if(income === 0 && expenses > 0){
      deltaEl.textContent = `${formatMoney(expenses)} spent this month`;
      deltaEl.className = 'balance-card__delta is-negative';
    } else {
      const pct = income > 0 ? Math.round((net/income)*100) : 0;
      if(net >= 0){
        deltaEl.textContent = `You've kept ${pct}% of your income this month`;
        deltaEl.className = 'balance-card__delta is-positive';
      } else {
        deltaEl.textContent = `Spending exceeds income by ${formatMoney(Math.abs(net))}`;
        deltaEl.className = 'balance-card__delta is-negative';
      }
    }

    // ring: spent ratio of income (capped 0-1), or 0 if no income
    const ringFill = document.getElementById('balance-ring-fill');
    const circumference = 150.8;
    let ratio = 0;
    if(income > 0) ratio = Math.min(expenses / income, 1);
    else if(expenses > 0) ratio = 1;
    const offset = circumference * (1 - ratio);
    requestAnimationFrame(() => {
      ringFill.style.strokeDashoffset = offset;
      ringFill.style.stroke = ratio > 0.85 ? 'var(--clay)' : 'var(--jade)';
    });

    renderWeekStrip();
    renderHomeCategoryChips(monthTx);
    renderHomeTransactions();
  }

  function renderWeekStrip(){
    const container = document.getElementById('week-bars');
    container.innerHTML = '';

    const now = new Date();
    const days = [];
    for(let i = 6; i >= 0; i--){
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(d);
    }

    const dayTotals = days.map(d => {
      const iso = localISO(d);
      return state.transactions
        .filter(t => t.type === 'expense' && t.date === iso)
        .reduce((s,t) => s + t.amount, 0);
    });

    const weekTotal = dayTotals.reduce((a,b) => a+b, 0);
    document.getElementById('week-total').textContent = formatMoney(weekTotal);

    const max = Math.max(...dayTotals, 1);
    const todayIso = todayISO();

    days.forEach((d, i) => {
      const iso = localISO(d);
      const isToday = iso === todayIso;
      const heightPct = Math.max((dayTotals[i] / max) * 100, dayTotals[i] > 0 ? 8 : 3);

      const wrap = document.createElement('div');
      wrap.className = 'week-bar' + (isToday ? ' is-today' : '');
      wrap.innerHTML = `
        <div class="week-bar__col" style="height:${heightPct}%"></div>
        <span class="week-bar__label">${WEEKDAY_LABELS[d.getDay()]}</span>
      `;
      container.appendChild(wrap);
    });
  }

  function renderHomeCategoryChips(monthTx){
    const container = document.getElementById('category-chips');
    container.innerHTML = '';

    const byCategory = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
    });

    const entries = Object.entries(byCategory).sort((a,b) => b[1]-a[1]);

    if(entries.length === 0){
      container.innerHTML = `<p style="color:var(--bone-faint);font-size:13px;padding:8px 0;">No expenses logged this month yet.</p>`;
      return;
    }

    entries.forEach(([catId, amount]) => {
      const cat = getCategory(catId, 'expense');
      const chip = document.createElement('div');
      chip.className = 'cat-chip';
      chip.innerHTML = `
        <span class="cat-chip__icon" style="background:${cat.color}33">${cat.icon}</span>
        <span>
          <p class="cat-chip__name">${escapeHtml(cat.name)}</p>
          <p class="cat-chip__amount">${formatMoney(amount)}</p>
        </span>
      `;
      container.appendChild(chip);
    });
  }

  function renderHomeTransactions(){
    const container = document.getElementById('tx-list-home');
    const emptyEl = document.getElementById('empty-home');
    container.innerHTML = '';

    const sorted = [...state.transactions].sort((a,b) => b.createdAt - a.createdAt).slice(0, 6);

    if(sorted.length === 0){
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    sorted.forEach(tx => container.appendChild(buildTxRow(tx)));
  }

  function buildTxRow(tx){
    const cat = getCategory(tx.categoryId, tx.type);
    const row = document.createElement('div');
    row.className = 'tx-row';
    row.dataset.id = tx.id;
    const sign = tx.type === 'income' ? '+' : '−';
    row.innerHTML = `
      <span class="tx-row__icon" style="background:${cat.color}2e">${cat.icon}</span>
      <span class="tx-row__body">
        <p class="tx-row__name">${escapeHtml(tx.note || cat.name)}</p>
        <p class="tx-row__meta">${formatDateLabel(tx.date)} · ${escapeHtml(cat.name)}</p>
      </span>
      <span class="tx-row__amount ${tx.type === 'income' ? 'is-income' : 'is-expense'}">${sign} ${formatMoneyShortFull(tx.amount)}</span>
    `;
    row.addEventListener('click', () => openEditSheet(tx.id));
    return row;
  }

  function formatMoneyShortFull(n){
    return formatMoney(n).replace('TSh ', '');
  }

  function formatDateLabel(iso){
    const d = parseISO(iso);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate()-1);
    if(iso === localISO(today)) return 'Today';
    if(iso === localISO(yest)) return 'Yesterday';
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0,3)}`;
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* -----------------------------------------------------------
     STATS RENDER
  ----------------------------------------------------------- */
  function getStatsMonthDate(){
    const d = new Date();
    d.setMonth(d.getMonth() + statsMonthOffset);
    return d;
  }

  function renderStats(){
    const monthDate = getStatsMonthDate();
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    document.getElementById('stats-month-label').textContent = `${MONTH_NAMES[m].slice(0,3)} ${y}`;

    const monthTx = state.transactions.filter(t => isSameMonth(t.date, y, m));
    const spent = monthTx.filter(t => t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const income = monthTx.filter(t => t.type==='income').reduce((s,t)=>s+t.amount,0);

    document.getElementById('stats-total-spent').textContent = formatMoney(spent);
    document.getElementById('stats-total-income').textContent = formatMoney(income);

    // previous month comparison
    const prevDate = new Date(monthDate); prevDate.setMonth(prevDate.getMonth()-1);
    const prevTx = state.transactions.filter(t => isSameMonth(t.date, prevDate.getFullYear(), prevDate.getMonth()));
    const prevSpent = prevTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const prevIncome = prevTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);

    document.getElementById('stats-spent-delta').textContent = deltaText(spent, prevSpent, true);
    document.getElementById('stats-income-delta').textContent = deltaText(income, prevIncome, false);

    renderCategoryBars(monthTx, spent);
  }

  function deltaText(current, prev, isExpense){
    if(prev === 0 && current === 0) return 'No data for previous month';
    if(prev === 0) return 'No previous month to compare';
    const pct = Math.round(((current - prev) / prev) * 100);
    if(pct === 0) return 'Same as last month';
    const dir = pct > 0 ? 'up' : 'down';
    const goodForExpense = (dir === 'down');
    return `${Math.abs(pct)}% ${dir} from last month`;
  }

  function renderCategoryBars(monthTx, totalSpent){
    const container = document.getElementById('category-bars-full');
    const emptyEl = document.getElementById('empty-stats');
    container.innerHTML = '';

    const byCategory = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
    });

    const entries = Object.entries(byCategory).sort((a,b) => b[1]-a[1]);

    if(entries.length === 0){
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    entries.forEach(([catId, amount]) => {
      const cat = getCategory(catId, 'expense');
      const pct = totalSpent > 0 ? Math.round((amount/totalSpent)*100) : 0;
      const row = document.createElement('div');
      row.className = 'cat-bar-row';
      row.innerHTML = `
        <div class="cat-bar-row__top">
          <span class="cat-bar-row__icon" style="background:${cat.color}33">${cat.icon}</span>
          <span class="cat-bar-row__name">${escapeHtml(cat.name)}</span>
          <span class="cat-bar-row__pct">${pct}%</span>
        </div>
        <div class="cat-bar-row__track">
          <div class="cat-bar-row__fill" style="width:0%;background:${cat.color}"></div>
        </div>
        <div style="text-align:right;margin-top:4px;">
          <span class="cat-bar-row__amount">${formatMoney(amount)}</span>
        </div>
      `;
      container.appendChild(row);
      requestAnimationFrame(() => {
        row.querySelector('.cat-bar-row__fill').style.width = pct + '%';
      });
    });
  }

  document.getElementById('stats-prev-month').addEventListener('click', () => {
    statsMonthOffset--; renderStats();
  });
  document.getElementById('stats-next-month').addEventListener('click', () => {
    if(statsMonthOffset < 0){ statsMonthOffset++; renderStats(); }
  });

  /* -----------------------------------------------------------
     HISTORY RENDER
  ----------------------------------------------------------- */
  function renderHistory(){
    const container = document.getElementById('tx-grouped');
    const emptyEl = document.getElementById('empty-history');
    container.innerHTML = '';

    let txs = [...state.transactions];

    if(historyFilter !== 'all'){
      txs = txs.filter(t => t.type === historyFilter);
    }
    if(historySearch.trim()){
      const q = historySearch.trim().toLowerCase();
      txs = txs.filter(t => {
        const cat = getCategory(t.categoryId, t.type);
        return (t.note && t.note.toLowerCase().includes(q)) || cat.name.toLowerCase().includes(q);
      });
    }

    txs.sort((a,b) => b.createdAt - a.createdAt);

    if(txs.length === 0){
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    // group by date
    const groups = {};
    txs.forEach(t => {
      if(!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });

    const sortedDates = Object.keys(groups).sort((a,b) => b.localeCompare(a));

    sortedDates.forEach(date => {
      const groupEl = document.createElement('div');
      groupEl.className = 'tx-group';
      const dateLabel = formatFullDateLabel(date);
      const dayTotal = groups[date].reduce((s,t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
      groupEl.innerHTML = `<p class="tx-group__date">${dateLabel}</p>`;
      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '8px';
      groups[date].forEach(tx => list.appendChild(buildTxRow(tx)));
      groupEl.appendChild(list);
      container.appendChild(groupEl);
    });
  }

  function formatFullDateLabel(iso){
    const d = parseISO(iso);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate()-1);
    if(iso === localISO(today)) return 'Today';
    if(iso === localISO(yest)) return 'Yesterday';
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      historyFilter = btn.dataset.filter;
      renderHistory();
    });
  });

  document.getElementById('btn-search').addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    bar.hidden = !bar.hidden;
    if(!bar.hidden) document.getElementById('search-input').focus();
    else { document.getElementById('search-input').value=''; historySearch=''; renderHistory(); }
  });
  document.getElementById('search-input').addEventListener('input', (e) => {
    historySearch = e.target.value;
    renderHistory();
  });

  /* -----------------------------------------------------------
     SETTINGS RENDER
  ----------------------------------------------------------- */
  function renderSettings(){
    document.getElementById('setting-name').value = state.name || '';

    const container = document.getElementById('settings-categories');
    container.innerHTML = '';
    state.categories.forEach(cat => {
      const pill = document.createElement('div');
      pill.className = 'settings-cat-pill';
      pill.innerHTML = `
        <span class="settings-cat-pill__icon">${cat.icon}</span>
        <span>${escapeHtml(cat.name)}</span>
        <span class="settings-cat-pill__remove" data-remove-cat="${cat.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
      `;
      container.appendChild(pill);
    });

    container.querySelectorAll('[data-remove-cat]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.removeCat;
        const inUse = state.transactions.some(t => t.categoryId === id);
        if(inUse){
          showToast("Can't remove — category is used by existing entries");
          return;
        }
        state.categories = state.categories.filter(c => c.id !== id);
        saveState();
        renderSettings();
        showToast('Category removed');
      });
    });
  }

  let nameDebounce = null;
  document.getElementById('setting-name').addEventListener('input', (e) => {
    clearTimeout(nameDebounce);
    nameDebounce = setTimeout(() => {
      state.name = e.target.value.trim();
      saveState();
    }, 400);
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akiba-export-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported');
  });

  document.getElementById('btn-clear-data').addEventListener('click', () => {
    openConfirm(
      'Erase all data?',
      'This will permanently delete every transaction and custom category on this device. This cannot be undone.',
      () => {
        state.transactions = [];
        state.categories = DEFAULT_CATEGORIES;
        state.incomeCategories = INCOME_CATEGORIES;
        saveState();
        renderSettings();
        showToast('All data erased');
      }
    );
  });

  /* -----------------------------------------------------------
     ADD / EDIT SHEET
  ----------------------------------------------------------- */
  const sheetOverlay = document.getElementById('sheet-overlay');
  const amountInput = document.getElementById('input-amount');
  const noteInput = document.getElementById('input-note');
  const dateInput = document.getElementById('input-date');

  function openAddSheet(presetType){
    editingTxId = null;
    selectedAddType = presetType || 'expense';
    selectedCategoryId = null;
    amountInput.value = '';
    noteInput.value = '';
    dateInput.value = todayISO();
    document.getElementById('sheet-title').textContent = 'Add entry';
    document.getElementById('btn-sheet-delete').hidden = true;
    document.getElementById('btn-save-entry').textContent = selectedAddType === 'income' ? 'Save income' : 'Save expense';
    updateTypeToggleUI();
    renderCategoryPicker();
    sheetOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function openEditSheet(txId){
    const tx = state.transactions.find(t => t.id === txId);
    if(!tx) return;
    editingTxId = txId;
    selectedAddType = tx.type;
    selectedCategoryId = tx.categoryId;
    amountInput.value = tx.amount.toLocaleString('en-US');
    noteInput.value = tx.note || '';
    dateInput.value = tx.date;
    document.getElementById('sheet-title').textContent = 'Edit entry';
    document.getElementById('btn-sheet-delete').hidden = false;
    document.getElementById('btn-save-entry').textContent = 'Save changes';
    updateTypeToggleUI();
    renderCategoryPicker();
    sheetOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet(){
    sheetOverlay.hidden = true;
    document.body.style.overflow = '';
  }

  function updateTypeToggleUI(){
    document.querySelectorAll('.type-toggle__btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.type === selectedAddType);
    });
    document.getElementById('btn-save-entry').className = 'primary-btn' + (selectedAddType === 'expense' ? ' is-expense' : '');
  }

  document.querySelectorAll('.type-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedAddType = btn.dataset.type;
      selectedCategoryId = null;
      updateTypeToggleUI();
      renderCategoryPicker();
      document.getElementById('btn-save-entry').textContent = editingTxId ? 'Save changes' : (selectedAddType === 'income' ? 'Save income' : 'Save expense');
    });
  });

  function renderCategoryPicker(){
    const container = document.getElementById('category-picker');
    container.innerHTML = '';
    const list = selectedAddType === 'income' ? state.incomeCategories : state.categories;
    if(!selectedCategoryId) selectedCategoryId = list[0] ? list[0].id : null;

    list.forEach(cat => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cat-pick' + (cat.id === selectedCategoryId ? ' is-selected' : '');
      el.innerHTML = `
        <span class="cat-pick__icon" style="background:${cat.color}33">${cat.icon}</span>
        <span class="cat-pick__name">${escapeHtml(cat.name)}</span>
      `;
      el.addEventListener('click', () => {
        selectedCategoryId = cat.id;
        renderCategoryPicker();
      });
      container.appendChild(el);
    });
  }

  // amount input: digits only, live-formatted with thousand separators
  amountInput.addEventListener('input', (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 12);
    e.target.value = raw ? Number(raw).toLocaleString('en-US') : '';
  });

  document.getElementById('btn-save-entry').addEventListener('click', () => {
    const amount = parseInt(amountInput.value.replace(/,/g, ''), 10);
    if(!amount || amount <= 0){
      showToast('Enter an amount first');
      amountInput.focus();
      return;
    }
    if(!selectedCategoryId){
      showToast('Choose a category');
      return;
    }
    const date = dateInput.value || todayISO();
    const note = noteInput.value.trim();

    if(editingTxId){
      const tx = state.transactions.find(t => t.id === editingTxId);
      if(tx){
        tx.type = selectedAddType;
        tx.amount = amount;
        tx.categoryId = selectedCategoryId;
        tx.note = note;
        tx.date = date;
      }
      showToast('Entry updated');
    } else {
      state.transactions.push({
        id: uid(),
        type: selectedAddType,
        amount,
        categoryId: selectedCategoryId,
        note,
        date,
        createdAt: Date.now(),
      });
      showToast(selectedAddType === 'income' ? 'Income added' : 'Expense added');
    }

    saveState();
    closeSheet();
    refreshCurrentView();
  });

  document.getElementById('btn-sheet-delete').addEventListener('click', () => {
    openConfirm('Delete this entry?', 'This transaction will be permanently removed.', () => {
      state.transactions = state.transactions.filter(t => t.id !== editingTxId);
      saveState();
      closeSheet();
      refreshCurrentView();
      showToast('Entry deleted');
    });
  });

  document.getElementById('btn-fab').addEventListener('click', () => openAddSheet('expense'));
  document.getElementById('btn-sheet-close').addEventListener('click', closeSheet);
  sheetOverlay.addEventListener('click', (e) => { if(e.target === sheetOverlay) closeSheet(); });

  function refreshCurrentView(){
    const activeView = document.querySelector('.view:not([hidden])');
    if(!activeView) return;
    const name = activeView.dataset.view;
    if(name === 'home') renderHome();
    if(name === 'stats') renderStats();
    if(name === 'history') renderHistory();
    if(name === 'settings') renderSettings();
  }

  /* -----------------------------------------------------------
     ADD CATEGORY SHEET
  ----------------------------------------------------------- */
  const catSheetOverlay = document.getElementById('cat-sheet-overlay');
  let selectedEmoji = EMOJI_OPTIONS[0];

  function openCatSheet(){
    document.getElementById('input-cat-name').value = '';
    selectedEmoji = EMOJI_OPTIONS[0];
    renderEmojiPicker();
    catSheetOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeCatSheet(){
    catSheetOverlay.hidden = true;
    document.body.style.overflow = '';
  }

  function renderEmojiPicker(){
    const container = document.getElementById('emoji-picker');
    container.innerHTML = '';
    EMOJI_OPTIONS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-pick' + (emoji === selectedEmoji ? ' is-selected' : '');
      btn.textContent = emoji;
      btn.addEventListener('click', () => { selectedEmoji = emoji; renderEmojiPicker(); });
      container.appendChild(btn);
    });
  }

  document.getElementById('btn-add-category').addEventListener('click', openCatSheet);
  document.getElementById('btn-cat-sheet-close').addEventListener('click', closeCatSheet);
  catSheetOverlay.addEventListener('click', (e) => { if(e.target === catSheetOverlay) closeCatSheet(); });

  document.getElementById('btn-save-category').addEventListener('click', () => {
    const name = document.getElementById('input-cat-name').value.trim();
    if(!name){
      showToast('Give the category a name');
      return;
    }
    const palette = ['var(--cat-1)','var(--cat-2)','var(--cat-3)','var(--cat-4)','var(--cat-5)','var(--cat-6)'];
    const color = palette[state.categories.length % palette.length];
    state.categories.push({ id: uid(), name, icon: selectedEmoji, color });
    saveState();
    closeCatSheet();
    renderSettings();
    showToast('Category added');
  });

  /* -----------------------------------------------------------
     CONFIRM DIALOG
  ----------------------------------------------------------- */
  const confirmOverlay = document.getElementById('confirm-overlay');
  let confirmCallback = null;

  function openConfirm(title, body, onConfirm){
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = body;
    confirmCallback = onConfirm;
    confirmOverlay.hidden = false;
  }
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    confirmOverlay.hidden = true;
    confirmCallback = null;
  });
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if(confirmCallback) confirmCallback();
    confirmOverlay.hidden = true;
    confirmCallback = null;
  });

  /* -----------------------------------------------------------
     Init
  ----------------------------------------------------------- */
  function init(){
    loadState();
    if(!dateInput.value) dateInput.value = todayISO();
    navigateTo('home');

    // Register service worker for PWA offline support
    if('serviceWorker' in navigator){
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
          // Fails silently if not served over https/localhost — fine for preview
        });
      });
    }
  }

  init();
})();
