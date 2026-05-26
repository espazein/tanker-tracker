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
