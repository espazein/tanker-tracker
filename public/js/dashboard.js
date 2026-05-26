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

  let currentPage = 1;
  let hasMore = false;

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
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
  }

  async function loadStats() {
    try {
      const r = await fetch('/api/dashboard/stats');
      const d = await r.json();

      statToday.textContent   = d.today_total;
      statWeek.textContent    = d.week_total;
      statMonth.textContent   = d.month_total;
      statAlltime.textContent = d.all_time_total;

      renderVendors(d.by_vendor_today);
      renderTrend(d.daily_trend);
      renderEntries(d.recent_entries, true);

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
    const today = new Date().toISOString().slice(0, 10);

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

  // Auto-refresh every 60s
  loadStats();
  setInterval(loadStats, 60000);
})();
