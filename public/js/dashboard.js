(() => {
  const statToday   = document.getElementById('stat-today');
  const statWeek    = document.getElementById('stat-week');
  const statMonth   = document.getElementById('stat-month');
  const statAlltime = document.getElementById('stat-alltime');
  const vendorList  = document.getElementById('vendor-list');
  const trendChart  = document.getElementById('trend-chart');
  const entriesList = document.getElementById('entries-list');
  const lastUpdated = document.getElementById('last-updated');
  const lightbox    = document.getElementById('lightbox');
  const lbImg       = document.getElementById('lb-img');
  const lbMeta      = document.getElementById('lb-meta');
  const lbClose     = document.getElementById('lb-close');

  const filterBar     = document.querySelector('.filter-bar');
  const customRange   = document.getElementById('custom-range');
  const rangeFrom     = document.getElementById('range-from');
  const rangeTo       = document.getElementById('range-to');
  const btnApplyRange = document.getElementById('btn-apply-range');
  const filterSummary = document.getElementById('filter-summary');
  const filterVendors = document.getElementById('filter-vendors');
  const deliveriesPager = document.getElementById('deliveries-pager');
  const btnDelPrev      = document.getElementById('btn-deliveries-prev');
  const btnDelNext      = document.getElementById('btn-deliveries-next');
  const delPageInfo     = document.getElementById('deliveries-page-info');

  let currentRange = null; // { from, to, label, preset, page }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs  < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function shortDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00'); // parse as local, not UTC
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
  }

  // Local YYYY-MM-DD (not UTC, so the "today" trend bar highlights correctly)
  function localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function loadStats() {
    try {
      const r = await fetch(`/api/dashboard/stats?tzOffset=${new Date().getTimezoneOffset()}`);
      const d = await r.json();

      statToday.textContent   = d.today_total;
      statWeek.textContent    = d.week_total;
      statMonth.textContent   = d.month_total;
      statAlltime.textContent = d.all_time_total;

      renderVendors(d.by_vendor_today);
      renderTrend(d.daily_trend);

      lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}`;
    } catch (e) {
      console.error('Stats load failed', e);
    }
  }

  function renderVendors(vendors) {
    if (!vendors.length) {
      vendorList.innerHTML = '<div class="empty-state">No deliveries today yet</div>';
      return;
    }
    const max = vendors[0].count;
    vendorList.innerHTML = vendors.map(v => `
      <div class="vendor-row">
        <span class="vendor-name">${escHtml(v.vendor_name)}</span>
        <div class="vendor-bar-wrap">
          <div class="vendor-bar" style="width:${(v.count/max*100).toFixed(0)}%"></div>
        </div>
        <span class="vendor-count">${v.count}</span>
      </div>
    `).join('');
  }

  function renderTrend(trend) {
    if (!trend.length) { trendChart.innerHTML = '<div class="empty-state">No data</div>'; return; }
    const max = Math.max(...trend.map(t => t.count), 1);
    const today = localDateStr();

    trendChart.innerHTML = trend.map(t => {
      const pct = (t.count / max * 88).toFixed(0);
      const isToday = t.day === today;
      return `
        <div class="trend-bar-wrap">
          <div class="trend-val">${t.count}</div>
          <div class="trend-bar ${isToday ? 'today' : ''}" style="height:${pct}px"></div>
          <div class="trend-label">${shortDay(t.day)}</div>
        </div>
      `;
    }).join('');
  }

  function renderEntries(entries, reset = false) {
    if (reset) {
      if (!entries.length) {
        entriesList.innerHTML = '<div class="empty-state">No entries yet</div>';
        return;
      }
      entriesList.innerHTML = '';
    }

    entries.forEach(e => {
      const card = document.createElement('div');
      card.className = 'entry-card';

      const thumbHtml = e.photo_path
        ? `<img class="entry-thumb" src="/uploads/${escHtml(e.photo_path)}" alt="Tanker" loading="lazy" data-entry='${JSON.stringify({vendor:e.vendor_name, plate:e.plate_number, ts:e.submitted_at, exif:e.exif_timestamp, lat:e.gps_lat, lng:e.gps_lng, photo:e.photo_path})}'>`
        : `<div class="entry-thumb-placeholder">🚛</div>`;

      const tags = [];
      if (e.plate_number) {
        tags.push(`<span class="tag tag-plate">🔢 ${escHtml(e.plate_number)}</span>`);
        if (e.plate_auto_detected) tags.push(`<span class="tag tag-auto">✨ AI detected</span>`);
      }
      if (e.gps_lat) tags.push(`<span class="tag tag-gps">📍 GPS</span>`);

      const displayTs = e.exif_timestamp
        ? `📷 ${new Date(e.exif_timestamp).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · `
        : '';

      card.innerHTML = `
        ${thumbHtml}
        <div class="entry-body">
          <div class="entry-vendor">${escHtml(e.vendor_name)}</div>
          ${tags.length ? `<div class="entry-tags">${tags.join('')}</div>` : ''}
          <div class="entry-time">${displayTs}${timeAgo(e.submitted_at)}</div>
        </div>
      `;
      entriesList.appendChild(card);
    });

    // Attach lightbox handlers
    entriesList.querySelectorAll('.entry-thumb[data-entry]').forEach(img => {
      img.addEventListener('click', () => openLightbox(JSON.parse(img.dataset.entry)));
    });
  }

  function openLightbox(entry) {
    lbImg.src = `/uploads/${encodeURIComponent(entry.photo)}`;
    let meta = `<strong>${escHtml(entry.vendor)}</strong>`;
    if (entry.plate) meta += ` &nbsp;·&nbsp; 🔢 ${escHtml(entry.plate)}`;
    if (entry.exif) meta += `<br>📷 ${new Date(entry.exif).toLocaleString('en-IN')}`;
    if (entry.lat) meta += `<br>📍 ${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)}`;
    lbMeta.innerHTML = meta;
    lightbox.classList.remove('hidden');
  }

  lbClose.addEventListener('click', () => lightbox.classList.add('hidden'));
  document.getElementById('lightbox').querySelector('.lightbox-bg').addEventListener('click', () => lightbox.classList.add('hidden'));

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Date filter ─────────────────────────────────────────────────────────────
  // Compute a [from, to) epoch-ms range for a preset, in local time. Ranges
  // match the stat cards: week = last 7 days, month = since the 1st.
  function rangeFor(preset) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (preset === 'today') return [today.getTime(), tomorrow.getTime(), 'Today'];
    if (preset === 'week') {
      // Current calendar week, starting Monday → through today.
      const sinceMon = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
      const mon = new Date(today); mon.setDate(today.getDate() - sinceMon);
      return [mon.getTime(), tomorrow.getTime(), 'This Week'];
    }
    if (preset === 'month') { const s = new Date(today); s.setDate(1); return [s.getTime(), tomorrow.getTime(), 'This Month']; }
    return null;
  }

  function renderFilterVendors(vendors) {
    if (!vendors || !vendors.length) { filterVendors.innerHTML = ''; return; }
    const max = vendors[0].count;
    filterVendors.innerHTML = vendors.map(v => `
      <div class="vendor-row">
        <span class="vendor-name">${escHtml(v.vendor_name)}</span>
        <div class="vendor-bar-wrap">
          <div class="vendor-bar" style="width:${(v.count / max * 100).toFixed(0)}%"></div>
        </div>
        <span class="vendor-count">${v.count}</span>
      </div>
    `).join('');
  }

  // Render the current range (reads currentRange, incl. its page).
  async function applyRange() {
    if (!currentRange) return;
    const { from, to, label, page } = currentRange;
    try {
      const r = await fetch(`/api/dashboard/range?from=${from}&to=${to}&page=${page}`);
      const d = await r.json();
      const noun = d.total === 1 ? 'delivery' : 'deliveries';
      filterSummary.textContent = `${d.total} ${noun} · ${label}`;
      renderFilterVendors(d.by_vendor);
      renderEntries(d.entries, true);

      const totalPages = Math.max(1, Math.ceil(d.total / d.limit));
      deliveriesPager.classList.toggle('hidden', totalPages <= 1);
      btnDelPrev.disabled = page <= 1;
      btnDelNext.disabled = page >= totalPages;
      delPageInfo.textContent = `Page ${page} of ${totalPages}`;
    } catch (e) {
      console.error('Range load failed', e);
    }
  }

  // Select a new range (resets to page 1).
  function setRange(range) {
    currentRange = { ...range, page: 1 };
    applyRange();
  }

  function refreshFilter() {
    if (!currentRange) return;
    // Keep presets current (they shift at midnight); custom stays fixed.
    if (currentRange.preset && currentRange.preset !== 'custom') {
      const [from, to, label] = rangeFor(currentRange.preset);
      currentRange = { ...currentRange, from, to, label };
    }
    applyRange();
  }

  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const preset = btn.dataset.range;
    if (preset === 'custom') { customRange.classList.remove('hidden'); return; }
    customRange.classList.add('hidden');
    const [from, to, label] = rangeFor(preset);
    setRange({ from, to, label, preset });
  });

  btnApplyRange.addEventListener('click', () => {
    if (!rangeFrom.value || !rangeTo.value) { filterSummary.textContent = 'Pick both From and To dates.'; return; }
    const f = new Date(rangeFrom.value + 'T00:00:00');
    const t = new Date(rangeTo.value + 'T00:00:00'); t.setDate(t.getDate() + 1); // include the To day
    if (t.getTime() <= f.getTime()) { filterSummary.textContent = 'To date must be on or after From date.'; return; }
    const label = `${rangeFrom.value} → ${rangeTo.value}`;
    setRange({ from: f.getTime(), to: t.getTime(), label, preset: 'custom' });
  });

  btnDelPrev.addEventListener('click', () => {
    if (currentRange && currentRange.page > 1) { currentRange.page--; applyRange(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  btnDelNext.addEventListener('click', () => {
    if (currentRange) { currentRange.page++; applyRange(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  // ── Init + auto-refresh ─────────────────────────────────────────────────────
  (function init() {
    const [from, to, label] = rangeFor('week');   // default view: This Week
    currentRange = { from, to, label, preset: 'week', page: 1 };
    loadStats();
    applyRange();
  })();

  setInterval(() => { loadStats(); refreshFilter(); }, 60000);
})();
