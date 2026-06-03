(() => {
  let adminPin = sessionStorage.getItem('admin_pin') || '';

  const pinScreen    = document.getElementById('pin-screen');
  const adminContent = document.getElementById('admin-content');
  const pinInput     = document.getElementById('pin-input');
  const btnPinSubmit = document.getElementById('btn-pin-submit');
  const pinError     = document.getElementById('pin-error');

  // ── Auth ───────────────────────────────────────────────────────────────────
  function apiFetch(path, opts = {}) {
    const headers = { 'X-Admin-Pin': adminPin, ...(opts.headers || {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(path, { ...opts, headers });
  }

  async function tryUnlock(pin) {
    const r = await fetch('/api/admin/settings', { headers: { 'X-Admin-Pin': pin } });
    return r.status !== 401 && r.status !== 403 && r.status !== 500;
  }

  async function unlock() {
    const pin = pinInput.value.trim();
    if (!pin) return;
    btnPinSubmit.disabled = true;
    btnPinSubmit.textContent = 'Checking…';
    pinError.classList.add('hidden');

    if (await tryUnlock(pin)) {
      adminPin = pin;
      sessionStorage.setItem('admin_pin', pin);
      pinScreen.classList.add('hidden');
      adminContent.classList.remove('hidden');
      loadAll();
    } else {
      pinError.textContent = 'Invalid PIN. Try again.';
      pinError.classList.remove('hidden');
    }
    btnPinSubmit.disabled = false;
    btnPinSubmit.textContent = 'Unlock';
  }

  btnPinSubmit.addEventListener('click', unlock);
  pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });

  if (adminPin) {
    tryUnlock(adminPin).then(ok => {
      if (ok) {
        pinScreen.classList.add('hidden');
        adminContent.classList.remove('hidden');
        loadAll();
      } else {
        sessionStorage.removeItem('admin_pin');
        adminPin = '';
      }
    });
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
      if (btn.dataset.tab === 'entries') loadEntries();
    });
  });

  // ── Devices ────────────────────────────────────────────────────────────────
  const devicesList     = document.getElementById('devices-list');
  const btnAddDevice    = document.getElementById('btn-add-device');
  const addDeviceForm   = document.getElementById('add-device-form');
  const newDeviceLabel  = document.getElementById('new-device-label');
  const newDeviceId     = document.getElementById('new-device-id');
  const btnSaveDevice   = document.getElementById('btn-save-device');
  const btnCancelDevice = document.getElementById('btn-cancel-device');
  const newDeviceResult = document.getElementById('new-device-result');

  async function loadDevices() {
    devicesList.innerHTML = '<div class="empty-state">Loading…</div>';
    const r = await apiFetch('/api/admin/devices');
    const d = await r.json();
    if (!d.devices?.length) {
      devicesList.innerHTML = '<div class="empty-state">No devices registered yet. Add one to allow submissions.</div>';
      return;
    }
    devicesList.innerHTML = d.devices.map(dev => `
      <div class="device-row ${dev.is_active ? '' : 'inactive'}" data-id="${dev.id}">
        <div class="device-info-block">
          <div class="device-name">${escHtml(dev.label || 'Unnamed device')}</div>
          <div class="device-code">${escHtml(dev.device_id)}</div>
          <div class="device-meta">
            Added ${timeAgo(dev.created_at)} ·
            ${dev.is_active
              ? '<span class="badge badge-active">Active</span>'
              : '<span class="badge badge-inactive">Inactive</span>'}
          </div>
        </div>
        <div class="device-actions">
          <button class="btn btn-sm ${dev.is_active ? 'btn-outline' : 'btn-success'}"
                  data-action="toggle" data-active="${dev.is_active}">
            ${dev.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn btn-sm btn-danger" data-action="delete">Delete</button>
        </div>
      </div>
    `).join('');
  }

  devicesList.addEventListener('click', async e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.dataset.action === 'toggle') {
      const active = e.target.dataset.active === '1';
      await apiFetch(`/api/admin/devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: active ? 0 : 1 })
      });
      loadDevices();
    } else if (e.target.dataset.action === 'delete') {
      if (!confirm('Delete this device? The guard will no longer be able to submit entries.')) return;
      await apiFetch(`/api/admin/devices/${id}`, { method: 'DELETE' });
      loadDevices();
    }
  });

  btnAddDevice.addEventListener('click', () => {
    addDeviceForm.classList.toggle('hidden');
    newDeviceResult.classList.add('hidden');
    if (!addDeviceForm.classList.contains('hidden')) newDeviceLabel.focus();
  });

  btnCancelDevice.addEventListener('click', () => {
    addDeviceForm.classList.add('hidden');
    newDeviceLabel.value = '';
    newDeviceId.value = '';
    newDeviceResult.classList.add('hidden');
  });

  btnSaveDevice.addEventListener('click', async () => {
    btnSaveDevice.disabled = true;
    const body = { label: newDeviceLabel.value.trim() };
    if (newDeviceId.value.trim()) body.device_id = newDeviceId.value.trim();

    const r = await apiFetch('/api/admin/devices', { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json();
    btnSaveDevice.disabled = false;

    if (r.ok) {
      newDeviceResult.className = 'new-device-result success';
      newDeviceResult.innerHTML = `
        <strong>Device created!</strong>
        Share this access code with the guard:<br>
        <span class="token-display">${escHtml(d.device.device_id)}</span>
        <button class="btn btn-sm btn-outline" id="btn-copy-token">Copy</button>
      `;
      newDeviceResult.classList.remove('hidden');
      document.getElementById('btn-copy-token').addEventListener('click', () => {
        navigator.clipboard?.writeText(d.device.device_id).catch(() => {});
      });
      newDeviceLabel.value = '';
      newDeviceId.value = '';
      loadDevices();
    } else {
      newDeviceResult.className = 'new-device-result error';
      newDeviceResult.textContent = d.error || 'Failed to create device';
      newDeviceResult.classList.remove('hidden');
    }
  });

  // ── Log Entry (admin-side submission) ──────────────────────────────────────
  const btnLogCamera   = document.getElementById('btn-log-camera');
  const btnLogGallery  = document.getElementById('btn-log-gallery');
  const logInputCamera = document.getElementById('log-input-camera');
  const logInputGallery= document.getElementById('log-input-gallery');
  const logPreview     = document.getElementById('log-preview');
  const logPlaceholder = document.getElementById('log-placeholder');
  const logPhotoMeta   = document.getElementById('log-photo-meta');
  const logVendor      = document.getElementById('log-vendor');
  const logPlate       = document.getElementById('log-plate');
  const logNotes       = document.getElementById('log-notes');
  const btnLogSubmit   = document.getElementById('btn-log-submit');
  const logStatus      = document.getElementById('log-status');

  let logSelectedFile = null;

  // compressImage is provided by /js/photo.js (preserves EXIF through compression)
  async function handleLogFile(file) {
    if (!file) return;
    logPreview.src = URL.createObjectURL(file);
    logPreview.classList.remove('hidden');
    logPlaceholder.classList.add('hidden');
    logPhotoMeta.classList.remove('hidden');
    logPhotoMeta.textContent = '⏳ Optimising photo…';
    try {
      const blob = await compressImage(file);
      logSelectedFile = new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      logPhotoMeta.textContent = `📐 ${Math.round(logSelectedFile.size / 1024)} KB · ready`;
    } catch {
      logSelectedFile = file;
      logPhotoMeta.textContent = '⚠️ Could not optimise; sending original';
    }
    updateLogSubmitBtn();
  }

  btnLogCamera.addEventListener('click',  () => logInputCamera.click());
  btnLogGallery.addEventListener('click', () => logInputGallery.click());
  logInputCamera.addEventListener('change',  e => handleLogFile(e.target.files[0]));
  logInputGallery.addEventListener('change', e => handleLogFile(e.target.files[0]));
  [logVendor, logPlate].forEach(el => el.addEventListener('input', updateLogSubmitBtn));

  function updateLogSubmitBtn() {
    btnLogSubmit.disabled = !(logSelectedFile && logVendor.value.trim() && logPlate.value.trim());
  }

  btnLogSubmit.addEventListener('click', async () => {
    btnLogSubmit.disabled = true;
    btnLogSubmit.textContent = 'Submitting…';
    logStatus.classList.add('hidden');

    const fd = new FormData();
    fd.append('photo', logSelectedFile);
    fd.append('vendor_name', logVendor.value.trim());
    fd.append('plate_number', logPlate.value.trim().toUpperCase());
    if (logNotes.value.trim()) fd.append('notes', logNotes.value.trim());

    try {
      const r = await fetch('/api/admin/entries', {
        method: 'POST',
        headers: { 'X-Admin-Pin': adminPin },
        body: fd
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showStatus(logStatus, '✅ Entry logged successfully', 'success');
        resetLogForm();
      } else {
        showStatus(logStatus, `❌ ${d.error || 'Failed to log entry'}`, 'error');
      }
    } catch {
      showStatus(logStatus, '❌ Network error — please try again', 'error');
    }

    btnLogSubmit.disabled = false;
    btnLogSubmit.textContent = 'Submit Entry';
    updateLogSubmitBtn();
  });

  function resetLogForm() {
    logSelectedFile = null;
    logPreview.classList.add('hidden');
    logPlaceholder.classList.remove('hidden');
    logPhotoMeta.classList.add('hidden');
    logVendor.value = ''; logPlate.value = ''; logNotes.value = '';
    logInputCamera.value = ''; logInputGallery.value = '';
    updateLogSubmitBtn();
  }

  // ── Entries ────────────────────────────────────────────────────────────────
  const entriesListAdmin = document.getElementById('entries-list-admin');
  const entriesCount     = document.getElementById('entries-count');
  const entriesPager     = document.getElementById('entries-pager');
  const btnPrevPage      = document.getElementById('btn-prev-page');
  const btnNextPage      = document.getElementById('btn-next-page');
  const pageInfo         = document.getElementById('page-info');

  let entriesPage = 1;

  async function loadEntries() {
    entriesListAdmin.innerHTML = '<div class="empty-state">Loading…</div>';
    const r = await apiFetch(`/api/admin/entries?page=${entriesPage}`);
    const d = await r.json();

    if (!d.entries?.length) {
      entriesListAdmin.innerHTML = '<div class="empty-state">No entries yet.</div>';
      entriesCount.textContent = '';
      entriesPager.classList.add('hidden');
      return;
    }

    entriesCount.textContent = `${d.total} total`;
    entriesListAdmin.innerHTML = d.entries.map(e => {
      const when = new Date(e.submitted_at).toLocaleString('en-IN',
        { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="entry-admin-row" data-id="${e.id}">
          ${e.photo_path
            ? `<img class="entry-admin-thumb" src="/uploads/${escHtml(e.photo_path)}" alt="">`
            : `<div class="entry-admin-thumb-ph">🚛</div>`}
          <div class="entry-admin-info">
            <div class="entry-admin-vendor">${escHtml(e.vendor_name)}</div>
            <div class="entry-admin-meta">
              🔢 ${escHtml(e.plate_number || '—')} · ${when}
              ${e.is_duplicate ? ' · <span class="badge badge-inactive">duplicate</span>' : ''}
            </div>
          </div>
          <button class="btn btn-sm btn-danger" data-action="delete-entry">Delete</button>
        </div>`;
    }).join('');

    const totalPages = Math.max(1, Math.ceil(d.total / d.limit));
    entriesPager.classList.toggle('hidden', totalPages <= 1);
    btnPrevPage.disabled = entriesPage <= 1;
    btnNextPage.disabled = entriesPage >= totalPages;
    pageInfo.textContent = `Page ${entriesPage} of ${totalPages}`;
  }

  entriesListAdmin.addEventListener('click', async e => {
    if (e.target.dataset.action !== 'delete-entry') return;
    const row = e.target.closest('[data-id]');
    if (!row) return;
    if (!confirm('Delete this entry? The photo will also be removed permanently.')) return;
    e.target.disabled = true;
    e.target.textContent = 'Deleting…';
    const r = await apiFetch(`/api/admin/entries/${row.dataset.id}`, { method: 'DELETE' });
    if (r.ok) loadEntries();
    else { e.target.disabled = false; e.target.textContent = 'Delete'; alert('Failed to delete'); }
  });

  btnPrevPage.addEventListener('click', () => { if (entriesPage > 1) { entriesPage--; loadEntries(); } });
  btnNextPage.addEventListener('click', () => { entriesPage++; loadEntries(); });

  // ── Geofence ───────────────────────────────────────────────────────────────
  const fenceLat       = document.getElementById('fence-lat');
  const fenceLng       = document.getElementById('fence-lng');
  const fenceRadius    = document.getElementById('fence-radius');
  const btnSaveGeo     = document.getElementById('btn-save-geofence');
  const btnClearGeo    = document.getElementById('btn-clear-geofence');
  const geofenceStatus = document.getElementById('geofence-status');

  async function loadSettings() {
    const r = await apiFetch('/api/admin/settings');
    const d = await r.json();
    if (d.settings) {
      fenceLat.value    = d.settings.geofence_lat    || '';
      fenceLng.value    = d.settings.geofence_lng    || '';
      fenceRadius.value = d.settings.geofence_radius_m || '';
    }
  }

  btnSaveGeo.addEventListener('click', async () => {
    const lat    = parseFloat(fenceLat.value);
    const lng    = parseFloat(fenceLng.value);
    const radius = parseFloat(fenceRadius.value);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius <= 0) {
      showStatus(geofenceStatus, 'Enter valid latitude, longitude, and a positive radius.', 'error');
      return;
    }
    const r = await apiFetch('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ geofence_lat: lat, geofence_lng: lng, geofence_radius_m: radius })
    });
    const d = await r.json();
    showStatus(geofenceStatus,
      r.ok ? `Saved: ${lat}, ${lng} within ±${radius}m` : (d.error || 'Save failed'),
      r.ok ? 'success' : 'error');
  });

  btnClearGeo.addEventListener('click', async () => {
    if (!confirm('Disable geofencing? Submissions will be accepted from any location.')) return;
    await apiFetch('/api/admin/settings/geofence', { method: 'DELETE' });
    fenceLat.value = '';
    fenceLng.value = '';
    fenceRadius.value = '';
    showStatus(geofenceStatus, 'Geofencing disabled.', 'success');
  });

  // ── Danger zone ────────────────────────────────────────────────────────────
  const btnTruncate  = document.getElementById('btn-truncate');
  const dangerStatus = document.getElementById('danger-status');

  btnTruncate.addEventListener('click', async () => {
    if (!confirm('Delete ALL entries? This cannot be undone.')) return;
    if (!confirm('Second confirmation: permanently delete all delivery records?')) return;
    const r = await apiFetch('/api/admin/truncate', { method: 'POST', body: JSON.stringify({}) });
    const d = await r.json();
    showStatus(dangerStatus, r.ok ? d.message : (d.error || 'Failed'), r.ok ? 'success' : 'error');
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

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

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadAll() {
    loadDevices();
    loadSettings();
  }
})();
