/* ================================================================
   선빈♡병철 러브장 — app
   ================================================================ */
(function () {
  'use strict';

  /* ---------------- basics ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const pad = n => String(n).padStart(2, '0');
  const nowISO = () => new Date().toISOString();
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const thisMonth = () => todayISO().slice(0, 7);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = n => (Math.round(Number(n) || 0)).toLocaleString('ko-KR') + '원';
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const digits = v => String(v == null ? '' : v).replace(/[^0-9]/g, '');
  const toNum = v => Number(digits(v)) || 0;
  const commas = v => digits(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${y}년 ${m}월`;
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function dayLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const w = WD[new Date(y, m - 1, d).getDay()];
    return `${m}월 ${d}일 (${w})`;
  }
  function shortDate(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}`;
  }
  function ymOf(dateStr) { return (dateStr || '').slice(0, 7); }
  function nextDueText(day) {
    const n = Number(day);
    if (!n) return '상환일 미정';
    return `매월 ${n}일 상환`;
  }

  const OWNER = {
    b: { name: '병철', color: '#4a7cf0' },
    s: { name: '선빈', color: '#ec5f86' },
    j: { name: '공동', color: '#8b6ad6' }
  };
  const CARD_OWNERS = ['b', 's'];
  const ownerName = k => (OWNER[k] ? OWNER[k].name : '공동');

  const ICON = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5 17.5 10.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.5 7"/><path d="M10.5 11v5M13.5 11v5"/></svg>'
  };

  /* ---------------- data ---------------- */
  const STORAGE_KEY = 'love-ledger-v2';
  const DEFAULT_CATS = {
    expense: ['식비', '장보기', '생활용품', '교통·주유', '주거·공과금', '통신', '보험', '의료', '외식', '경조사', '교육', '취미', '반려동물', '기타'],
    income: ['급여', '사업수입', '부수입', '용돈', '이자·배당', '기타수입']
  };

  function freshSettings() {
    return {
      gasUrl: '',
      autoSync: true,
      viewMonth: thisMonth(),
      lastSyncAt: null
    };
  }

  function freshState() {
    return {
      v: 2,
      deviceId: uid(),
      updatedAt: nowISO(),
      entries: [],
      loans: [],
      cards: [],
      categories: { expense: DEFAULT_CATS.expense.slice(), income: DEFAULT_CATS.income.slice() },
      settings: freshSettings()
    };
  }

  let state = loadState();

  function loadState() {
    let s = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) s = JSON.parse(raw);
    } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return freshState();
    return normalize(s);
  }

  function normalize(s) {
    const base = freshState();
    const out = Object.assign({}, base, s);
    out.entries = Array.isArray(s.entries) ? s.entries : [];
    out.loans = Array.isArray(s.loans) ? s.loans : [];
    out.cards = Array.isArray(s.cards) ? s.cards : [];
    out.settings = Object.assign(freshSettings(), s.settings || {});
    out.categories = {
      expense: Array.from(new Set([].concat(DEFAULT_CATS.expense, (s.categories && s.categories.expense) || []))),
      income: Array.from(new Set([].concat(DEFAULT_CATS.income, (s.categories && s.categories.income) || [])))
    };
    if (!/^\d{4}-\d{2}$/.test(out.settings.viewMonth || '')) {
      out.settings.viewMonth = thisMonth();
    }
    out.deviceId = out.deviceId || uid();
    out.updatedAt = out.updatedAt || nowISO();
    // every item needs an updatedAt for merging
    ['entries', 'loans', 'cards'].forEach(k => {
      out[k].forEach(it => {
        if (!it.id) it.id = uid();
        if (!it.updatedAt) it.updatedAt = it.createdAt || out.updatedAt;
      });
    });
    return out;
  }

  function persist() {
    state.updatedAt = nowISO();
    purgeTombstones();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('저장 공간이 부족해 저장하지 못했어요');
    }
  }

  function purgeTombstones() {
    const limit = Date.now() - 1000 * 60 * 60 * 24 * 60;
    ['entries', 'loans', 'cards'].forEach(k => {
      state[k] = state[k].filter(it => !(it.deleted && new Date(it.updatedAt).getTime() < limit));
    });
  }

  function alive(list) { return (list || []).filter(it => !it.deleted); }
  function entries() { return alive(state.entries); }
  function loans() { return alive(state.loans); }
  function cards() { return alive(state.cards); }
  function entryById(id) { return state.entries.find(e => e.id === id); }
  function loanById(id) { return state.loans.find(l => l.id === id); }
  function cardById(id) { return state.cards.find(c => c.id === id); }

  const sumAmt = list => list.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const monthEntries = ym => entries().filter(e => ymOf(e.date) === ym);
  const monthCards = ym => cards().filter(c => (c.month || ymOf(c.dueDate)) === ym).sort((a, b) => (Number(a.dueDay || 0) - Number(b.dueDay || 0)) || a.owner.localeCompare(b.owner));

  function ownerTotals(list) {
    const t = { b: 0, s: 0, j: 0 };
    list.forEach(e => { t[e.owner] = (t[e.owner] || 0) + (Number(e.amount) || 0); });
    return t;
  }

  function loanTotals() {
    const list = loans();
    const principal = list.reduce((a, l) => a + (Number(l.principal) || 0), 0);
    const balance = list.reduce((a, l) => a + Math.max(0, Number(l.balance) || 0), 0);
    return { count: list.length, principal, balance, paid: Math.max(0, principal - balance), rate: pct(Math.max(0, principal - balance), principal) };
  }

  function loanRate(l) {
    const p = Number(l.principal) || 0;
    const b = Math.max(0, Number(l.balance) || 0);
    return p > 0 ? pct(Math.max(0, p - b), p) : 0;
  }

  /* ---------------- ui state ---------------- */
  const ui = {
    tab: 'home',
    month: /^\d{4}-\d{2}$/.test(state.settings.viewMonth) ? state.settings.viewMonth : thisMonth(),
    ownerFilter: 'all',
    typeFilter: 'all',
    entry: {
      owner: 'b',
      type: 'expense',
      date: todayISO(),
      cat: { expense: DEFAULT_CATS.expense[0], income: DEFAULT_CATS.income[0] },
      editingId: null
    },
    openHistory: new Set()
  };

  /* ---------------- toast / modal ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 220);
    }, 2200);
  }

  function openModal(opts) {
    const backdrop = $('#modalBackdrop');
    $('#modalTitle').textContent = opts.title || '';
    $('#modalBody').innerHTML = opts.body || '';
    $('#modalFoot').innerHTML = opts.foot || '';
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    const modal = $('.modal', backdrop);
    if (modal) modal.scrollTop = 0;
  }
  let confirmResolver = null;

  function closeModal() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
    if (confirmResolver) {
      const r = confirmResolver;
      confirmResolver = null;
      r(false);
    }
  }
  function confirmModal(opts) {
    openModal({
      title: opts.title || '확인',
      body: `<p class="modal-note">${opts.message || ''}</p>`,
      foot: `<button class="ghost-btn" id="confirmNo" type="button">취소</button><button class="${opts.danger === false ? 'primary-btn' : 'danger-btn'}" id="confirmYes" type="button">${esc(opts.confirmText || '확인')}</button>`
    });
    return new Promise(resolve => {
      let settled = false;
      const finish = v => {
        if (settled) return;
        settled = true;
        confirmResolver = null;
        resolve(v);
      };
      confirmResolver = finish;
      $('#confirmNo').addEventListener('click', () => { finish(false); closeModal(); });
      $('#confirmYes').addEventListener('click', () => { finish(true); closeModal(); });
    });
  }

  function attachNumeric(input) {
    if (!input) return;
    const fmt = () => {
      const pos = input.value.length - input.selectionStart;
      input.value = commas(input.value);
      const p = Math.max(0, input.value.length - pos);
      try { input.setSelectionRange(p, p); } catch (e) { /* noop */ }
    };
    input.addEventListener('input', fmt);
    if (input.value) fmt();
  }

  /* ---------------- navigation ---------------- */
  const VIEWS = { home: '#view-home', ledger: '#view-ledger', loans: '#view-loans', cards: '#view-cards', share: '#view-share' };

  function setTab(tab) {
    if (!VIEWS[tab]) tab = 'home';
    ui.tab = tab;
    Object.keys(VIEWS).forEach(k => {
      const v = $(VIEWS[k]);
      if (v) v.hidden = k !== tab;
    });
    $$('.tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function setMonth(ym) {
    ui.month = ym;
    state.settings.viewMonth = ym;
    persist();
    render();
  }

  /* ---------------- render ---------------- */
  function render() {
    renderTop();
    renderHome();
    renderLedger();
    renderLoans();
    renderCards();
    renderShare();
  }

  function renderTop() {
    const ym = ui.month;
    $('#topSub').textContent = `${monthLabel(ym)} · 함께 쓰는 우리 집 가계부`;
    renderSyncIndicator();
    $('#homeMonth').textContent = monthLabel(ym);
    $('#ledgerMonth').textContent = monthLabel(ym);
    $('#cardMonth').textContent = monthLabel(ym);
  }

  function renderSyncIndicator() {
    const pill = $('#syncPill');
    const text = $('#syncPillText');
    const has = !!gasUrl();
    const st = sync.status;
    pill.classList.remove('local', 'live', 'error');
    if (!has) {
      pill.classList.add('local');
      text.textContent = '로컬';
    } else if (st === 'error') {
      pill.classList.add('error');
      text.textContent = '연결 오류';
    } else {
      pill.classList.add('live');
      text.textContent = st === 'syncing' ? '동기화 중' : '시트 연결';
    }
  }

  function renderHome() {
    const ym = ui.month;
    const list = monthEntries(ym);
    const inc = sumAmt(list.filter(e => e.type === 'income'));
    const exp = sumAmt(list.filter(e => e.type === 'expense'));
    const net = inc - exp;

    $('#homeIncome').textContent = won(inc);
    $('#homeExpense').textContent = won(exp);
    const netEl = $('#homeNet');
    netEl.textContent = (net < 0 ? '-' : '') + won(Math.abs(net));
    netEl.style.color = net < 0 ? '#ffe4ea' : '#ffffff';

    let note = '수입에서 지출을 뺀 금액이에요';
    if (!list.length) note = '이 달 기록이 아직 없어요';
    else if (net > 0) note = `이번 달은 ${won(net)} 남았어요`;
    else if (net < 0) note = `지출이 ${won(Math.abs(net))} 더 많아요`;
    else note = '수입과 지출이 딱 맞았어요';
    $('#homeNetNote').textContent = note;

    $('#shareBars').innerHTML =
      shareRow('지출', list.filter(e => e.type === 'expense')) +
      shareRow('수입', list.filter(e => e.type === 'income'));

    const noData = !entries().length && !loans().length && !cards().length;
    $('#welcomeCard').hidden = !noData;

    // loans
    const lt = loanTotals();
    $('#homeLoanPrincipal').textContent = won(lt.principal);
    $('#homeLoanBalance').textContent = won(lt.balance);
    $('#homeLoanPaid').textContent = won(lt.paid);
    $('#homeLoanBar').style.width = (lt.rate > 0 ? Math.min(100, lt.rate) : 0) + '%';
    $('#homeLoanProgress').setAttribute('aria-valuenow', String(Math.round(lt.rate)));
    $('#homeLoanRate').textContent = lt.principal ? `${lt.rate}% 상환` : '0% 상환';
    $('#homeLoanCount').textContent = lt.count ? `${lt.count}건 · ${won(lt.balance)} 남음` : '대출 없음';

    // cards
    const cl = monthCards(ym);
    const cTot = sumAmt(cl);
    const cB = sumAmt(cl.filter(c => c.owner === 'b'));
    const CS = sumAmt(cl.filter(c => c.owner === 's'));
    $('#homeCardTotal').textContent = won(cTot);
    $('#homeCardOwners').innerHTML =
      `<span class="owner-chip"><i style="background:${OWNER.b.color}"></i>병철 <strong>${won(cB)}</strong></span>` +
      `<span class="owner-chip"><i style="background:${OWNER.s.color}"></i>선빈 <strong>${won(CS)}</strong></span>`;
    const paidCnt = cl.filter(c => c.paid).length;
    $('#homeCardPaid').textContent = cl.length
      ? `결제 완료 ${paidCnt}건 · 남은 카드 ${cl.length - paidCnt}건`
      : '이 달 카드값이 아직 없어요';

    // category bars
    const byCat = {};
    list.filter(e => e.type === 'expense').forEach(e => {
      byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0);
    });
    const cats = Object.keys(byCat).map(k => ({ name: k, amount: byCat[k] })).sort((a, b) => b.amount - a.amount).slice(0, 6);
    const maxCat = cats.length ? cats[0].amount : 0;
    $('#homeCatTotal').textContent = exp ? `총 ${won(exp)}` : '';
    $('#homeCatBars').innerHTML = cats.length
      ? cats.map(c => `
        <div class="bar-row">
          <span class="bar-name">${esc(c.name)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${maxCat ? Math.max(4, (c.amount / maxCat) * 100) : 0}%"></span></span>
          <span class="bar-amount num">${won(c.amount)}</span>
        </div>`).join('')
      : '<p class="empty" style="padding:14px 0">이 달 지출 기록이 없어요</p>';

    // recent
    const recent = entries().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);
    $('#homeRecent').innerHTML = recent.length
      ? recent.map(e => `
        <li class="mini-item">
          <span class="owner-dot ${e.owner}"></span>
          <div class="mini-main">
            <strong>${esc(e.category)}${e.memo ? ' · ' + esc(e.memo) : ''}</strong>
            <span>${dayLabel(e.date)} · ${ownerName(e.owner)}</span>
          </div>
          <span class="mini-amt num ${e.type === 'income' ? 'income' : 'expense'}">${e.type === 'income' ? '+' : '-'}${won(e.amount)}</span>
        </li>`).join('')
      : '<p class="empty" style="padding:14px 0">첫 기록을 남겨 보세요</p>';
  }

  function shareRow(label, list) {
    const t = ownerTotals(list);
    const total = t.b + t.s + t.j;
    if (!total) {
      return `<div class="share-row">
        <div class="share-top"><b>${label}</b><span>기록 없음</span></div>
        <div class="share-track"><i style="width:100%;background:#f4eaec"></i></div>
      </div>`;
    }
    const seg = ['b', 's', 'j'].filter(k => t[k]).map(k => `<i style="width:${(t[k] / total) * 100}%;background:${OWNER[k].color}"></i>`).join('');
    const legend = ['b', 's', 'j'].filter(k => t[k]).map(k => `<b><i style="background:${OWNER[k].color}"></i>${OWNER[k].name} ${won(t[k])} · ${Math.round((t[k] / total) * 100)}%</b>`).join('');
    return `<div class="share-row">
      <div class="share-top"><b>${label}</b><span>${won(total)}</span></div>
      <div class="share-track">${seg}</div>
      <div class="share-legend">${legend}</div>
    </div>`;
  }

  /* ---------------- ledger ---------------- */
  function renderLedger() {
    // category select
    const type = ui.entry.type;
    const sel = $('#entryCategory');
    const cats = state.categories[type] || [];
    if (!cats.includes(ui.entry.cat[type])) ui.entry.cat[type] = cats[0] || '';
    sel.innerHTML = cats.map(c => `<option value="${esc(c)}"${c === ui.entry.cat[type] ? ' selected' : ''}>${esc(c)}</option>`).join('');

    // owner/type segmented states
    $$('#entryOwner .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.owner === ui.entry.owner));
    $$('#entryType .type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const editing = !!ui.entry.editingId;
    $('#entryFormTitle').textContent = editing ? '기록 수정' : '기록 추가';
    $('#entryEditBadge').hidden = !editing;
    $('#entrySave').textContent = editing ? '수정 저장' : '저장';
    $('#entryCancel').hidden = !editing;

    // list
    let list = monthEntries(ui.month);
    if (ui.ownerFilter !== 'all') list = list.filter(e => e.owner === ui.ownerFilter);
    if (ui.typeFilter !== 'all') list = list.filter(e => e.type === ui.typeFilter);
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const inc = sumAmt(list.filter(e => e.type === 'income'));
    const exp = sumAmt(list.filter(e => e.type === 'expense'));
    $('#entryCount').textContent = list.length ? `${list.length}건 · 수입 ${won(inc)} · 지출 ${won(exp)}` : '';

    $$('#ownerFilter .filter-chip').forEach(b => b.classList.toggle('active', b.dataset.owner === ui.ownerFilter));
    $$('#typeFilter .filter-chip').forEach(b => b.classList.toggle('active', b.dataset.type === ui.typeFilter));

    const groups = {};
    const order = [];
    list.forEach(e => {
      const d = e.date || '';
      if (!groups[d]) { groups[d] = []; order.push(d); }
      groups[d].push(e);
    });

    $('#entryList').innerHTML = order.map(d => {
      const items = groups[d];
      const dayExp = sumAmt(items.filter(e => e.type === 'expense'));
      const dayInc = sumAmt(items.filter(e => e.type === 'income'));
      const bits = [];
      if (dayInc) bits.push(`수입 ${won(dayInc)}`);
      if (dayExp) bits.push(`지출 ${won(dayExp)}`);
      return `<div class="date-group">
        <div class="date-head"><b>${dayLabel(d)}</b><span>${bits.join(' · ')}</span></div>
        ${items.map(e => `
          <div class="entry-row">
            <span class="owner-dot ${e.owner}"></span>
            <div class="entry-main">
              <strong>${esc(e.category)}</strong>
              <span>${esc(e.memo || '메모 없음')}</span>
            </div>
            <div class="entry-side">
              <strong class="num ${e.type === 'income' ? 'income' : 'expense'}">${e.type === 'income' ? '+' : '-'}${won(e.amount)}</strong>
              <span>${ownerName(e.owner)}</span>
            </div>
            <div class="row-actions">
              <button class="act-btn" type="button" data-edit="${e.id}" aria-label="수정">${ICON.edit}</button>
              <button class="act-btn del" type="button" data-del="${e.id}" aria-label="삭제">${ICON.trash}</button>
            </div>
          </div>`).join('')}
      </div>`;
    }).join('');

    $('#entryEmpty').hidden = list.length > 0;
    $('#entryEmpty').innerHTML = '이 달에는 아직 기록이 없어요.<br>위에서 첫 기록을 남겨 보세요.';
  }

  function resetEntryForm(keepDate) {
    ui.entry.editingId = null;
    ui.entry.amount = '';
    $('#entryAmount').value = '';
    $('#entryMemo').value = '';
    if (!keepDate) $('#entryDate').value = todayISO();
    $('#entryCancel').hidden = true;
    $('#entryEditBadge').hidden = true;
    $('#entryFormTitle').textContent = '기록 추가';
    $('#entrySave').textContent = '저장';
  }

  function saveEntry() {
    const amount = toNum($('#entryAmount').value);
    const date = $('#entryDate').value || todayISO();
    const memo = $('#entryMemo').value.trim();
    const type = ui.entry.type;
    const owner = ui.entry.owner;
    const category = $('#entryCategory').value;
    if (!amount) { toast('금액을 입력해 주세요'); $('#entryAmount').focus(); return; }
    if (!date) { toast('날짜를 골라 주세요'); return; }

    if (ui.entry.editingId) {
      const e = entryById(ui.entry.editingId);
      if (e) {
        Object.assign(e, { owner, type, date, amount, category, memo, updatedAt: nowISO() });
      }
      resetEntryForm(true);
      toast('수정했어요');
    } else {
      state.entries.push({ id: uid(), owner, type, date, amount, category, memo, createdAt: nowISO(), updatedAt: nowISO() });
      resetEntryForm(true);
      toast(type === 'income' ? '수입을 기록했어요' : '지출을 기록했어요');
    }
    if (ymOf(date) !== ui.month) {
      ui.month = ymOf(date);
      state.settings.viewMonth = ui.month;
    }
    persist();
    render();
    scheduleSync();
  }

  function editEntry(id) {
    const e = entryById(id);
    if (!e) return;
    ui.entry.editingId = id;
    ui.entry.owner = e.owner;
    ui.entry.type = e.type;
    if (!state.categories[e.type].includes(e.category)) state.categories[e.type].push(e.category);
    ui.entry.cat[e.type] = e.category;
    $('#entryDate').value = e.date;
    $('#entryAmount').value = commas(e.amount);
    $('#entryMemo').value = e.memo || '';
    render();
    $('#view-ledger').scrollIntoView({ block: 'start' });
    $('#entryAmount').focus();
  }

  async function deleteEntry(id) {
    const e = entryById(id);
    if (!e) return;
    const ok = await confirmModal({
      title: '기록 삭제',
      message: `${dayLabel(e.date)} · ${esc(e.category)} ${won(e.amount)} 기록을 지울까요?`,
      confirmText: '지우기'
    });
    if (!ok) return;
    e.deleted = true;
    e.updatedAt = nowISO();
    if (ui.entry.editingId === id) resetEntryForm(true);
    persist();
    render();
    scheduleSync();
    toast('지웠어요');
  }

  /* ---------------- loans ---------------- */
  function renderLoans() {
    const list = loans().slice().sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
    const t = loanTotals();
    $('#loanPrincipalTotal').textContent = won(t.principal);
    $('#loanBalanceTotal').textContent = won(t.balance);
    $('#loanPaidTotal').textContent = won(t.paid);
    $('#loanBar').style.width = (t.rate > 0 ? Math.min(100, t.rate) : 0) + '%';
    $('#loanProgress').setAttribute('aria-valuenow', String(Math.round(t.rate)));
    $('#loanRate').textContent = `${t.rate}% 상환`;
    $('#loanRemainNote').textContent = t.count ? `${t.count}건 · ${won(t.balance)} 남음` : '대출 없음';

    if (t.count) {
      const sub = { b: 0, s: 0, j: 0 };
      list.forEach(l => { sub[l.owner] = (sub[l.owner] || 0) + Math.max(0, Number(l.balance) || 0); });
      $('#loanOwnerSubtotals').innerHTML = ['b', 's', 'j'].map(k =>
        `<span class="subtotal-chip"><i style="background:${OWNER[k].color}"></i>${OWNER[k].name} 잔액 <strong>${won(sub[k])}</strong></span>`
      ).join('');
    } else {
      $('#loanOwnerSubtotals').innerHTML = '';
    }

    $('#loanEmpty').hidden = list.length > 0;
    $('#loanList').innerHTML = list.map(l => {
      const rate = loanRate(l);
      const paid = Math.max(0, (Number(l.principal) || 0) - (Number(l.balance) || 0));
      const pays = (l.payments || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const open = ui.openHistory.has(l.id);
      return `<article class="loan-card" data-loan="${l.id}">
        <div class="loan-top">
          <div class="loan-title">
            <span class="owner-pill ${l.owner}">${ownerName(l.owner)}</span>
            <h3>${esc(l.bank || '대출')}</h3>
            <p>연 ${Number(l.rate || 0)}% · ${nextDueText(l.dueDay)}</p>
          </div>
          <div class="loan-balance">
            <span>남은 잔액</span>
            <strong class="num">${won(l.balance)}</strong>
          </div>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(rate)}" aria-label="${esc(l.bank)} 상환율">
          <div class="progress-fill" style="width:${Math.min(100, rate)}%"></div>
        </div>
        <div class="progress-meta">
          <span>${rate}% 상환</span>
          <span>원금 ${won(l.principal)} · 갚은 돈 ${won(paid)}</span>
        </div>
        <div class="loan-actions">
          <button class="primary-sm" type="button" data-pay="${l.id}">상환 기록</button>
          <button class="ghost-sm" type="button" data-loan-edit="${l.id}">수정</button>
          <button class="ghost-sm" type="button" data-history="${l.id}">상환 내역 ${pays.length}</button>
          <button class="act-btn del" type="button" data-loan-del="${l.id}" aria-label="대출 삭제">${ICON.trash}</button>
        </div>
        ${open ? `<div class="loan-history">
          ${pays.length ? pays.map(p => `<div class="pay-row"><span>${esc(p.date || '')}${p.memo ? ' · ' + esc(p.memo) : ''}</span><b class="num">-${won(p.amount)}</b></div>`).join('') : '<span class="pay-empty">아직 상환 기록이 없어요</span>'}
        </div>` : ''}
      </article>`;
    }).join('');
  }

  function openLoanForm(loanId) {
    const l = loanId ? loanById(loanId) : null;
    openModal({
      title: l ? '대출 수정' : '대출 추가',
      body: `
        <label class="field"><span>명의</span>
          <select id="loanOwner">
            <option value="b"${!l || l.owner === 'b' ? ' selected' : ''}>병철</option>
            <option value="s"${l && l.owner === 's' ? ' selected' : ''}>선빈</option>
            <option value="j"${l && l.owner === 'j' ? ' selected' : ''}>공동</option>
          </select>
        </label>
        <label class="field"><span>은행 / 상품명</span>
          <input id="loanBank" type="text" placeholder="예: 국민은행 신용대출" maxlength="30" value="${l ? esc(l.bank || '') : ''}">
        </label>
        <div class="form-row">
          <label class="field"><span>최초 대출원금</span>
            <input id="loanPrincipal" type="text" inputmode="numeric" placeholder="0" value="${l ? commas(l.principal) : ''}">
          </label>
          <label class="field"><span>현재 남은 잔액</span>
            <input id="loanBalance" type="text" inputmode="numeric" placeholder="0" value="${l ? commas(l.balance) : ''}">
          </label>
        </div>
        <div class="form-row">
          <label class="field"><span>연 금리(%)</span>
            <input id="loanRateInput" type="text" inputmode="decimal" placeholder="예: 4.5" value="${l ? esc(String(l.rate)) : ''}">
          </label>
          <label class="field"><span>월 상환일</span>
            <input id="loanDay" type="text" inputmode="numeric" placeholder="예: 25" maxlength="2" value="${l ? esc(String(l.dueDay || '')) : ''}">
          </label>
        </div>
        <p class="modal-note">${l ? '잔액을 직접 고쳐도 상환 기록은 그대로 남아요.' : '잔액을 비우면 원금과 같게 넣어요.'}</p>`,
      foot: `<button class="ghost-btn" id="loanCancel" type="button">취소</button><button class="primary-btn" id="loanSave" type="button">${l ? '수정 저장' : '추가'}</button>`
    });
    attachNumeric($('#loanPrincipal'));
    attachNumeric($('#loanBalance'));
    $('#loanCancel').addEventListener('click', closeModal);
    $('#loanSave').addEventListener('click', () => {
      const bank = $('#loanBank').value.trim();
      const principal = toNum($('#loanPrincipal').value);
      const balanceRaw = $('#loanBalance').value.trim();
      const balance = balanceRaw ? toNum(balanceRaw) : principal;
      const rate = Math.max(0, Math.min(100, parseFloat(String($('#loanRateInput').value).replace(/[^0-9.]/g, '')) || 0));
      const day = Math.min(31, Math.max(0, parseInt(digits($('#loanDay').value), 10) || 0));
      if (!bank) { toast('은행이나 상품명을 적어 주세요'); $('#loanBank').focus(); return; }
      if (!principal) { toast('최초 대출원금을 입력해 주세요'); $('#loanPrincipal').focus(); return; }
      if (balance > principal) { toast('남은 잔액이 원금보다 클 수 없어요'); return; }

      if (l) {
        Object.assign(l, { owner: $('#loanOwner').value, bank, principal, balance, rate, dueDay: day, updatedAt: nowISO() });
        toast('대출 정보를 고쳤어요');
      } else {
        state.loans.push({ id: uid(), owner: $('#loanOwner').value, bank, principal, balance, rate, dueDay: day, payments: [], createdAt: nowISO(), updatedAt: nowISO() });
        toast('대출을 추가했어요');
      }
      closeModal();
      persist();
      render();
      scheduleSync();
    });
  }

  function openPaymentModal(loanId) {
    const l = loanById(loanId);
    if (!l) return;
    openModal({
      title: '상환 기록',
      body: `
        <p class="modal-note"><b>${esc(l.bank)}</b> · 남은 잔액 <b>${won(l.balance)}</b></p>
        <label class="field"><span>이번에 갚은 금액</span>
          <input id="payAmount" type="text" inputmode="numeric" placeholder="0">
        </label>
        <div class="quick-row" id="payQuick">
          <button class="quick" type="button" data-pay-add="100000">+10만</button>
          <button class="quick" type="button" data-pay-add="300000">+30만</button>
          <button class="quick" type="button" data-pay-add="500000">+50만</button>
          <button class="quick ghost" type="button" data-pay-clear="1">초기화</button>
        </div>
        <label class="field"><span>날짜</span>
          <input id="payDate" type="date" value="${todayISO()}">
        </label>
        <label class="field"><span>메모</span>
          <input id="payMemo" type="text" placeholder="예: 11월 자동이체" maxlength="30">
        </label>
        <p class="modal-note">상환한 금액만큼 남은 잔액이 줄고, 상환율이 올라가요.</p>`,
      foot: `<button class="ghost-btn" id="payCancel" type="button">취소</button><button class="primary-btn" id="paySave" type="button">상환 반영</button>`
    });
    const amountInput = $('#payAmount');
    attachNumeric(amountInput);
    setTimeout(() => amountInput.focus(), 60);
    $('#payQuick').addEventListener('click', ev => {
      const add = ev.target.closest('[data-pay-add]');
      const clr = ev.target.closest('[data-pay-clear]');
      if (add) amountInput.value = commas(toNum(amountInput.value) + Number(add.dataset.payAdd));
      if (clr) amountInput.value = '';
    });
    $('#payCancel').addEventListener('click', closeModal);
    $('#paySave').addEventListener('click', () => {
      const amount = toNum(amountInput.value);
      if (!amount) { toast('갚은 금액을 입력해 주세요'); amountInput.focus(); return; }
      const apply = Math.min(amount, Math.max(0, Number(l.balance) || 0));
      l.payments = l.payments || [];
      l.payments.push({ id: uid(), date: $('#payDate').value || todayISO(), amount, memo: $('#payMemo').value.trim(), createdAt: nowISO() });
      l.balance = Math.max(0, (Number(l.balance) || 0) - apply);
      l.updatedAt = nowISO();
      ui.openHistory.add(l.id);
      closeModal();
      persist();
      render();
      scheduleSync();
      toast(`상환 반영! 남은 잔액 ${won(l.balance)}`);
    });
  }

  async function deleteLoan(id) {
    const l = loanById(id);
    if (!l) return;
    const ok = await confirmModal({
      title: '대출 삭제',
      message: `<b>${esc(l.bank)}</b> 대출을 지울까요? 상환 기록도 함께 사라져요.`,
      confirmText: '지우기'
    });
    if (!ok) return;
    l.deleted = true;
    l.updatedAt = nowISO();
    persist();
    render();
    scheduleSync();
    toast('대출을 지웠어요');
  }

  /* ---------------- cards ---------------- */
  function renderCards() {
    const ym = ui.month;
    const list = monthCards(ym);
    const tot = sumAmt(list);
    const bAmt = sumAmt(list.filter(c => c.owner === 'b'));
    const sAmt = sumAmt(list.filter(c => c.owner === 's'));
    $('#cardTotal').textContent = won(tot);
    $('#cardSplit').innerHTML = `
      <div class="split-box"><span><i class="owner-dot b"></i>병철 카드값</span><strong class="num">${won(bAmt)}</strong></div>
      <div class="split-box"><span><i class="owner-dot s"></i>선빈 카드값</span><strong class="num">${won(sAmt)}</strong></div>`;

    const paid = list.filter(c => c.paid);
    const unpaid = list.filter(c => !c.paid);
    const paidAmt = sumAmt(paid);
    $('#cardPaidTrack').innerHTML = list.length ? `
      <div class="pt-top"><span>결제 완료 ${paid.length}건 · ${won(paidAmt)}</span><span>남음 ${unpaid.length}건 · ${won(tot - paidAmt)}</span></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${tot ? Math.round((paidAmt / tot) * 100) : 0}"><div class="progress-fill" style="width:${tot ? (paidAmt / tot) * 100 : 0}%"></div></div>`
      : '';

    const itemHTML = c => `
      <article class="card-item${c.paid ? ' paid' : ''}" data-card="${c.id}">
        <div class="card-badge ${c.owner}">${esc((c.issuer || '카드').slice(0, 2))}</div>
        <div class="card-body">
          <div class="card-line1">
            <strong>${esc(c.name || c.issuer || '카드')}</strong>
            <span class="amt num">${won(c.amount)}</span>
          </div>
          <div class="card-line2">
            <span class="owner-pill ${c.owner}">${ownerName(c.owner)}</span>
            <span class="card-sub" title="${esc(c.memo || '')}">${esc(c.issuer || '')}${c.dueDay ? ` · ${c.dueDay}일` : ''}</span>
            <label class="pay-check${c.paid ? ' on' : ''}"><input type="checkbox" data-paid="${c.id}"${c.paid ? ' checked' : ''}> 납부 완료</label>
            <div class="row-actions">
              <button class="act-btn" type="button" data-card-edit="${c.id}" aria-label="카드 수정">${ICON.edit}</button>
              <button class="act-btn del" type="button" data-card-del="${c.id}" aria-label="카드 삭제">${ICON.trash}</button>
            </div>
          </div>
        </div>
      </article>`;

    $('#cardList').innerHTML = (paid.length || unpaid.length) ? `
      ${unpaid.length ? `<div class="card-group-head"><b>결제 전</b> ${unpaid.length}건 · ${won(tot - paidAmt)}</div>${unpaid.map(itemHTML).join('')}` : ''}
      ${paid.length ? `<div class="card-group-head"><b>결제 완료</b> ${paid.length}건 · ${won(paidAmt)}</div>${paid.map(itemHTML).join('')}` : ''}` : '';

    $('#cardEmpty').hidden = list.length > 0;
  }

  function openCardForm(cardId) {
    const c = cardId ? cardById(cardId) : null;
    openModal({
      title: c ? '카드 수정' : '카드 추가',
      body: `
        <p class="modal-note"><b>${monthLabel(ui.month)}</b> 카드값으로 저장돼요.</p>
        <label class="field"><span>명의</span>
          <select id="cardOwner">
            <option value="b"${!c || c.owner === 'b' ? ' selected' : ''}>병철</option>
            <option value="s"${c && c.owner === 's' ? ' selected' : ''}>선빈</option>
          </select>
        </label>
        <div class="form-row">
          <label class="field"><span>카드사</span>
            <input id="cardIssuer" type="text" placeholder="예: 신한카드" maxlength="12" value="${c ? esc(c.issuer || '') : ''}">
          </label>
          <label class="field"><span>카드명</span>
            <input id="cardName" type="text" placeholder="예: Deep Dream" maxlength="20" value="${c ? esc(c.name || '') : ''}">
          </label>
        </div>
        <label class="field"><span>이번 달 청구(사용) 금액</span>
          <input id="cardAmount" type="text" inputmode="numeric" placeholder="0" value="${c ? commas(c.amount) : ''}">
        </label>
        <div class="form-row">
          <label class="field"><span>결제일</span>
            <input id="cardDay" type="text" inputmode="numeric" placeholder="예: 25" maxlength="2" value="${c ? esc(String(c.dueDay || '')) : ''}">
          </label>
          <label class="field"><span>결제 상태</span>
            <select id="cardPaid">
              <option value="n"${!c || !c.paid ? ' selected' : ''}>아직 안 냄</option>
              <option value="y"${c && c.paid ? ' selected' : ''}>납부 완료</option>
            </select>
          </label>
        </div>
        <label class="field"><span>메모</span>
          <input id="cardMemo" type="text" placeholder="예: 생활비 카드" maxlength="30" value="${c ? esc(c.memo || '') : ''}">
        </label>`,
      foot: `<button class="ghost-btn" id="cardCancel" type="button">취소</button><button class="primary-btn" id="cardSave" type="button">${c ? '수정 저장' : '추가'}</button>`
    });
    attachNumeric($('#cardAmount'));
    $('#cardCancel').addEventListener('click', closeModal);
    $('#cardSave').addEventListener('click', () => {
      const amount = toNum($('#cardAmount').value);
      const issuer = $('#cardIssuer').value.trim();
      const name = $('#cardName').value.trim();
      const day = Math.min(31, Math.max(0, parseInt(digits($('#cardDay').value), 10) || 0));
      const paidFlag = $('#cardPaid').value === 'y';
      if (!issuer && !name) { toast('카드사나 카드명을 적어 주세요'); return; }
      if (!amount) { toast('청구 금액을 입력해 주세요'); $('#cardAmount').focus(); return; }
      if (c) {
        Object.assign(c, { owner: $('#cardOwner').value, issuer, name, amount, dueDay: day, paid: paidFlag, memo: $('#cardMemo').value.trim(), updatedAt: nowISO() });
        toast('카드 정보를 고쳤어요');
      } else {
        state.cards.push({
          id: uid(), owner: $('#cardOwner').value, issuer, name, amount, dueDay: day, paid: paidFlag,
          memo: $('#cardMemo').value.trim(), month: ui.month, createdAt: nowISO(), updatedAt: nowISO()
        });
        toast('카드를 추가했어요');
      }
      closeModal();
      persist();
      render();
      scheduleSync();
    });
  }

  async function deleteCard(id) {
    const c = cardById(id);
    if (!c) return;
    const ok = await confirmModal({
      title: '카드값 삭제',
      message: `${esc(c.issuer || '')} ${esc(c.name || '')} ${won(c.amount)} 기록을 지울까요?`,
      confirmText: '지우기'
    });
    if (!ok) return;
    c.deleted = true;
    c.updatedAt = nowISO();
    persist();
    render();
    scheduleSync();
    toast('지웠어요');
  }

  /* ---------------- sync helpers ---------------- */
  const sync = { timer: null, busy: false, status: 'local', message: '', at: null };

  function gasUrl() { return (state.settings.gasUrl || '').trim(); }

  function payload() {
    return {
      v: 2,
      updatedAt: state.updatedAt,
      deviceId: state.deviceId,
      entries: state.entries,
      loans: state.loans,
      cards: state.cards,
      categories: state.categories
    };
  }

  function mergeList(target, incoming) {
    let changed = false;
    const map = new Map(target.map(it => [it.id, it]));
    (incoming || []).forEach(raw => {
      if (!raw || typeof raw !== 'object' || !raw.id) return;
      const cur = map.get(raw.id);
      if (!cur) {
        const copy = Object.assign({}, raw, { updatedAt: raw.updatedAt || nowISO() });
        target.push(copy);
        map.set(copy.id, copy);
        changed = true;
        return;
      }
      if (String(raw.updatedAt || '') > String(cur.updatedAt || '')) {
        Object.assign(cur, raw);
        changed = true;
      }
    });
    return changed;
  }

  function mergeDoc(remote) {
    if (!remote || typeof remote !== 'object') return false;
    let changed = false;
    if (Array.isArray(remote.entries)) changed = mergeList(state.entries, remote.entries) || changed;
    if (Array.isArray(remote.loans)) changed = mergeList(state.loans, remote.loans) || changed;
    if (Array.isArray(remote.cards)) changed = mergeList(state.cards, remote.cards) || changed;
    if (remote.categories) {
      ['expense', 'income'].forEach(k => {
        const inc = Array.isArray(remote.categories[k]) ? remote.categories[k] : [];
        const have = new Set(state.categories[k]);
        inc.forEach(c => { if (c && !have.has(c)) { state.categories[k].push(c); have.add(c); changed = true; } });
      });
    }
    if (changed) persist();
    return changed;
  }

  /* One read attempt over fetch (normal JSON response). */
  async function fetchDoc(url) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}action=get&t=${Date.now()}`, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('시트 응답이 JSON이 아니에요'); }
    return json;
  }

  /* Fallback read: JSONP through a <script> tag, which browser CORS never blocks. */
  function jsonpDoc(url, timeout) {
    return new Promise((resolve, reject) => {
      const cb = 'loveLedgerCb_' + Math.random().toString(36).slice(2, 10);
      const sep = url.includes('?') ? '&' : '?';
      const script = document.createElement('script');
      let done = false;
      const cleanup = () => {
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('시트 응답이 없어요'));
      }, timeout || 15000);
      window[cb] = data => {
        if (done) return;
        done = true;
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('시트에 연결할 수 없어요'));
      };
      script.src = `${url}${sep}action=get&callback=${cb}&t=${Date.now()}`;
      document.body.appendChild(script);
    });
  }

  /* Fallback write: a hidden form POST (no preflight, no CORS). */
  function formPost(url, json) {
    return new Promise(resolve => {
      const name = 'loveLedgerPost_' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.name = name;
      iframe.style.display = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = name;
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = json;
      form.appendChild(input);
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      try { form.submit(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (form.parentNode) form.parentNode.removeChild(form);
        resolve();
      }, 2600);
    });
  }

  async function readRemote(url) {
    try {
      return await fetchDoc(url);
    } catch (err) {
      // 브라우저가 CORS로 막는 경우 JSONP로 한 번 더 시도
      const json = await jsonpDoc(url);
      return json;
    }
  }

  async function pullRemote(silent) {
    const url = gasUrl();
    if (!url) { if (!silent) toast('먼저 웹앱 URL을 넣어 주세요'); return false; }
    try {
      sync.status = 'syncing';
      renderSyncIndicator();
      const json = await readRemote(url);
      const data = json && (json.data !== undefined ? json.data : json);
      let changed = false;
      if (data) changed = mergeDoc(data);
      sync.status = 'live';
      sync.message = '';
      sync.at = new Date();
      state.settings.lastSyncAt = sync.at.toISOString();
      persist();
      render();
      if (!silent) toast(changed ? '시트에서 새 기록을 받았어요' : '이미 최신이에요');
      return true;
    } catch (err) {
      sync.status = 'error';
      sync.message = String(err && err.message ? err.message : err);
      renderSyncIndicator();
      renderShare();
      if (!silent) toast('불러오기 실패: ' + sync.message);
      return false;
    }
  }

  async function pushRemote(silent) {
    const url = gasUrl();
    if (!url) { if (!silent) toast('먼저 웹앱 URL을 넣어 주세요'); return false; }
    sync.status = 'syncing';
    renderSyncIndicator();
    const doc = payload();
    let ok = false;
    let errMsg = '';
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save', data: doc })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { /* plain text answer is fine */ }
      if (json && json.ok === false) throw new Error(json.error || '시트가 저장을 거부했어요');
      ok = true;
    } catch (err) {
      errMsg = String(err && err.message ? err.message : err);
      // 브라우저가 POST 응답을 막아도, 숨은 폼으로 보낸 뒤 시트를 다시 읽어 확인해요.
      try {
        await formPost(url, JSON.stringify({ action: 'save', data: doc }));
        const back = await readRemote(url);
        const remote = back && (back.data !== undefined ? back.data : back);
        if (remote && remote.updatedAt === doc.updatedAt) {
          ok = true;
        } else {
          errMsg = '시트에 저장됐는지 확인하지 못했어요';
        }
      } catch (err2) {
        errMsg = String(err2 && err2.message ? err2.message : errMsg);
      }
    }

    if (ok) {
      sync.status = 'live';
      sync.message = '';
      sync.at = new Date();
      state.settings.lastSyncAt = sync.at.toISOString();
      persist();
      renderSyncIndicator();
      renderShare();
      if (!silent) toast('시트에 보냈어요');
      return true;
    }
    sync.status = 'error';
    sync.message = errMsg;
    renderSyncIndicator();
    renderShare();
    if (!silent) toast('보내기 실패: ' + sync.message);
    return false;
  }

  function scheduleSync() {
    if (!gasUrl() || !state.settings.autoSync) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(() => { pushRemote(true); }, 1800);
  }

  async function syncBoth() {
    const ok = await pullRemote(true);
    if (!ok) return;
    await pushRemote(false);
  }

  /* ---------------- share tab ---------------- */
  function renderShare() {
    const urlInput = $('#gasUrl');
    if (document.activeElement !== urlInput) urlInput.value = state.settings.gasUrl || '';
    $('#autoSync').checked = !!state.settings.autoSync;

    const tag = $('#syncTag');
    const status = $('#syncStatus');
    tag.classList.remove('live', 'error');
    status.classList.remove('ok', 'error');

    if (!gasUrl()) {
      tag.textContent = '로컬 저장';
      status.textContent = '이 폰에만 저장 중이에요. 아래 URL을 넣으면 와이프 폰과 같은 장부를 봐요.';
    } else if (sync.status === 'error') {
      tag.textContent = '연결 오류';
      tag.classList.add('error');
      status.classList.add('error');
      status.textContent = `연결이 안 돼요 (${sync.message || '알 수 없는 오류'}). 배포 설정의 액세스 권한이 ‘모든 사용자’인지 확인하고, 코드를 고쳤다면 새 버전으로 다시 배포해 주세요.`;
    } else {
      tag.textContent = state.settings.autoSync ? '실시간 공유' : '수동 동기화';
      tag.classList.add('live');
      const at = state.settings.lastSyncAt ? new Date(state.settings.lastSyncAt) : null;
      const when = at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : null;
      status.classList.add('ok');
      status.textContent = when
        ? `마지막 동기화 ${when} · ${state.settings.autoSync ? '기록이 바뀌면 자동으로 시트에 보내요' : '‘보내기’를 누르면 시트에 저장돼요'}`
        : `시트에 연결됐어요. ${state.settings.autoSync ? '기록이 바뀌면 자동으로 보내요' : '‘보내기’로 시트에 저장해요'}`;
    }

    $('#dataCounts').innerHTML = `
      <div class="count-box"><span>수입·지출</span><strong>${entries().length}건</strong></div>
      <div class="count-box"><span>대출</span><strong>${loans().length}건</strong></div>
      <div class="count-box"><span>카드</span><strong>${cards().length}건</strong></div>
      <div class="count-box"><span>분류</span><strong>${state.categories.expense.length + state.categories.income.length}개</strong></div>`;
  }

  /* ---------------- backup ---------------- */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function exportJSON() {
    const data = Object.assign({ exportedAt: nowISO(), app: 'love-ledger' }, payload());
    download(`러브장-백업-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('JSON 파일을 내보냈어요');
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    const rows = [['날짜', '명의', '구분', '분류', '메모', '금액']];
    entries().slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e => {
      rows.push([e.date, ownerName(e.owner), e.type === 'income' ? '수입' : '지출', e.category || '', e.memo || '', e.amount]);
    });
    const csv = '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    download(`러브장-가계부-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV 파일을 내보냈어요');
  }

  function importJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const changed = mergeDoc(data);
        render();
        scheduleSync();
        toast(changed ? '백업을 합쳤어요' : '새로 합칠 기록이 없었어요');
      } catch (e) {
        toast('JSON 파일을 읽지 못했어요');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ---------------- sample data ---------------- */
  function sampleData() {
    const ym = ui.month;
    const [y, m] = ym.split('-').map(Number);
    const prev = shiftMonth(ym, -1);
    const inMonth = (base, day) => `${base}-${pad(Math.min(day, 28))}`;
    const mk = (owner, type, date, amount, category, memo) => ({
      id: uid(), owner, type, date, amount, category, memo, createdAt: nowISO(), updatedAt: nowISO()
    });
    const E = [
      mk('b', 'expense', inMonth(ym, 24), 32000, '장보기', '이마트 장보기'),
      mk('b', 'income', inMonth(ym, 24), 3200000, '사업수입', '에어컨 청소 4건'),
      mk('s', 'expense', inMonth(ym, 23), 48900, '생활용품', '다이소·쿠팡'),
      mk('s', 'income', inMonth(ym, 22), 2450000, '급여', '11월 급여'),
      mk('j', 'expense', inMonth(ym, 20), 780000, '주거·공과금', '관리비+전기+가스'),
      mk('b', 'expense', inMonth(ym, 18), 96000, '교통·주유', '주유'),
      mk('s', 'expense', inMonth(ym, 15), 24500, '외식', '점심'),
      mk('j', 'expense', inMonth(ym, 12), 132000, '통신', '인터넷+휴대폰'),
      mk('b', 'expense', inMonth(ym, 8), 185000, '보험', '실손보험'),
      mk('s', 'expense', inMonth(ym, 5), 39000, '취미', '필라테스'),
      mk('j', 'expense', inMonth(ym, 3), 100000, '경조사', '친구 결혼'),
      mk('b', 'income', inMonth(ym, 1), 450000, '부수입', '중고 판매'),

      mk('j', 'expense', inMonth(prev, 22), 760000, '주거·공과금', '관리비+공과금'),
      mk('b', 'income', inMonth(prev, 24), 2980000, '사업수입', '10월 작업'),
      mk('s', 'income', inMonth(prev, 22), 2450000, '급여', '10월 급여'),
      mk('s', 'expense', inMonth(prev, 14), 212000, '식비', '장보기·외식'),
      mk('b', 'expense', inMonth(prev, 9), 210000, '교통·주유', '주유·주차')
    ];

    const L = [
      {
        id: uid(), owner: 'b', bank: '국민은행 신용대출', principal: 20000000, balance: 12400000,
        rate: 5.2, dueDay: 25, createdAt: nowISO(), updatedAt: nowISO(),
        payments: [
          { id: uid(), date: inMonth(prev, 25), amount: 500000, memo: '10월 자동이체' },
          { id: uid(), date: inMonth(ym, 24), amount: 300000, memo: '11월 자동이체' }
        ]
      },
      {
        id: uid(), owner: 'b', bank: '신한은행 사업자대출', principal: 15000000, balance: 13050000,
        rate: 4.6, dueDay: 15, createdAt: nowISO(), updatedAt: nowISO(),
        payments: [{ id: uid(), date: inMonth(prev, 15), amount: 450000, memo: '10월 이자+원금' }]
      },
      {
        id: uid(), owner: 's', bank: '카카오뱅크 마이너스통장', principal: 5000000, balance: 3200000,
        rate: 6.1, dueDay: 10, createdAt: nowISO(), updatedAt: nowISO(),
        payments: [{ id: uid(), date: inMonth(prev, 10), amount: 200000, memo: '10월 상환' }]
      },
      {
        id: uid(), owner: 'j', bank: '우리은행 전세자금대출', principal: 30000000, balance: 28500000,
        rate: 3.4, dueDay: 5, createdAt: nowISO(), updatedAt: nowISO(),
        payments: []
      }
    ];

    const C = [
      { id: uid(), owner: 'b', issuer: '신한카드', name: 'Deep Dream', amount: 842300, dueDay: 25, paid: false, memo: '생활비 카드', month: ym, createdAt: nowISO(), updatedAt: nowISO() },
      { id: uid(), owner: 'b', issuer: '현대카드', name: 'M Edition3', amount: 310000, dueDay: 14, paid: true, memo: '주유', month: ym, createdAt: nowISO(), updatedAt: nowISO() },
      { id: uid(), owner: 's', issuer: '삼성카드', name: 'taptap O', amount: 654800, dueDay: 26, paid: false, memo: '장보기·쇼핑', month: ym, createdAt: nowISO(), updatedAt: nowISO() },
      { id: uid(), owner: 's', issuer: 'KB국민카드', name: '노리2 체크', amount: 218400, dueDay: 12, paid: true, memo: '', month: ym, createdAt: nowISO(), updatedAt: nowISO() }
    ];

    const Cprev = [
      { id: uid(), owner: 'b', issuer: '신한카드', name: 'Deep Dream', amount: 768000, dueDay: 25, paid: true, memo: '', month: prev, createdAt: nowISO(), updatedAt: nowISO() },
      { id: uid(), owner: 's', issuer: '삼성카드', name: 'taptap O', amount: 592000, dueDay: 26, paid: true, memo: '', month: prev, createdAt: nowISO(), updatedAt: nowISO() }
    ];

    return { entries: E, loans: L, cards: C.concat(Cprev), name: `${monthLabel(ym)} 기준` };
  }

  async function seedSample() {
    const ok = await confirmModal({
      title: '예시 데이터 넣기',
      message: '이번 달과 지난 달 예시 기록(수입·지출 17건, 대출 4건, 카드 6건)을 넣을까요? 지금 기록은 그대로 두고 더해져요.' + (gasUrl() ? ' 구글 시트에도 함께 저장돼요.' : ''),
      confirmText: '넣기',
      danger: false
    });
    if (!ok) return;
    const s = sampleData();
    state.entries.push(...s.entries);
    state.loans.push(...s.loans);
    state.cards.push(...s.cards);
    persist();
    render();
    scheduleSync();
    toast('예시 데이터를 넣었어요. 마음껏 눌러 보세요!');
  }

  async function clearAll() {
    const linked = !!gasUrl();
    const ok = await confirmModal({
      title: '전체 지우기',
      message: `수입·지출, 대출, 카드 기록을 모두 지울까요? 되돌릴 수 없어요.${linked ? '<br><b>구글 시트에 연결되어 있어 와이프 폰에서도 함께 사라져요.</b>' : ''}`,
      confirmText: '모두 지우기'
    });
    if (!ok) return;
    const stamp = nowISO();
    // 삭제 표시를 남겨 두면 연결된 다른 폰에서도 같이 지워져요.
    ['entries', 'loans', 'cards'].forEach(k => {
      state[k].forEach(it => { it.deleted = true; it.updatedAt = stamp; });
    });
    state.categories = { expense: DEFAULT_CATS.expense.slice(), income: DEFAULT_CATS.income.slice() };
    ui.entry.editingId = null;
    persist();
    render();
    scheduleSync();
    toast('모두 지웠어요');
  }

  /* ---------------- Apps Script code ---------------- */
  const CODE_GS = [
    "/**",
    " * 선빈♡병철 러브장 — 구글 시트 저장소",
    " * 1) 이 코드를 모두 붙여넣고 저장",
    " * 2) 배포 → 새 배포 → 웹 앱",
    " *    실행 계정: 나 / 액세스 권한: 모든 사용자",
    " * 3) 나온 웹 앱 URL을 러브장 ‘공유·관리’에 붙여넣기",
    " */",
    "var SHEET_NAME = 'LOVE_DB';",
    "var CHUNK = 40000; // 셀 하나에 담을 글자 수",
    "",
    "function getSheet_() {",
    "  var ss = SpreadsheetApp.getActiveSpreadsheet();",
    "  var sh = ss.getSheetByName(SHEET_NAME);",
    "  if (!sh) {",
    "    sh = ss.insertSheet(SHEET_NAME);",
    "    sh.hideSheet();",
    "  }",
    "  return sh;",
    "}",
    "",
    "function readData_() {",
    "  var sh = getSheet_();",
    "  var last = sh.getLastRow();",
    "  if (last < 1) return { ok: true, data: null };",
    "  var values = sh.getRange(1, 1, last, 1).getValues();",
    "  var json = values.map(function (row) { return row[0]; }).join('');",
    "  if (!json) return { ok: true, data: null };",
    "  return { ok: true, data: JSON.parse(json), savedAt: new Date().toISOString() };",
    "}",
    "",
    "function writeData_(data) {",
    "  var sh = getSheet_();",
    "  var json = JSON.stringify(data);",
    "  var chunks = [];",
    "  for (var i = 0; i < json.length; i += CHUNK) {",
    "    chunks.push([json.slice(i, i + CHUNK)]);",
    "  }",
    "  if (!chunks.length) chunks.push(['']);",
    "  sh.clear();",
    "  sh.getRange(1, 1, chunks.length, 1).setValues(chunks);",
    "  return { ok: true, savedAt: new Date().toISOString(), bytes: json.length };",
    "}",
    "",
    "function out_(result, callback) {",
    "  var json = JSON.stringify(result).replace(/</g, '\\\\u003c');",
    "  if (callback) {",
    "    // JSONP: 브라우저 보안 설정이 까다로울 때도 읽을 수 있게 해 줍니다.",
    "    var safe = String(callback).replace(/[^A-Za-z0-9_.]/g, '');",
    "    return ContentService.createTextOutput(safe + '(' + json + ')')",
    "      .setMimeType(ContentService.MimeType.JAVASCRIPT);",
    "  }",
    "  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);",
    "}",
    "",
    "function doGet(e) {",
    "  var cb = e && e.parameter && e.parameter.callback;",
    "  try {",
    "    var action = (e && e.parameter && e.parameter.action) || 'get';",
    "    if (action === 'get') return out_(readData_(), cb);",
    "    if (action === 'ping') return out_({ ok: true, pong: true, at: new Date().toISOString() }, cb);",
    "    return out_({ ok: false, error: 'unknown action: ' + action }, cb);",
    "  } catch (err) {",
    "    return out_({ ok: false, error: String(err) }, cb);",
    "  }",
    "}",
    "",
    "function doPost(e) {",
    "  var lock = LockService.getScriptLock();",
    "  try {",
    "    lock.waitLock(10000);",
    "    var body;",
    "    if (e && e.parameter && e.parameter.payload) {",
    "      // 숨은 iframe 폼으로 보낸 경우",
    "      body = { action: 'save', data: JSON.parse(e.parameter.payload) };",
    "    } else {",
    "      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');",
    "    }",
    "    if (body.action === 'save') {",
    "      if (!body.data) return out_({ ok: false, error: 'no data' });",
    "      return out_(writeData_(body.data));",
    "    }",
    "    return out_({ ok: false, error: 'unknown action' });",
    "  } catch (err) {",
    "    return out_({ ok: false, error: String(err) });",
    "  } finally {",
    "    try { lock.releaseLock(); } catch (ignore) {}",
    "  }",
    "}",
    ""
  ].join('\n');

  /* ---------------- events ---------------- */
  function bindEvents() {
    // tabs
    $$('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    document.addEventListener('click', ev => {
      const g = ev.target.closest('[data-goto]');
      if (g) { setTab(g.dataset.goto); return; }
    });

    // month bars
    $('#homePrev').addEventListener('click', () => setMonth(shiftMonth(ui.month, -1)));
    $('#homeNext').addEventListener('click', () => setMonth(shiftMonth(ui.month, 1)));
    $('#homeToday').addEventListener('click', () => setMonth(thisMonth()));
    $('#ledgerPrev').addEventListener('click', () => setMonth(shiftMonth(ui.month, -1)));
    $('#ledgerNext').addEventListener('click', () => setMonth(shiftMonth(ui.month, 1)));
    $('#ledgerToday').addEventListener('click', () => setMonth(thisMonth()));
    $('#cardPrev').addEventListener('click', () => setMonth(shiftMonth(ui.month, -1)));
    $('#cardNext').addEventListener('click', () => setMonth(shiftMonth(ui.month, 1)));
    $('#cardToday').addEventListener('click', () => setMonth(thisMonth()));

    // entry form
    $('#entryOwner').addEventListener('click', ev => {
      const b = ev.target.closest('[data-owner]');
      if (!b) return;
      ui.entry.owner = b.dataset.owner;
      renderLedger();
    });
    $('#entryType').addEventListener('click', ev => {
      const b = ev.target.closest('[data-type]');
      if (!b) return;
      ui.entry.type = b.dataset.type;
      // keep a sensible category per type
      const cats = state.categories[ui.entry.type];
      if (!cats.includes(ui.entry.cat[ui.entry.type])) ui.entry.cat[ui.entry.type] = cats[0];
      renderLedger();
    });
    $('#entryDate').value = todayISO();
    $('#entryAmount').addEventListener('input', () => {
      const el = $('#entryAmount');
      const raw = toNum(el.value);
      el.value = raw ? commas(raw) : '';
    });
    $('#quickRow').addEventListener('click', ev => {
      const add = ev.target.closest('[data-add]');
      const clr = ev.target.closest('[data-clear]');
      const el = $('#entryAmount');
      if (add) el.value = commas(toNum(el.value) + Number(add.dataset.add));
      if (clr) el.value = '';
      if (add || clr) el.focus();
    });
    $('#entryCategory').addEventListener('change', ev => {
      ui.entry.cat[ui.entry.type] = ev.target.value;
    });
    $('#addCatBtn').addEventListener('click', () => {
      const box = $('#catInline');
      box.hidden = !box.hidden;
      if (!box.hidden) $('#newCatInput').focus();
    });
    $('#newCatCancel').addEventListener('click', () => {
      $('#catInline').hidden = true;
      $('#newCatInput').value = '';
    });
    const addCat = () => {
      const name = $('#newCatInput').value.trim();
      if (!name) { $('#newCatInput').focus(); return; }
      const type = ui.entry.type;
      if (!state.categories[type].includes(name)) state.categories[type].push(name);
      ui.entry.cat[type] = name;
      persist();
      $('#newCatInput').value = '';
      $('#catInline').hidden = true;
      renderLedger();
      scheduleSync();
      toast(`‘${name}’ 분류를 추가했어요`);
    };
    $('#newCatSave').addEventListener('click', addCat);
    $('#newCatInput').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); addCat(); } });

    $('#entrySave').addEventListener('click', saveEntry);
    $('#entryCancel').addEventListener('click', () => { resetEntryForm(true); render(); });

    $('#entryList').addEventListener('click', ev => {
      const ed = ev.target.closest('[data-edit]');
      const del = ev.target.closest('[data-del]');
      if (ed) editEntry(ed.dataset.edit);
      if (del) deleteEntry(del.dataset.del);
    });

    $('#ownerFilter').addEventListener('click', ev => {
      const b = ev.target.closest('[data-owner]');
      if (!b) return;
      ui.ownerFilter = b.dataset.owner;
      renderLedger();
    });
    $('#typeFilter').addEventListener('click', ev => {
      const b = ev.target.closest('[data-type]');
      if (!b) return;
      ui.typeFilter = b.dataset.type;
      renderLedger();
    });

    // loans
    $('#addLoanBtn').addEventListener('click', () => openLoanForm(null));
    $('#welcomeSeed').addEventListener('click', seedSample);
    $('#loanList').addEventListener('click', ev => {
      const pay = ev.target.closest('[data-pay]');
      const ed = ev.target.closest('[data-loan-edit]');
      const del = ev.target.closest('[data-loan-del]');
      const hist = ev.target.closest('[data-history]');
      if (pay) openPaymentModal(pay.dataset.pay);
      else if (ed) openLoanForm(ed.dataset.loanEdit);
      else if (del) deleteLoan(del.dataset.loanDel);
      else if (hist) {
        const id = hist.dataset.history;
        if (ui.openHistory.has(id)) ui.openHistory.delete(id); else ui.openHistory.add(id);
        renderLoans();
      }
    });

    // cards
    $('#addCardBtn').addEventListener('click', () => openCardForm(null));
    $('#cardList').addEventListener('click', ev => {
      const ed = ev.target.closest('[data-card-edit]');
      const del = ev.target.closest('[data-card-del]');
      if (ed) openCardForm(ed.dataset.cardEdit);
      if (del) deleteCard(del.dataset.cardDel);
    });
    $('#cardList').addEventListener('change', ev => {
      const cb = ev.target.closest('[data-paid]');
      if (!cb) return;
      const c = cardById(cb.dataset.paid);
      if (!c) return;
      c.paid = cb.checked;
      c.updatedAt = nowISO();
      persist();
      render();
      scheduleSync();
      toast(cb.checked ? '납부 완료로 표시했어요' : '미납으로 되돌렸어요');
    });

    // modal
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', ev => { if (ev.target === $('#modalBackdrop')) closeModal(); });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal();
    });

    // share tab
    $('#saveUrlBtn').addEventListener('click', async () => {
      const url = $('#gasUrl').value.trim();
      if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec/.test(url)) {
        toast('https://script.google.com/macros/s/…/exec 주소를 넣어 주세요');
        return;
      }
      state.settings.gasUrl = url;
      persist();
      renderSyncIndicator();
      renderShare();
      if (url) {
        const ok = await pullRemote(true);
        toast(ok ? '저장하고 시트에 연결했어요' : '저장했어요. 연결은 아직 안 돼요');
      } else {
        toast('URL을 지웠어요. 이제 이 폰에만 저장돼요');
      }
    });
    $('#pullBtn').addEventListener('click', () => pullRemote(false));
    $('#pushBtn').addEventListener('click', () => syncBoth());
    $('#autoSync').addEventListener('change', ev => {
      state.settings.autoSync = ev.target.checked;
      persist();
      renderShare();
      renderSyncIndicator();
      toast(ev.target.checked ? '자동 전송을 켰어요' : '자동 전송을 껐어요');
    });

    $('#copyCodeBtn').addEventListener('click', async () => {
      const btn = $('#copyCodeBtn');
      let ok = false;
      try {
        await navigator.clipboard.writeText(CODE_GS);
        ok = true;
      } catch (e) {
        try {
          const ta = document.createElement('textarea');
          ta.value = CODE_GS;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand('copy');
          ta.remove();
        } catch (e2) { ok = false; }
      }
      btn.textContent = ok ? '복사됨!' : '복사 실패';
      btn.classList.toggle('copied', ok);
      toast(ok ? 'Code.gs 코드를 복사했어요' : '길게 눌러 직접 복사해 주세요');
      setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 2200);
    });

    $('#exportJson').addEventListener('click', exportJSON);
    $('#exportCsv').addEventListener('click', exportCSV);
    $('#importJsonBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0];
      if (f) importJSONFile(f);
      ev.target.value = '';
    });
    $('#seedBtn').addEventListener('click', seedSample);
    $('#clearBtn').addEventListener('click', clearAll);

    // resync when the app comes back to the foreground
    let lastFocusPull = 0;
    const maybePull = () => {
      if (!gasUrl()) return;
      if (Date.now() - lastFocusPull < 20000) return;
      lastFocusPull = Date.now();
      pullRemote(true);
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) maybePull(); });
    window.addEventListener('focus', maybePull);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    $('#codeBlock').innerHTML = '<code></code>';
    $('#codeBlock').querySelector('code').textContent = CODE_GS;
    bindEvents();
    setTab('home');
    if (gasUrl()) {
      // initial pull, quietly
      setTimeout(() => pullRemote(true), 400);
    }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline shell simply unavailable */ });
    }
  }

  // small debug/verification surface (read-only)
  window.LoveLedger = {
    state: () => JSON.parse(JSON.stringify(state)),
    ui: () => JSON.parse(JSON.stringify({ tab: ui.tab, month: ui.month })),
    code: CODE_GS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
