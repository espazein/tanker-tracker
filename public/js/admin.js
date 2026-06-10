(() => {
  let currentRole = '';                                       // 'admin' | 'member'
  let adminPin    = '';                                       // admin credential
  let memberToken = '';                                       // member session token
  let actorName   = '';                                       // member display name
  let pendingToken = '', pendingName = '';                    // during forced change-pin

  const pinScreen       = document.getElementById('pin-screen');
  const changePinScreen = document.getElementById('change-pin-screen');
  const adminContent    = document.getElementById('admin-content');
  const pinInput        = document.getElementById('pin-input');
  const actorInput      = document.getElementById('actor-name');
  const btnPinSubmit    = document.getElementById('btn-pin-submit');
  const pinError        = document.getElementById('pin-error');
  const roleBadge       = document.getElementById('role-badge');
  const panelTitle      = document.getElementById('panel-title');
  const newPinInput     = document.getElementById('new-pin');
  const newPinConfirm   = document.getElementById('new-pin-confirm');
  const btnChangePin    = document.getElementById('btn-change-pin');
  const changePinError  = document.getElementById('change-pin-error');

  // ── Auth ───────────────────────────────────────────────────────────────────
  function apiFetch(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (currentRole === 'admin')       headers['X-Admin-Pin']     = adminPin;
    else if (currentRole === 'member') headers['X-Session-Token'] = memberToken;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(path, { ...opts, headers });
  }

  function clearAuth() {
    ['auth_role', 'admin_pin', 'member_token', 'actor_name'].forEach(k => sessionStorage.removeItem(k));
    currentRole = ''; adminPin = ''; memberToken = ''; actorName = '';
  }

  function enterPanel(role) {
    currentRole = role;
    pinScreen.classList.add('hidden');
    changePinScreen.classList.add('hidden');
    adminContent.classList.remove('hidden');
    applyRolePermissions(role);
    loadAll();
  }

  function showPinError(msg) {
    pinError.textContent = msg;
    pinError.classList.remove('hidden');
  }

  async function unlock() {
    const name = actorInput.value.trim();
    const pin  = pinInput.value.trim();
    if (!pin) return;
    btnPinSubmit.disabled = true;
    btnPinSubmit.textContent = 'Signing in…';
    pinError.classList.add('hidden');

    try {
      if (name) await memberLogin(name, pin);
      else      await adminLogin(pin);
    } finally {
      btnPinSubmit.disabled = false;
      btnPinSubmit.textContent = 'Sign In';
    }
  }

  async function adminLogin(pin) {
    const r = await fetch('/api/admin/session', { headers: { 'X-Admin-Pin': pin } });
    if (r.ok && (await r.json()).role === 'admin') {
      adminPin = pin; currentRole = 'admin';
      sessionStorage.setItem('auth_role', 'admin');
      sessionStorage.setItem('admin_pin', pin);
      enterPanel('admin');
    } else {
      showPinError('Invalid PIN. (Members: enter your name above.)');
    }
  }

  async function memberLogin(name, pin) {
    let r;
    try {
      r = await fetch('/api/member/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin })
      });
    } catch { showPinError('Network error. Please try again.'); return; }

    if (r.status === 429) { showPinError('Too many attempts. Try again in 15 minutes.'); return; }
    if (!r.ok)            { showPinError('Invalid name or PIN.'); return; }

    const d = await r.json();
    if (d.must_change) {
      pendingToken = d.token; pendingName = d.name;
      pinScreen.classList.add('hidden');
      changePinScreen.classList.remove('hidden');
      newPinInput.value = ''; newPinConfirm.value = '';
      changePinError.classList.add('hidden');
      newPinInput.focus();
    } else {
      finishMemberLogin(d.token, d.name);
    }
  }

  function finishMemberLogin(token, name) {
    memberToken = token; actorName = name; currentRole = 'member';
    sessionStorage.setItem('auth_role', 'member');
    sessionStorage.setItem('member_token', token);
    sessionStorage.setItem('actor_name', name);
    enterPanel('member');
  }

  async function submitChangePin() {
    const p1 = newPinInput.value.trim();
    const p2 = newPinConfirm.value.trim();
    changePinError.classList.add('hidden');
    if (p1.length < 4 || p1.length > 12) { changePinError.textContent = 'PIN must be 4–12 characters'; changePinError.classList.remove('hidden'); return; }
    if (p1 !== p2) { changePinError.textContent = 'PINs do not match'; changePinError.classList.remove('hidden'); return; }

    btnChangePin.disabled = true;
    btnChangePin.textContent = 'Saving…';
    try {
      const r = await fetch('/api/member/change-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pendingToken, new_pin: p1 })
      });
      const d = await r.json();
      if (r.ok && d.success) {
        finishMemberLogin(pendingToken, pendingName);
      } else {
        changePinError.textContent = d.error || 'Could not change PIN';
        changePinError.classList.remove('hidden');
      }
    } finally {
      btnChangePin.disabled = false;
      btnChangePin.textContent = 'Save & Continue';
    }
  }

  btnPinSubmit.addEventListener('click', unlock);
  pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  actorInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  btnChangePin.addEventListener('click', submitChangePin);
  newPinConfirm.addEventListener('keydown', e => { if (e.key === 'Enter') submitChangePin(); });

  roleBadge.addEventListener('click', async () => {
    if (!confirm('Sign out?')) return;
    if (currentRole === 'member' && memberToken) {
      try {
        await fetch('/api/member/logout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: memberToken })
        });
      } catch {}
    }
    clearAuth();
    location.reload();
  });

  // Restore a saved session on reload.
  (function restore() {
    const role = sessionStorage.getItem('auth_role');
    if (role === 'admin') {
      adminPin = sessionStorage.getItem('admin_pin') || '';
      fetch('/api/admin/session', { headers: { 'X-Admin-Pin': adminPin } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.role === 'admin') enterPanel('admin'); else clearAuth(); });
    } else if (role === 'member') {
      memberToken = sessionStorage.getItem('member_token') || '';
      actorName   = sessionStorage.getItem('actor_name') || '';
      fetch('/api/admin/session', { headers: { 'X-Session-Token': memberToken } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.role === 'member') enterPanel('member'); else clearAuth(); });
    }
  })();

  // Tailor the panel to the role. Members get a restricted view.
  function applyRolePermissions(role) {
    const isMember = role === 'member';

    roleBadge.classList.remove('hidden');
    roleBadge.textContent = isMember ? `👤 ${actorName || 'Member'}` : '🛡️ Admin';
    roleBadge.classList.toggle('member', isMember);
    panelTitle.textContent = isMember ? 'General Body Panel' : 'Admin Panel';

    // Hide admin-only tabs (Members, Audit, Danger Zone) for members
    document.querySelectorAll('.tab-btn[data-admin-only]').forEach(btn => {
      btn.classList.toggle('hidden', isMember);
    });

    // Members cannot set a custom capture time
    document.getElementById('log-capture-time-group').classList.toggle('hidden', isMember);

    // Geofence is read-only for members (they may view, not change)
    ['fence-lat', 'fence-lng', 'fence-radius'].forEach(id => {
      document.getElementById(id).disabled = isMember;
    });
    document.getElementById('btn-save-geofence').classList.toggle('hidden', isMember);
    document.getElementById('btn-clear-geofence').classList.toggle('hidden', isMember);
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
      if (btn.dataset.tab === 'entries') loadEntries();
      if (btn.dataset.tab === 'vendors') loadVendors();
      if (btn.dataset.tab === 'members') loadMembers();
      if (btn.dataset.tab === 'audit')   loadAudit();
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
  const logCaptureTime = document.getElementById('log-capture-time');
  const logNotes       = document.getElementById('log-notes');
  const btnLogSubmit   = document.getElementById('btn-log-submit');
  const logStatus      = document.getElementById('log-status');

  let logSelectedFile = null;

  // compressImage is provided by /js/photo.js (preserves EXIF through compression)
  // Format a Date as the value expected by <input type="datetime-local">
  function toLocalInputValue(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function handleLogFile(file) {
    if (!file) return;
    logPreview.src = URL.createObjectURL(file);
    logPreview.classList.remove('hidden');
    logPlaceholder.classList.add('hidden');
    logPhotoMeta.classList.remove('hidden');
    logPhotoMeta.textContent = '⏳ Optimising photo…';

    // Prefill capture-time using the best signal available
    // 1. EXIF DateTimeOriginal (best — usually present for fresh camera shots)
    // 2. file.lastModified (iOS Safari preserves this even when EXIF is stripped)
    // 3. "Now" as ultimate fallback
    let captureLocal = await readExifCaptureTime(file).catch(() => null);
    if (!captureLocal && file.lastModified) {
      captureLocal = toLocalInputValue(new Date(file.lastModified));
    }
    if (!captureLocal) captureLocal = toLocalInputValue(new Date());
    logCaptureTime.value = captureLocal;

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
    // Only admins may override capture time; the field is hidden for members.
    if (currentRole === 'admin' && logCaptureTime.value) fd.append('capture_time', logCaptureTime.value);
    if (logNotes.value.trim()) fd.append('notes', logNotes.value.trim());

    const headers = currentRole === 'admin'
      ? { 'X-Admin-Pin': adminPin }
      : { 'X-Session-Token': memberToken };

    try {
      const r = await fetch('/api/admin/entries', {
        method: 'POST',
        headers,
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
    logCaptureTime.value = '';
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

    const fmt = ts => new Date(ts).toLocaleString('en-IN',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    entriesCount.textContent = `${d.total} total`;
    entriesListAdmin.innerHTML = d.entries.map(e => {
      // Prefer the photo's actual capture time (matches dashboard). Fall back
      // to submitted_at when no EXIF was available.
      const captureTs   = e.exif_timestamp || e.submitted_at;
      const captureIcon = e.exif_timestamp ? '📷 ' : '🕐 ';
      // If capture and submission differ by >5 min, surface the submission
      // time too — useful for admin to spot backdated or delayed entries.
      const drift = e.exif_timestamp
        ? Math.abs(new Date(e.exif_timestamp).getTime() - e.submitted_at)
        : 0;
      const submittedNote = drift > 5 * 60 * 1000
        ? ` <span class="muted">· logged ${fmt(e.submitted_at)}</span>`
        : '';
      return `
        <div class="entry-admin-row" data-id="${e.id}">
          ${e.photo_path
            ? `<img class="entry-admin-thumb" src="/uploads/${escHtml(e.photo_path)}" alt="">`
            : `<div class="entry-admin-thumb-ph">🚛</div>`}
          <div class="entry-admin-info">
            <div class="entry-admin-vendor">${escHtml(e.vendor_name)}</div>
            <div class="entry-admin-meta">
              🔢 ${escHtml(e.plate_number || '—')} · ${captureIcon}${fmt(captureTs)}${submittedNote}
              ${e.is_duplicate ? ' · <span class="badge badge-inactive">duplicate</span>' : ''}
            </div>
          </div>
          ${currentRole === 'admin'
            ? '<button class="btn btn-sm btn-danger" data-action="delete-entry">Delete</button>'
            : ''}
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

  // ── Members (admin only) ───────────────────────────────────────────────────
  const membersList     = document.getElementById('members-list');
  const btnAddMember    = document.getElementById('btn-add-member');
  const addMemberForm   = document.getElementById('add-member-form');
  const newMemberName   = document.getElementById('new-member-name');
  const newMemberPin    = document.getElementById('new-member-pin');
  const btnSaveMember   = document.getElementById('btn-save-member');
  const btnCancelMember = document.getElementById('btn-cancel-member');
  const newMemberResult = document.getElementById('new-member-result');

  async function loadMembers() {
    membersList.innerHTML = '<div class="empty-state">Loading…</div>';
    const r = await apiFetch('/api/admin/members');
    const d = await r.json();
    if (!d.members?.length) {
      membersList.innerHTML = '<div class="empty-state">No members yet. Add one to give a General Body member access.</div>';
      return;
    }
    membersList.innerHTML = d.members.map(m => {
      const status = !m.is_active
        ? '<span class="badge badge-inactive">Inactive</span>'
        : m.must_change
          ? '<span class="badge badge-pending">PIN not set</span>'
          : '<span class="badge badge-active">Active</span>';
      const last = m.last_login ? `Last login ${timeAgo(m.last_login)}` : 'Never logged in';
      return `
        <div class="device-row ${m.is_active ? '' : 'inactive'}" data-id="${m.id}">
          <div class="device-info-block">
            <div class="device-name">${escHtml(m.name)}</div>
            <div class="device-meta">${last} · ${status}</div>
          </div>
          <div class="device-actions">
            <button class="btn btn-sm btn-outline" data-action="reset">Reset PIN</button>
            <button class="btn btn-sm ${m.is_active ? 'btn-outline' : 'btn-success'}"
                    data-action="toggle" data-active="${m.is_active}">
              ${m.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-sm btn-danger" data-action="delete">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  membersList.addEventListener('click', async e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const action = e.target.dataset.action;
    const name = row.querySelector('.device-name').textContent;

    if (action === 'reset') {
      const pin = prompt(`Set a new temporary PIN for ${name} (4–12 characters).\nThey'll be asked to change it on next login.`);
      if (pin === null) return;
      const r = await apiFetch(`/api/admin/members/${id}/reset`, { method: 'POST', body: JSON.stringify({ pin: pin.trim() }) });
      const d = await r.json();
      if (r.ok) alert(`PIN reset. Share this temporary PIN with ${name}: ${pin.trim()}`);
      else alert(d.error || 'Reset failed');
      loadMembers();
    } else if (action === 'toggle') {
      const active = e.target.dataset.active === '1';
      await apiFetch(`/api/admin/members/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: active ? 0 : 1 }) });
      loadMembers();
    } else if (action === 'delete') {
      if (!confirm(`Delete member ${name}? They will lose access immediately.`)) return;
      await apiFetch(`/api/admin/members/${id}`, { method: 'DELETE' });
      loadMembers();
    }
  });

  btnAddMember.addEventListener('click', () => {
    addMemberForm.classList.toggle('hidden');
    newMemberResult.classList.add('hidden');
    if (!addMemberForm.classList.contains('hidden')) newMemberName.focus();
  });

  btnCancelMember.addEventListener('click', () => {
    addMemberForm.classList.add('hidden');
    newMemberName.value = ''; newMemberPin.value = '';
    newMemberResult.classList.add('hidden');
  });

  btnSaveMember.addEventListener('click', async () => {
    const name = newMemberName.value.trim();
    const pin  = newMemberPin.value.trim();
    if (!name) { newMemberName.focus(); return; }
    btnSaveMember.disabled = true;
    const r = await apiFetch('/api/admin/members', { method: 'POST', body: JSON.stringify({ name, pin }) });
    const d = await r.json();
    btnSaveMember.disabled = false;
    if (r.ok) {
      newMemberResult.className = 'new-device-result success';
      newMemberResult.innerHTML = `
        <strong>Member created.</strong> Share these with ${escHtml(name)}:<br>
        Name: <span class="token-display">${escHtml(name)}</span>
        Temporary PIN: <span class="token-display">${escHtml(pin)}</span>
        They'll set their own PIN on first login.`;
      newMemberResult.classList.remove('hidden');
      newMemberName.value = ''; newMemberPin.value = '';
      loadMembers();
    } else {
      newMemberResult.className = 'new-device-result error';
      newMemberResult.textContent = d.error || 'Failed to add member';
      newMemberResult.classList.remove('hidden');
    }
  });

  // ── Audit Log (admin only) ─────────────────────────────────────────────────
  const auditList     = document.getElementById('audit-list');
  const auditCount    = document.getElementById('audit-count');
  const auditPager    = document.getElementById('audit-pager');
  const btnAuditPrev  = document.getElementById('btn-audit-prev');
  const btnAuditNext  = document.getElementById('btn-audit-next');
  const auditPageInfo = document.getElementById('audit-page-info');
  let auditPage = 1;

  const ACTION_LABELS = {
    create_entry:      '➕ Logged entry',
    create_device:     '📱 Added device',
    update_device:     '📱 Updated device',
    activate_device:   '📱 Activated device',
    deactivate_device: '📱 Deactivated device',
    delete_device:     '🗑️ Deleted device',
    create_vendor:     '🏷️ Added vendor',
    update_vendor:     '🏷️ Renamed vendor',
    merge_vendor:      '🏷️ Merged vendor',
    delete_vendor:     '🗑️ Deleted vendor'
  };

  async function loadAudit() {
    auditList.innerHTML = '<div class="empty-state">Loading…</div>';
    const r = await apiFetch(`/api/admin/audit?page=${auditPage}`);
    if (!r.ok) { auditList.innerHTML = '<div class="empty-state">Could not load audit log.</div>'; return; }
    const d = await r.json();

    if (!d.logs?.length) {
      auditList.innerHTML = '<div class="empty-state">No member activity recorded yet.</div>';
      auditCount.textContent = '';
      auditPager.classList.add('hidden');
      return;
    }

    const fmt = ts => new Date(ts).toLocaleString('en-IN',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    auditCount.textContent = `${d.total} total`;
    auditList.innerHTML = d.logs.map(l => `
      <div class="audit-row">
        <div class="audit-main">
          <span class="audit-action">${ACTION_LABELS[l.action] || escHtml(l.action)}</span>
          ${l.details ? `<span class="audit-details">${escHtml(l.details)}</span>` : ''}
        </div>
        <div class="audit-meta">
          👤 ${escHtml(l.actor || 'unnamed member')} · ${fmt(l.created_at)}
        </div>
      </div>
    `).join('');

    const totalPages = Math.max(1, Math.ceil(d.total / d.limit));
    auditPager.classList.toggle('hidden', totalPages <= 1);
    btnAuditPrev.disabled = auditPage <= 1;
    btnAuditNext.disabled = auditPage >= totalPages;
    auditPageInfo.textContent = `Page ${auditPage} of ${totalPages}`;
  }

  btnAuditPrev.addEventListener('click', () => { if (auditPage > 1) { auditPage--; loadAudit(); } });
  btnAuditNext.addEventListener('click', () => { auditPage++; loadAudit(); });

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
    loadVendorsForDropdown();  // populate Log Entry dropdown on unlock
  }

  // Populate the Log Entry vendor <select> from /api/vendors (public endpoint)
  async function loadVendorsForDropdown() {
    try {
      const r = await fetch('/api/vendors');
      const d = await r.json();
      const opts = ['<option value="">Select a vendor…</option>']
        .concat((d.vendors || []).map(v => `<option value="${escHtml(v.name)}">${escHtml(v.name)}</option>`));
      logVendor.innerHTML = opts.join('');
      if (!d.vendors?.length) {
        logVendor.innerHTML = '<option value="">No vendors yet — add one in the Vendors tab</option>';
      }
    } catch {
      logVendor.innerHTML = '<option value="">Could not load vendors</option>';
    }
  }

  // ── Vendors (admin CRUD) ───────────────────────────────────────────────────
  const vendorsList     = document.getElementById('vendors-list');
  const btnAddVendor    = document.getElementById('btn-add-vendor');
  const addVendorForm   = document.getElementById('add-vendor-form');
  const newVendorName   = document.getElementById('new-vendor-name');
  const btnSaveVendor   = document.getElementById('btn-save-vendor');
  const btnCancelVendor = document.getElementById('btn-cancel-vendor');
  const newVendorResult = document.getElementById('new-vendor-result');

  async function loadVendors() {
    vendorsList.innerHTML = '<div class="empty-state">Loading…</div>';
    const r = await apiFetch('/api/admin/vendors');
    const d = await r.json();
    if (!d.vendors?.length) {
      vendorsList.innerHTML = '<div class="empty-state">No vendors yet. Add one to populate the dropdowns.</div>';
      return;
    }
    vendorsList.innerHTML = d.vendors.map(v => `
      <div class="device-row ${v.is_active ? '' : 'inactive'}" data-id="${v.id}">
        <div class="device-info-block">
          <div class="device-name vendor-name-editable" data-original="${escHtml(v.name)}">${escHtml(v.name)}</div>
          <div class="device-meta">
            Added ${timeAgo(v.created_at)} ·
            ${v.is_active
              ? '<span class="badge badge-active">Active</span>'
              : '<span class="badge badge-inactive">Inactive</span>'}
          </div>
        </div>
        <div class="device-actions">
          <button class="btn btn-sm btn-outline" data-action="rename">Rename</button>
          <button class="btn btn-sm ${v.is_active ? 'btn-outline' : 'btn-success'}"
                  data-action="toggle" data-active="${v.is_active}">
            ${v.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn btn-sm btn-danger" data-action="delete">Delete</button>
        </div>
      </div>
    `).join('');
  }

  vendorsList.addEventListener('click', async e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const action = e.target.dataset.action;

    if (action === 'toggle') {
      const active = e.target.dataset.active === '1';
      await apiFetch(`/api/admin/vendors/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: active ? 0 : 1 }) });
      loadVendors(); loadVendorsForDropdown();
    } else if (action === 'delete') {
      if (!confirm('Delete this vendor? Existing entries that used this name are not affected.')) return;
      await apiFetch(`/api/admin/vendors/${id}`, { method: 'DELETE' });
      loadVendors(); loadVendorsForDropdown();
    } else if (action === 'rename') {
      const original = row.querySelector('.vendor-name-editable').dataset.original;
      const newName = prompt(
        'Rename vendor:\n\nIf a vendor with this name already exists, the two will be merged and existing entries updated.',
        original
      );
      if (!newName || newName.trim() === original) return;
      const r = await apiFetch(`/api/admin/vendors/${id}`, { method: 'PATCH', body: JSON.stringify({ name: newName.trim() }) });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'Rename failed');
      } else if (d.merged) {
        alert(`Merged into existing vendor. ${d.entries_updated} entr${d.entries_updated === 1 ? 'y' : 'ies'} updated.`);
      } else if (d.entries_updated) {
        alert(`Renamed. ${d.entries_updated} entr${d.entries_updated === 1 ? 'y' : 'ies'} also updated.`);
      }
      loadVendors(); loadVendorsForDropdown();
    }
  });

  btnAddVendor.addEventListener('click', () => {
    addVendorForm.classList.toggle('hidden');
    newVendorResult.classList.add('hidden');
    if (!addVendorForm.classList.contains('hidden')) newVendorName.focus();
  });

  btnCancelVendor.addEventListener('click', () => {
    addVendorForm.classList.add('hidden');
    newVendorName.value = '';
    newVendorResult.classList.add('hidden');
  });

  btnSaveVendor.addEventListener('click', async () => {
    const name = newVendorName.value.trim();
    if (!name) { newVendorName.focus(); return; }
    btnSaveVendor.disabled = true;
    const r = await apiFetch('/api/admin/vendors', { method: 'POST', body: JSON.stringify({ name }) });
    const d = await r.json();
    btnSaveVendor.disabled = false;
    if (r.ok) {
      newVendorName.value = '';
      addVendorForm.classList.add('hidden');
      loadVendors(); loadVendorsForDropdown();
    } else {
      newVendorResult.className = 'new-device-result error';
      newVendorResult.textContent = d.error || 'Failed to add vendor';
      newVendorResult.classList.remove('hidden');
    }
  });

  newVendorName.addEventListener('keydown', e => { if (e.key === 'Enter') btnSaveVendor.click(); });

})();
