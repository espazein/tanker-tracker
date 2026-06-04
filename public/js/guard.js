(() => {
  const DEVICE_TOKEN_KEY = 'tanker_device_token';

  // ── Activation screen ──────────────────────────────────────────────────────
  const activationScreen = document.getElementById('activation-screen');
  const guardMain        = document.getElementById('guard-main');
  const tokenInput       = document.getElementById('token-input');
  const btnActivate      = document.getElementById('btn-activate');
  const activationError  = document.getElementById('activation-error');
  const btnResetDevice   = document.getElementById('btn-reset-device');
  const deviceLabel      = document.getElementById('device-label');

  let deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);

  function showActivation() {
    activationScreen.classList.remove('hidden');
    guardMain.classList.add('hidden');
  }

  function showGuard() {
    activationScreen.classList.add('hidden');
    guardMain.classList.remove('hidden');
    deviceLabel.textContent = `Device: …${deviceToken.slice(-8)}`;
  }

  // Ask the server whether a token is still a valid, active device
  async function isTokenValid(token) {
    try {
      const r = await fetch('/api/device/check', { headers: { 'X-Device-Id': token } });
      const d = await r.json();
      return !!d.valid;
    } catch {
      return null; // network/offline — can't determine
    }
  }

  function revokeDevice(message) {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    deviceToken = null;
    tokenInput.value = '';
    showActivation();
    if (message) {
      activationError.textContent = message;
      activationError.classList.remove('hidden');
    }
  }

  // On load: validate the cached token against the server
  if (deviceToken) {
    showGuard(); // optimistic — confirm in background
    isTokenValid(deviceToken).then(valid => {
      if (valid === false) revokeDevice('This device is no longer authorised. Enter a new access code.');
    });
  } else {
    showActivation();
  }

  btnActivate.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      activationError.textContent = 'Please enter your access code.';
      activationError.classList.remove('hidden');
      return;
    }
    btnActivate.disabled = true;
    btnActivate.textContent = 'Checking…';
    const valid = await isTokenValid(token);
    btnActivate.disabled = false;
    btnActivate.textContent = 'Activate Device';

    if (valid === false) {
      activationError.textContent = 'Invalid access code. Contact your administrator.';
      activationError.classList.remove('hidden');
      return;
    }
    // valid === true, or null (offline) → accept and let submit-time enforce
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
    deviceToken = token;
    activationError.classList.add('hidden');
    showGuard();
  });

  tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnActivate.click(); });

  btnResetDevice.addEventListener('click', () => {
    if (!confirm('Remove device activation? You will need your access code again.')) return;
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    deviceToken = null;
    tokenInput.value = '';
    showActivation();
  });

  // ── Geolocation ────────────────────────────────────────────────────────────
  const locationStatus = document.getElementById('location-status');
  const locationIcon   = document.getElementById('location-icon');
  const locationText   = document.getElementById('location-text');

  let currentPosition = null;
  let geoError = null;

  function updateLocationUI() {
    locationStatus.classList.remove('location-loading', 'location-ok', 'location-error');
    if (currentPosition) {
      const { latitude: lat, longitude: lng } = currentPosition.coords;
      locationStatus.classList.add('location-ok');
      locationIcon.textContent = '📍';
      locationText.textContent = `Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } else if (geoError) {
      locationStatus.classList.add('location-error');
      locationIcon.textContent = '⚠️';
      locationText.textContent = 'Location unavailable — submission may fail if geofencing is enabled';
    } else {
      locationStatus.classList.add('location-loading');
      locationIcon.textContent = '⏳';
      locationText.textContent = 'Getting location…';
    }
  }

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      pos  => { currentPosition = pos; geoError = null; updateLocationUI(); },
      err  => { geoError = err; currentPosition = null; updateLocationUI(); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  } else {
    geoError = 'not_supported';
    updateLocationUI();
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  const btnCamera    = document.getElementById('btn-camera');
  const inputCamera  = document.getElementById('input-camera');
  const photoPreview = document.getElementById('photo-preview');
  const placeholder  = document.getElementById('preview-placeholder');
  const photoMeta    = document.getElementById('photo-meta');
  const vendorInput  = document.getElementById('vendor-name'); // <select>
  const plateInput   = document.getElementById('plate-number');
  const notesInput   = document.getElementById('notes');
  const btnSubmit    = document.getElementById('btn-submit');
  const resultCard   = document.getElementById('result-card');

  let selectedFile = null;

  // Populate the vendor <select> from the server
  async function loadVendors() {
    try {
      const r = await fetch('/api/vendors');
      const d = await r.json();
      if (d.vendors?.length) {
        vendorInput.innerHTML = '<option value="">Select a vendor…</option>' +
          d.vendors.map(v => `<option value="${escAttr(v.name)}">${escHtml(v.name)}</option>`).join('');
      } else {
        vendorInput.innerHTML = '<option value="">No vendors configured</option>';
      }
    } catch {
      vendorInput.innerHTML = '<option value="">Could not load vendors</option>';
    }
    updateSubmitBtn();
  }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  loadVendors();

  function formatTs(ts) {
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function showMeta(info) {
    const parts = [];
    if (info.timestamp) parts.push(`<span>🕐 ${new Date(info.timestamp).toLocaleString('en-IN')}</span>`);
    if (info.gps) parts.push(`<span>📍 ${info.gps.lat.toFixed(5)}, ${info.gps.lng.toFixed(5)}</span>`);
    if (!parts.length) parts.push('<span>No EXIF metadata found</span>');
    photoMeta.innerHTML = parts.join('');
    photoMeta.classList.remove('hidden');
  }

  // compressImage is provided by /js/photo.js (preserves EXIF through compression)
  async function handleFile(file) {
    if (!file) return;
    // Show original preview immediately
    const previewUrl = URL.createObjectURL(file);
    photoPreview.src = previewUrl;
    photoPreview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    photoMeta.classList.remove('hidden');
    photoMeta.innerHTML = '<span>⏳ Optimising photo…</span>';

    try {
      const compressed = await compressImage(file);
      selectedFile = new File([compressed], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      const kb = Math.round(selectedFile.size / 1024);
      photoMeta.innerHTML = `<span>📐 ${kb} KB · ready</span>`;
    } catch (e) {
      console.warn('compression failed, sending original', e);
      selectedFile = file;
      photoMeta.innerHTML = '<span>⚠️ Could not optimise; sending original</span>';
    }
    updateSubmitBtn();
  }

  btnCamera.addEventListener('click', () => inputCamera.click());
  inputCamera.addEventListener('change', e => handleFile(e.target.files[0]));

  vendorInput.addEventListener('change', updateSubmitBtn);
  plateInput.addEventListener('input', updateSubmitBtn);

  function updateSubmitBtn() {
    btnSubmit.disabled = !(selectedFile && vendorInput.value.trim() && plateInput.value.trim());
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  // XHR upload with real progress events (fetch doesn't expose upload progress).
  function uploadWithProgress(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/submit');
      xhr.setRequestHeader('X-Device-Id', deviceToken);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { data = { error: 'parse_error' }; }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(formData);
    });
  }

  async function handleSubmit() {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting…';
    resultCard.classList.add('hidden');

    const fd = new FormData();
    fd.append('photo', selectedFile);
    fd.append('vendor_name', vendorInput.value.trim());
    fd.append('plate_number', plateInput.value.trim().toUpperCase());
    if (notesInput.value.trim()) fd.append('notes', notesInput.value.trim());
    if (currentPosition) {
      fd.append('submitted_lat', currentPosition.coords.latitude);
      fd.append('submitted_lng', currentPosition.coords.longitude);
    }

    try {
      const resp = await uploadWithProgress(fd, pct => {
        btnSubmit.textContent = pct >= 1 ? 'Processing…' : `Uploading ${Math.round(pct * 100)}%`;
      });
      const data = resp.data;

      if (resp.ok && data.success) {
        if (data.exif_timestamp) showMeta({ timestamp: data.exif_timestamp, gps: data.gps });
        showResult('success', '✅ Entry Logged!',
          `Tanker from <strong>${vendorInput.value.trim()}</strong> has been recorded.`, data);
        setTimeout(resetForm, 3500);

      } else if (resp.status === 409) {
        const dup = data.duplicate_entry;
        showResult('duplicate', '⚠️ Duplicate Detected', data.message, null,
          dup ? `Previous: ${dup.vendor_name} — ${dup.plate_number || 'no plate'} — ${formatTs(dup.submitted_at)}` : '');

      } else if (data.error === 'device_unauthorized' || data.error === 'device_unregistered') {
        revokeDevice('This device is no longer authorised. Enter a new access code.');

      } else {
        showResult('error', '❌ Submission Failed', data.message || data.error || 'Unknown error. Please try again.', null);
      }

    } catch {
      showResult('error', '❌ Network Error', 'Could not reach the server. Check your connection.', null);
    }

    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Submit Entry';
    updateSubmitBtn();
  }

  function showResult(type, title, body, data, extra) {
    let metaHtml = '';
    if (data) {
      if (data.plate_number)   metaHtml += `<div>🚛 Plate: <strong>${data.plate_number}</strong></div>`;
      if (data.exif_timestamp) metaHtml += `<div>🕐 Photo taken: ${new Date(data.exif_timestamp).toLocaleString('en-IN')}</div>`;
      if (data.gps)            metaHtml += `<div>📍 GPS: ${data.gps.lat.toFixed(5)}, ${data.gps.lng.toFixed(5)}</div>`;
    }
    if (extra) metaHtml += `<div>${extra}</div>`;

    resultCard.className = `result-card ${type}`;
    resultCard.innerHTML = `
      <div class="result-title">${title}</div>
      <div class="result-body">${body}</div>
      ${metaHtml ? `<div class="result-meta">${metaHtml}</div>` : ''}
    `;
    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function resetForm() {
    selectedFile = null;
    photoPreview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    photoMeta.classList.add('hidden');
    vendorInput.value = '';
    plateInput.value = '';
    notesInput.value = '';
    inputCamera.value = '';
    resultCard.classList.add('hidden');
    updateSubmitBtn();
  }

  btnSubmit.addEventListener('click', handleSubmit);
})();
