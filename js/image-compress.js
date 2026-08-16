/* AZMA — ضغط ذكي للصور قبل الرفع (canvas client-side، بدون مكتبات) */
/* global createImageBitmap */
(function (global) {
  const MAX_UPLOAD_WIDTH = 1600;
  const JPEG_QUALITY = 0.85;

  function pickOutputFormat(webpOk, type) {
    return webpOk ? 'image/webp' : type === 'image/png' ? 'image/png' : 'image/jpeg';
  }

  function targetSize(w, h, maxWidth) {
    if (!w || !h) return { width: w, height: h };
    if (w <= maxWidth && h <= maxWidth) return { width: w, height: h };
    const scale = Math.min(1, maxWidth / Math.max(w, h));
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  }

  function webpSupported() {
    try {
      const c = document.createElement('canvas');
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      return false;
    }
  }

  function decodeWithImage(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => decodeWithImage(file));
      } catch {
        return decodeWithImage(file);
      }
    }
    return decodeWithImage(file);
  }

  function compressImage(file, opts) {
    opts = opts || {};
    const maxWidth = opts.maxWidth || MAX_UPLOAD_WIDTH;
    const quality = opts.quality || JPEG_QUALITY;
    return decodeImage(file).then((source) => {
      if (!source) return file;
      try {
        const { width, height } = targetSize(source.width, source.height, maxWidth);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, width, height);
        if (typeof source.close === 'function') source.close();
        const fmt = pickOutputFormat(webpSupported(), file.type);
        return new Promise((resolve) => {
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size < file.size) resolve(blob);
              else resolve(file);
            },
            fmt,
            quality
          );
        });
      } catch {
        return file;
      }
    });
  }

  function compressFiles(files, opts) {
    return Promise.all(Array.from(files || []).map((f) => compressImage(f, opts)));
  }

  global.compressImage = compressImage;
  global.compressFiles = compressFiles;
  global.imageCompressPure = { pickOutputFormat, targetSize, MAX_UPLOAD_WIDTH };
})(window);
