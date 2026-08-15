/* AZMA - API Wrapper
   Server Mode: calls the Express server (/api/...) when the page is served by server.js.
   Local Mode: falls back to DB (localStorage) so the site still works without a server. */

let _serverMode = null;
let _serverCheck = null;

function isServerMode() {
  if (_serverMode !== null) return Promise.resolve(_serverMode);
  if (typeof fetch !== 'function' || location.protocol === 'file:') {
    _serverMode = false;
    return Promise.resolve(false);
  }
  if (!_serverCheck) {
    _serverCheck = fetch('/api/settings', { method: 'GET', headers: { Accept: 'application/json' } })
      .then((r) => {
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        _serverMode = r.ok && ct.includes('application/json');
        return _serverMode;
      })
      .catch(() => {
        _serverMode = false;
        return false;
      });
  }
  return _serverCheck;
}

/* Fetch helper: throws with the server's error message when not ok */
async function serverFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = 'خطأ في الخادم';
    try {
      const j = await res.json();
      if (j && j.error) msg = typeof j.error === 'string' ? j.error : 'خطأ في الخادم';
    } catch {
      /* ignore */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fallbackTo(fn, fallback) {
  try {
    if (await isServerMode()) return await fn();
  } catch (e) {
    if (e && (e.status !== undefined || e instanceof TypeError)) throw e;
  }
  return fallback();
}

/* eslint-disable no-redeclare -- API is also declared as a global in eslint.config.js */
const API = {
  /* ── Settings ── */
  async getSettings() {
    return fallbackTo(
      () => serverFetch('/api/settings'),
      () => DB.getSettings()
    );
  },

  async getAdminSettings() {
    return fallbackTo(
      () => serverFetch('/api/settings/admin'),
      () => DB.getAdminSettings()
    );
  },

  async updateSettings(data) {
    return fallbackTo(
      () =>
        serverFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      () => DB.updateSettings(data)
    );
  },

  /* ── Products ── */
  async getProducts() {
    return fallbackTo(
      () => serverFetch('/api/products'),
      () => DB.getProducts()
    );
  },

  async getProduct(id) {
    const list = await this.getProducts();
    return list.find((p) => p.id === id) || null;
  },

  async createProduct(data) {
    return fallbackTo(
      () =>
        serverFetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      () => DB.createProduct(data)
    );
  },

  async updateProduct(id, data) {
    return fallbackTo(
      () =>
        serverFetch('/api/products/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      () => DB.updateProduct(id, data)
    );
  },

  async deleteProduct(id) {
    return fallbackTo(
      () => serverFetch('/api/products/' + encodeURIComponent(id), { method: 'DELETE' }),
      () => DB.deleteProduct(id)
    );
  },

  async createProductWithFormData(formData) {
    if (await isServerMode()) {
      const res = await fetch('/api/products/with-images', { method: 'POST', body: formData });
      if (!res.ok) {
        let msg = 'خطأ في إنشاء المنتج';
        try {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      return res.json();
    }
    const data = {};
    formData.forEach((value, key) => {
      if (key === 'images') return;
      data[key] = value;
    });
    const images = formData.getAll('images').filter((f) => f instanceof File);
    if (images.length) {
      data.images = await Promise.all(images.map(fileToDataUrl));
      data.image = data.images[0];
    }
    if (!data.images || !data.images.length) {
      throw Object.assign(new Error('No image'), { code: 'NO_IMAGE' });
    }
    return DB.createProduct(data);
  },

  async uploadProductImage(id, file) {
    if (await isServerMode()) {
      const fd = new FormData();
      fd.append('image', file);
      return serverFetch('/api/products/' + encodeURIComponent(id) + '/image', { method: 'POST', body: fd });
    }
    const dataUrl = await fileToDataUrl(file);
    return DB.updateProduct(id, { image: dataUrl, images: [dataUrl] });
  },

  async uploadImages(files) {
    if (await isServerMode()) {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const res = await serverFetch('/api/uploads/images', { method: 'POST', body: fd });
      return (res && res.urls) || [];
    }
    return Promise.all(files.map(fileToDataUrl));
  },

  async deleteUploadedImage(url) {
    if (await isServerMode()) {
      const m = String(url || '').match(/^\/uploads\/([^/?#]+)$/);
      if (!m) return true;
      await serverFetch('/api/uploads/' + encodeURIComponent(m[1]), { method: 'DELETE' });
      return true;
    }
    return true;
  },

  /* ── Orders ── */
  async getOrders() {
    return fallbackTo(
      () => serverFetch('/api/orders'),
      () => DB.getOrders()
    );
  },

  async submitOrder(data) {
    return fallbackTo(
      () =>
        serverFetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      () => DB.createOrder(data)
    );
  },

  async verifyOTP(phone, code) {
    return fallbackTo(
      async () => {
        const res = await serverFetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code }),
        });
        // Also mark in localStorage so offline mode remembers it
        if (res && res.verified) {
          try {
            const stored = JSON.parse(localStorage.getItem('azma_verified_phones') || '[]');
            const norm = phone.replace(/\s+/g, '').replace(/^00/, '+');
            if (!stored.includes(norm)) stored.push(norm);
            localStorage.setItem('azma_verified_phones', JSON.stringify(stored));
          } catch (e) {
            /* ignore */
          }
        }
        return res;
      },
      () => {
        if (code === '1234') {
          // Save to localStorage in offline mode too
          try {
            const stored = JSON.parse(localStorage.getItem('azma_verified_phones') || '[]');
            const norm = phone.replace(/\s+/g, '').replace(/^00/, '+');
            if (!stored.includes(norm)) stored.push(norm);
            localStorage.setItem('azma_verified_phones', JSON.stringify(stored));
          } catch (e) {
            /* ignore */
          }
          return { ok: true, verified: true };
        }
        throw new Error('رمز التحقق غير صحيح (الكود التجريبي: 1234)');
      }
    );
  },

  // Check if a phone number was already verified (one-time rule)
  async checkPhoneVerified(phone) {
    return fallbackTo(
      async () => {
        const norm = encodeURIComponent(phone.trim());
        return serverFetch(`/api/check-phone-verified?phone=${norm}`);
      },
      () => {
        try {
          const stored = JSON.parse(localStorage.getItem('azma_verified_phones') || '[]');
          const norm = phone.replace(/\s+/g, '').replace(/^00/, '+');
          return { verified: stored.includes(norm) };
        } catch (e) {
          return { verified: false };
        }
      }
    );
  },

  async updateOrderStatus(id, status) {
    return fallbackTo(
      () =>
        serverFetch('/api/orders/' + encodeURIComponent(id) + '/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }),
      () => DB.updateOrderStatus(id, status)
    );
  },

  async deleteOrder(id) {
    return fallbackTo(
      () => serverFetch('/api/orders/' + encodeURIComponent(id), { method: 'DELETE' }),
      () => DB.deleteOrder(id)
    );
  },

  async getCustomerByPhone(phone) {
    return fallbackTo(
      () => serverFetch('/api/customers/' + encodeURIComponent(phone)),
      () => DB.getCustomerByPhone(phone)
    );
  },

  async cancelOrder(id, phone) {
    return fallbackTo(
      () =>
        serverFetch('/api/orders/' + encodeURIComponent(id) + '/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        }),
      () => DB.cancelOrder(id, phone)
    );
  },

  /* ── Auth ── */
  async checkAuth() {
    if (await isServerMode()) {
      try {
        return await serverFetch('/api/auth/check');
      } catch (e) {
        return { authenticated: false, isAdmin: false };
      }
    }
    return { authenticated: true, isAdmin: true, name: 'Admin' };
  },

  /* ── Chat ── */
  async sendChat(message, history, user) {
    if (await isServerMode()) {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history: history || [], user: user || null }),
        });
        const json = await res.json();
        if (res.ok && json.reply) return { reply: json.reply, name: json.name || 'Tez' };
        throw new Error((json && json.error) || 'تعذر الاتصال بالمساعد الذكي');
      } catch (e) {
        if (e instanceof TypeError) return DB.sendChat(message, history, user);
        throw e;
      }
    }
    return DB.sendChat(message, history, user);
  },

  /* ── DeepSeek AI ── */
  async aiStatus() {
    try {
      if (!(await isServerMode())) return { configured: false, model: null, local: true };
      const res = await fetch('/api/ai/status');
      if (res.ok) return res.json();
      return { configured: false, model: null };
    } catch (e) {
      return { configured: false, model: null };
    }
  },

  async generateDescription(data) {
    if (!(await isServerMode())) {
      throw new Error('ميزة الذكاء تحتاج تشغيل الموقع عبر السيرفر (node server.js)');
    }
    const res = await fetch('/api/ai/generate-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'فشل توليد الوصف');
    return json;
  },

  async suggestOrderReply(order) {
    if (!(await isServerMode())) {
      throw new Error('ميزة الذكاء تحتاج تشغيل الموقع عبر السيرفر (node server.js)');
    }
    const res = await fetch('/api/ai/order-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order || {}),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'فشل توليد الرد');
    return json;
  },

  /* ── Integrations (WhatsApp + Instagram bots) ── */
  async integrationStatus() {
    if (!(await isServerMode())) throw new Error('الميزة تحتاج السيرفر');
    const res = await fetch('/api/integrations/status');
    if (!res.ok) throw new Error('فشل جلب حالة البوت');
    return res.json();
  },

  async saveIntegrationSettings(data) {
    if (!(await isServerMode())) throw new Error('الميزة تحتاج السيرفر');
    const res = await fetch('/api/integrations/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'فشل الحفظ');
    return json;
  },

  async testIntegrations() {
    if (!(await isServerMode())) throw new Error('الميزة تحتاج السيرفر');
    const res = await fetch('/api/integrations/test', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'فشل الفحص');
    return json;
  },

  async integrationConversations() {
    if (!(await isServerMode())) throw new Error('الميزة تحتاج السيرفر');
    const res = await fetch('/api/integrations/conversations');
    if (!res.ok) throw new Error('فشل جلب المحادثات');
    return res.json();
  },

  async clearIntegrationConversation(id) {
    if (!(await isServerMode())) throw new Error('الميزة تحتاج السيرفر');
    const res = await fetch('/api/integrations/conversations/' + encodeURIComponent(id) + '/clear', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'فشل المسح');
    return json;
  },
};

/* ── Helpers ── */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ── Formatting (unchanged) ── */
function formatPrice(price, symbol) {
  return `${parseFloat(price).toFixed(2)} ${symbol || 'د.أ'}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
