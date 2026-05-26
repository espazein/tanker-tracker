(() => {
  const DEVICE_TOKEN_KEY = 'tanker_device_token';
  const KNOWN_VENDORS_KEY = 'tanker_vendors';

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

  if (deviceToken) {
    showGuard();
  } else {
    showActivation();
  }

  btnActivate.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (!token) {
      activationError.textContent = 'Please enter your access code.';
      activationError.classList.remove('hidden');
      return;
    }
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
  const vendorInput  = document.getElementById('vendor-name');
  const vendorSugg   = document.getElementById('vendor-suggestions');
  const plateInput   = document.getElementById('plate-number');
  const notesInput   = document.getElementById('notes');
  const btnSubmit    = document.getElementById('btn-submit');
  const resultCard   = document.getElementById('result-card');

  let selectedFile = null;

  function getKnownVendors() {
    try { return JSON.parse(localStorage.getItem(KNOWN_VENDORS_KEY) || '[]'); }
    catch { return []; }
  }
  function saveVendor(name) {
    const list = getKnownVendors().filter(v => v !== name);
    list.unshift(name);
    localStorage.setItem(KNOWN_VENDORS_KEY, JSON.stringify(list.slice(0, 20)));
  }

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

  function handleFile(file) {
    if (!file) return;
    selectedFile = file;
    const url = URL.createObjectURL(file);
    photoPreview.src = url;
    photoPreview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    showMeta({ timestamp: file.lastModified ? new Date(file.lastModified).toISOString() : null, gps: null });
    updateSubmitBtn();
  }

  btnCamera.addEventListener('click', () => inputCamera.click());
  inputCamera.addEventListener('change', e => handleFile(e.target.files[0]));

  // ── Vendor autocomplete ────────────────────────────────────────────────────
  vendorInput.addEventListener('input', () => {
    const val = vendorInput.value.trim().toLowerCase();
    const list = getKnownVendors().filter(v => v.toLowerCase().includes(val) && val.length > 0);
    if (list.length) {
      vendorSugg.innerHTML = list.map(v => `<div class="suggestion-item">${v}</div>`).join('');
      vendorSugg.classList.remove('hidden');
    } else {
      vendorSugg.classList.add('hidden');
    }
    updateSubmitBtn();
  });

  vendorSugg.addEventListener('click', e => {
    if (e.target.classList.contains('suggestion-item')) {
      vendorInput.value = e.target.textContent;
      vendorSugg.classList.add('hidden');
      updateSubmitBtn();
    }
  });

  document.addEventListener('click', e => {
    if (!vendorSugg.contains(e.target) && e.target !== vendorInput) vendorSugg.classList.add('hidden');
  });

  plateInput.addEventListener('input', updateSubmitBtn);

  function updateSubmitBtn() {
    btnSubmit.disabled = !(selectedFile && vendorInput.value.trim() && plateInput.value.trim());
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
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
      const resp = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'X-Device-Id': deviceToken },
        body: fd
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        saveVendor(vendorInput.value.trim());
        if (data.exif_timestamp) showMeta({ timestamp: data.exif_timestamp, gps: data.gps });
        showResult('success', '✅ Entry Logged!',
          `Tanker from <strong>${vendorInput.value.trim()}</strong> has been recorded.`, data);
        setTimeout(resetForm, 3500);

      } else if (resp.status === 409) {
        const dup = data.duplicate_entry;
        showResult('duplicate', '⚠️ Duplicate Detected', data.message, null,
          dup ? `Previous: ${dup.vendor_name} — ${dup.plate_number || 'no plate'} — ${formatTs(dup.submitted_at)}` : '');

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
