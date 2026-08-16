/* AZMA — ضغط ذكي للصور قبل الرفع (canvas client-side، بدون مكتبات) */
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

  function compressImage(file, opts) {
    opts = opts || {};
    const maxWidth = opts.maxWidth || MAX_UPLOAD_WIDTH;
    const quality = opts.quality || JPEG_QUALITY;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const { width, height } = targetSize(img.width, img.height, maxWidth);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const fmt = pickOutputFormat(webpSupported(), file.type);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              if (blob && blob.size < file.size) resolve(blob);
              else resolve(file);
            },
            fmt,
            quality
          );
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function compressFiles(files, opts) {
    return Promise.all(Array.from(files || []).map((f) => compressImage(f, opts)));
  }

  global.compressImage = compressImage;
  global.compressFiles = compressFiles;
  global.imageCompressPure = { pickOutputFormat, targetSize, MAX_UPLOAD_WIDTH };
})(window);
