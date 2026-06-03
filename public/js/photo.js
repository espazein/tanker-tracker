// Shared client-side photo helper used by both the guard portal and the admin
// log-entry form. Compresses a phone-camera photo to ~200–400 KB while
// preserving the original EXIF block (DateTimeOriginal, GPS, etc.) so the
// server can still record the photo's actual capture timestamp.
//
// Depends on /js/vendor/piexif.min.js being loaded first.

(function (global) {
  function fileToBinaryString(blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsBinaryString(blob);
    });
  }

  function binaryStringToJpegBlob(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  async function readExif(file) {
    if (!global.piexif) return null;
    try {
      const binary = await fileToBinaryString(file);
      const exifObj = global.piexif.load(binary);
      // piexifjs always returns IFD keys; check if any actually has tags
      const hasData = ['0th','Exif','GPS','Interop','1st'].some(k =>
        exifObj[k] && Object.keys(exifObj[k]).length > 0
      );
      return hasData ? exifObj : null;
    } catch {
      return null; // not a JPEG, or no EXIF segment
    }
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      try { return { img: await createImageBitmap(file, { imageOrientation: 'from-image' }), isBitmap: true }; }
      catch { try { return { img: await createImageBitmap(file), isBitmap: true }; } catch {} }
    }
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      const url = URL.createObjectURL(file);
      im.onload  = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      im.src = url;
    });
    return { img, isBitmap: false };
  }

  async function compressImage(file, opts) {
    opts = opts || {};
    const maxDim  = opts.maxDim  || 1600;
    const quality = opts.quality || 0.75;

    // 1. Best-effort read of original EXIF before we lose it to canvas
    const exifObj = await readExif(file);

    // 2. Decode (with EXIF-aware rotation) and resize
    const { img, isBitmap } = await decodeImage(file);
    const srcW  = isBitmap ? img.width  : img.naturalWidth;
    const srcH  = isBitmap ? img.height : img.naturalHeight;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    if (isBitmap) img.close();

    const compressed = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', quality)
    );

    // 3. Graft EXIF back into the compressed JPEG (if we had any)
    if (!exifObj || !global.piexif) return compressed;
    try {
      // Canvas already applied EXIF rotation, so reset Orientation to "normal"
      // to prevent double-rotation when this photo is viewed elsewhere.
      if (exifObj['0th']) exifObj['0th'][global.piexif.ImageIFD.Orientation] = 1;
      // Also strip thumbnail (it's of the original size and adds bytes)
      delete exifObj.thumbnail;
      exifObj['1st'] = {};

      const exifStr = global.piexif.dump(exifObj);
      const compStr = await fileToBinaryString(compressed);
      return binaryStringToJpegBlob(global.piexif.insert(exifStr, compStr));
    } catch (e) {
      console.warn('EXIF re-insert failed; returning compressed without metadata', e);
      return compressed;
    }
  }

  global.compressImage = compressImage;
})(window);
