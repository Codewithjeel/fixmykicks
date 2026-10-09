/**
 * FixMyKicks Delhi — Dynamic Inventory & Brand Storage Engine
 * - Zero dummy products (displays only real shoes uploaded by Admin)
 * - Dynamic Brands API (Admin can add/remove any brand)
 * - Uses local server API (/api/products & /api/brands) with IndexedDB/localStorage fallback
 */

const DEFAULT_STORE_BRANDS = [
  "Nike",
  "Adidas",
  "On Cloud",
  "New Balance",
  "Birkenstock",
  "Crocs",
  "Puma",
  "Onitsuka Tiger"
];

const STORE_CATEGORIES = [
  "Sneakers",
  "Running",
  "High Tops",
  "Low Tops",
  "Clogs & Mules",
  "Slides & Sandals",
  "Basketball"
];

const STANDARD_SIZES = [
  { uk: "UK 3.5", eu: "EU 36", cm: "22.5 cm" },
  { uk: "UK 4", eu: "EU 37", cm: "23.5 cm" },
  { uk: "UK 5", eu: "EU 38", cm: "24.0 cm" },
  { uk: "UK 5.5", eu: "EU 39", cm: "24.5 cm" },
  { uk: "UK 6", eu: "EU 40", cm: "25.0 cm" },
  { uk: "UK 7", eu: "EU 41", cm: "26.0 cm" },
  { uk: "UK 8", eu: "EU 42", cm: "26.5 cm" },
  { uk: "UK 9", eu: "EU 43", cm: "27.5 cm" },
  { uk: "UK 10", eu: "EU 44", cm: "28.5 cm" },
  { uk: "UK 11", eu: "EU 45", cm: "29.5 cm" }
];

/**
 * Dynamic Brands API (Server + LocalStorage Sync)
 */
const BrandsAPI = {
  async fetchAll() {
    try {
      const res = await fetch('/api/brands', { cache: 'no-store' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          localStorage.setItem('fmk_brands', JSON.stringify(list));
          return list;
        }
      }
    } catch (_) {}

    try {
      const saved = JSON.parse(localStorage.getItem('fmk_brands') || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (_) {}

    localStorage.setItem('fmk_brands', JSON.stringify(DEFAULT_STORE_BRANDS));
    return [...DEFAULT_STORE_BRANDS];
  },

  async add(brandName) {
    const clean = (brandName || '').trim();
    if (!clean) return await this.fetchAll();

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean })
      });
      if (res.ok) {
        const updated = await res.json();
        localStorage.setItem('fmk_brands', JSON.stringify(updated));
        return updated;
      }
    } catch (_) {}

    const current = await this.fetchAll();
    if (!current.some(b => b.toLowerCase() === clean.toLowerCase())) {
      current.push(clean);
      localStorage.setItem('fmk_brands', JSON.stringify(current));
    }
    return current;
  },

  async remove(brandName) {
    const clean = (brandName || '').trim();
    try {
      const res = await fetch(`/api/brands/${encodeURIComponent(clean)}`, { method: 'DELETE' });
      if (res.ok) {
        const updated = await res.json();
        localStorage.setItem('fmk_brands', JSON.stringify(updated));
        return updated;
      }
    } catch (_) {}

    let current = await this.fetchAll();
    current = current.filter(b => b.toLowerCase() !== clean.toLowerCase());
    localStorage.setItem('fmk_brands', JSON.stringify(current));
    return current;
  }
};

/**
 * IndexedDB Adapter (handles large system photo uploads when opened without server)
 */
const IDB_NAME = 'FixMyKicksDB_v2';
const IDB_STORE = 'shoes';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll() {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return [];
  }
}

async function idbSave(product) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(product);
    tx.oncomplete = () => resolve(product);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Unified Inventory API (Server-first + IndexedDB sync)
 */
const InventoryAPI = {
  async fetchAll() {
    localStorage.removeItem('fmk_custom_products');

    let serverItems = [];
    let apiAvailable = false;

    // 1. Try server API
    try {
      const res = await fetch('/api/products', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          serverItems = data;
          apiAvailable = true;
        }
      }
    } catch (_) {}

    // 2. Fallback to static products.json
    if (!apiAvailable || serverItems.length === 0) {
      try {
        const staticRes = await fetch('data/products.json', { cache: 'no-store' });
        if (staticRes.ok) {
          const staticData = await staticRes.json();
          if (Array.isArray(staticData) && staticData.length > 0) {
            serverItems = staticData;
            apiAvailable = true;
          }
        }
      } catch (_) {}
    }

    // 3. Fallback to pre-bundled window.INITIAL_CATALOG if server is asleep or slow
    if ((!apiAvailable || serverItems.length === 0) && Array.isArray(window.INITIAL_CATALOG) && window.INITIAL_CATALOG.length > 0) {
      serverItems = window.INITIAL_CATALOG.map(x => ({ ...x }));
      apiAvailable = true;
    }

    // Load deliberate deletion IDs so we never resurrect intentionally deleted shoes
    const deletedIds = new Set(JSON.parse(localStorage.getItem('fmk_deleted_shoe_ids') || '[]'));

    // 4. Retrieve local items from this device's IndexedDB
    const localItems = await idbGetAll();
    const catalogMap = new Map();

    serverItems.forEach(item => {
      if (item && item.id && !deletedIds.has(item.id)) {
        catalogMap.set(item.id, item);
      }
    });

    // SELF-HEALING SYNC:
    // If a shoe was added by user on this device, but the cloud server reset/restarted and doesn't have it,
    // NEVER DELETE IT! Restore it and auto-reupload to the cloud server!
    for (const localItem of localItems) {
      if (localItem && localItem.id) {
        if (deletedIds.has(localItem.id)) {
          // Deliberately deleted by admin: remove from local cache
          await idbDelete(localItem.id).catch(() => {});
        } else if (!catalogMap.has(localItem.id)) {
          // Missing on server (e.g. server restart) — restore it!
          catalogMap.set(localItem.id, localItem);
          if (window.location.protocol.startsWith('http')) {
            fetch('/api/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(localItem)
            }).catch(() => {});
          }
        }
      }
    }

    const merged = Array.from(catalogMap.values());

    // Update local IndexedDB with merged catalog so it's 100% resilient offline
    for (const item of merged) {
      try { await idbSave(item); } catch (_) {}
    }

    merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return merged;
  },

  async create(productData) {
    const brandPrefix = (productData.brand || 'FMK').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'SH';
    const uniqueNum = Date.now().toString().slice(-5);
    const newProduct = {
      id: productData.id || `FMK-${brandPrefix}-${uniqueNum}`,
      name: productData.name,
      brand: productData.brand,
      category: productData.category || 'Sneakers',
      gender: productData.gender || 'Unisex',
      price: Number(productData.price) || 0,
      mrp: Number(productData.mrp) || Number(productData.price) || 0,
      sizes: productData.sizes || ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'],
      images: productData.images || [],
      edition: productData.edition || 'Master Edition',
      description: productData.description || '',
      inStock: productData.inStock !== false,
      createdAt: new Date().toISOString()
    };

    // Ensure this new ID is cleared from any deleted list
    const deletedIds = new Set(JSON.parse(localStorage.getItem('fmk_deleted_shoe_ids') || '[]'));
    if (deletedIds.has(newProduct.id)) {
      deletedIds.delete(newProduct.id);
      localStorage.setItem('fmk_deleted_shoe_ids', JSON.stringify([...deletedIds]));
    }

    let serverSaved = false;
    let saved = newProduct;

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        saved = await res.json();
        serverSaved = true;
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('Server create warning:', err);
      await idbSave(newProduct);
      if (!serverSaved && window.location.protocol.startsWith('http')) {
        throw new Error(`Cloud server save failed: ${err.message}`);
      }
    }

    await idbSave(saved);
    return saved;
  },

  async update(id, productData) {
    let serverUpdated = false;
    let updated = { ...productData, id };

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      if (res.ok) {
        updated = await res.json();
        serverUpdated = true;
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('Server update warning:', err);
      await idbSave(updated);
      if (!serverUpdated && window.location.protocol.startsWith('http')) {
        throw new Error(`Cloud server update failed: ${err.message}`);
      }
    }

    await idbSave(updated);
    return updated;
  },

  async remove(id) {
    // Record in deleted list so self-healing sync never resurrects it
    const deletedIds = new Set(JSON.parse(localStorage.getItem('fmk_deleted_shoe_ids') || '[]'));
    deletedIds.add(id);
    localStorage.setItem('fmk_deleted_shoe_ids', JSON.stringify([...deletedIds]));

    try {
      await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (_) {}
    await idbDelete(id);
    return true;
  }
};

window.DEFAULT_STORE_BRANDS = DEFAULT_STORE_BRANDS;
window.STORE_CATEGORIES = STORE_CATEGORIES;
window.STANDARD_SIZES = STANDARD_SIZES;
window.BrandsAPI = BrandsAPI;
window.InventoryAPI = InventoryAPI;
