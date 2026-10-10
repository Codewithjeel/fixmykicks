/**
 * FixMyKicks Delhi - Local Backend Server
 * Handles serving the storefront, saving system-uploaded shoe photos to /uploads,
 * and persisting dynamic inventory (10,000+ shoes capable) in /data/products.json
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BRANDS_FILE = path.join(DATA_DIR, 'brands.json');

const DEFAULT_BRANDS = [
  'Nike',
  'Adidas',
  'On Cloud',
  'New Balance',
  'Birkenstock',
  'Crocs',
  'Puma',
  'Onitsuka Tiger'
];

// --- HARDENED ADMIN SECURITY & AUTHENTICATION ENGINE ---
const activeAdminTokens = new Map(); // token -> { createdAt, expiresAt }
const loginRateLimit = new Map();     // ip -> { count, lockedUntil }

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function checkRateLimit(ip) {
  const record = loginRateLimit.get(ip);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return { allowed: false, remainingMins };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginRateLimit.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const record = loginRateLimit.get(ip) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15-minute security lockout
  }
  loginRateLimit.set(ip, record);
  return record;
}

function resetFailedLogin(ip) {
  loginRateLimit.delete(ip);
}

function verifyAdminPin(enteredPin, actualPin) {
  if (typeof enteredPin !== 'string' || typeof actualPin !== 'string') return false;
  if (!enteredPin || !actualPin) return false;
  const hashEntered = crypto.createHash('sha256').update(enteredPin.trim()).digest();
  const hashActual = crypto.createHash('sha256').update(actualPin.trim()).digest();
  return crypto.timingSafeEqual(hashEntered, hashActual);
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24-hour validity
  activeAdminTokens.set(token, { createdAt: Date.now(), expiresAt });
  return token;
}

function isValidAdminToken(req) {
  const authHeader = req.headers['authorization'] || '';
  const customHeader = req.headers['x-admin-token'] || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (customHeader) {
    token = String(customHeader).trim();
  }
  if (!token || !activeAdminTokens.has(token)) return false;
  const session = activeAdminTokens.get(token);
  if (Date.now() > session.expiresAt) {
    activeAdminTokens.delete(token);
    return false;
  }
  return true;
}

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Auto-sync the latest Gen-Z logo & Sneaker Wall Hero Banner into assets/
const GENZ_LOGO_SOURCE = 'C:\\Users\\Jinal\\.gemini\\antigravity\\brain\\14b6160d-8bd9-48dd-933a-f12dd9326a6d\\fixmykicks_genz_logo_1790790491133.jpg';
const TARGET_LOGO_PATH = path.join(ROOT_DIR, 'assets', 'logo.jpg');
const HERO_WALL_SOURCE = 'C:\\Users\\Jinal\\.gemini\\antigravity\\brain\\14b6160d-8bd9-48dd-933a-f12dd9326a6d\\hero_topdown_50_shoes_right_1790791317288.jpg';
const TARGET_HERO_PATH = path.join(ROOT_DIR, 'assets', 'hero_banner.jpg');
const TARGET_TOPDOWN_PATH = path.join(ROOT_DIR, 'assets', 'hero_topdown_shoes.jpg');
try {
  if (fs.existsSync(GENZ_LOGO_SOURCE)) {
    fs.copyFileSync(GENZ_LOGO_SOURCE, TARGET_LOGO_PATH);
  }
  if (fs.existsSync(HERO_WALL_SOURCE)) {
    fs.copyFileSync(HERO_WALL_SOURCE, TARGET_HERO_PATH);
    fs.copyFileSync(HERO_WALL_SOURCE, TARGET_TOPDOWN_PATH);
  }
} catch (_) {}

// Initialize clean products.json (no dummy shoes)
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2), 'utf8');
}

// Initialize default store settings
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    whatsappNumber: '917303039323',
    secondaryWhatsappNumber: '916378599513',
    instagramUrl: 'https://www.instagram.com/fixmykickss.in',
    telegramUrl: 'https://t.me/yashaswani77',
    storeAddress: 'Karol Bagh, New Delhi - 110005',
    adminPin: 'YashFixMyKicks@6290'
  }, null, 2), 'utf8');
}

// Initialize default brands
if (!fs.existsSync(BRANDS_FILE)) {
  fs.writeFileSync(BRANDS_FILE, JSON.stringify(DEFAULT_BRANDS, null, 2), 'utf8');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readProducts() {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
  try {
    const fallbackPath = path.join(DATA_DIR, 'catalog-fallback.js');
    fs.writeFileSync(fallbackPath, 'window.INITIAL_CATALOG = ' + JSON.stringify(products, null, 2) + ';\n', 'utf8');
  } catch (_) {}
  scheduleGitHubSync(products);
}

// GitHub Auto-Commit & Cloud Persistence
const GITHUB_REPO = process.env.GITHUB_REPO || 'Codewithjeel/fixmykicks';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

function getGitHubToken() {
  const settings = readSettings();
  return (process.env.GITHUB_TOKEN || settings.githubToken || '').trim();
}

let _gitSyncTimer = null;
function scheduleGitHubSync(products) {
  const token = getGitHubToken();
  if (!token) return;
  if (_gitSyncTimer) clearTimeout(_gitSyncTimer);
  _gitSyncTimer = setTimeout(() => {
    syncCatalogToGitHub().catch(err => console.error('[GitSync Error]', err.message));
  }, 4000);
}

async function syncCatalogToGitHub() {
  const token = getGitHubToken();
  if (!token) return { success: false, reason: 'No GitHub token configured.' };
  if (!fs.existsSync(PRODUCTS_FILE)) return { success: false, reason: 'products.json not found' };

  const content = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  const pathInRepo = 'data/products.json';
  const base64Content = Buffer.from(content, 'utf8').toString('base64');

  const getSha = () => new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/${pathInRepo}?ref=${GITHUB_BRANCH}`,
      method: 'GET',
      headers: {
        'User-Agent': 'FixMyKicks-Server',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.sha || null);
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });

  const sha = await getSha();

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      message: `Auto-sync sneaker catalog [${new Date().toISOString()}]`,
      content: base64Content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {})
    });

    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/${pathInRepo}`,
      method: 'PUT',
      headers: {
        'User-Agent': 'FixMyKicks-Server',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[GitSync Success] Catalog committed to GitHub permanently!');
          resolve({ success: true });
        } else {
          console.error('[GitSync Failed]', res.statusCode, data);
          resolve({ success: false, status: res.statusCode, error: data });
        }
      });
    });
    req.on('error', err => {
      console.error('[GitSync Network Error]', err.message);
      resolve({ success: false, error: err.message });
    });
    req.write(payload);
    req.end();
  });
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    return {
      whatsappNumber: '917303039323',
      secondaryWhatsappNumber: '916378599513',
      instagramUrl: 'https://www.instagram.com/fixmykickss.in',
      telegramUrl: 'https://t.me/yashaswani77',
      storeAddress: 'Karol Bagh, New Delhi - 110005',
      adminPin: 'YashFixMyKicks@6290'
    };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function readBrands() {
  try {
    const list = JSON.parse(fs.readFileSync(BRANDS_FILE, 'utf8'));
    return Array.isArray(list) && list.length > 0 ? list : DEFAULT_BRANDS;
  } catch (e) {
    return DEFAULT_BRANDS;
  }
}

function writeBrands(brands) {
  fs.writeFileSync(BRANDS_FILE, JSON.stringify(brands, null, 2), 'utf8');
}

/**
 * Save a backup copy of the uploaded image to /uploads folder
 * and retain the compressed data URL so products.json & IndexedDB remain 100% self-contained on cloud hosts.
 */
function saveUploadedImage(dataUrl, sku, index) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }
  try {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      let ext = matches[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (ext === 'svg+xml') ext = 'svg';
      const base64Data = matches[2];
      const filename = `${sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}-${index}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    }
  } catch (_) {}
  return dataUrl;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Allow up to 100MB for multi-photo high-res system uploads
      if (body.length > 100 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // --- API ROUTES ---
  if (pathname === '/api/products' && req.method === 'GET') {
    const products = readProducts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(products));
    return;
  }

  if (pathname === '/api/products' && req.method === 'POST') {
    if (!isValidAdminToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required to upload sneakers.' }));
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const products = readProducts();

      const sku = payload.id || `FMK-${Date.now().toString().slice(-5)}`;
      const savedImages = (payload.images || []).map((img, idx) => saveUploadedImage(img, sku, idx)).filter(Boolean);

      const newShoe = {
        id: sku,
        name: payload.name,
        brand: payload.brand,
        category: payload.category || 'Sneakers',
        gender: payload.gender || 'Men',
        price: Number(payload.price) || 0,
        mrp: Number(payload.mrp) || Number(payload.price) || 0,
        sizes: Array.isArray(payload.sizes) && payload.sizes.length > 0 ? payload.sizes : ['UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'],
        images: savedImages,
        edition: payload.edition || 'Master Edition',
        description: payload.description || '',
        inStock: payload.inStock !== false,
        createdAt: payload.createdAt || new Date().toISOString()
      };

      const existingIdx = products.findIndex(p => p.id === sku);
      if (existingIdx !== -1) {
        products[existingIdx] = newShoe;
      } else {
        products.unshift(newShoe);
      }
      writeProducts(products);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newShoe));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/products/') && req.method === 'PUT') {
    if (!isValidAdminToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required to update sneakers.' }));
      return;
    }

    try {
      const targetId = pathname.replace('/api/products/', '');
      const payload = await parseJsonBody(req);
      const products = readProducts();
      const idx = products.findIndex(p => p.id === targetId);

      if (idx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Product not found' }));
        return;
      }

      const savedImages = (payload.images || products[idx].images).map((img, i) => saveUploadedImage(img, targetId, i)).filter(Boolean);

      products[idx] = {
        ...products[idx],
        name: payload.name ?? products[idx].name,
        brand: payload.brand ?? products[idx].brand,
        category: payload.category ?? products[idx].category,
        gender: payload.gender ?? products[idx].gender ?? 'Men',
        price: payload.price !== undefined ? Number(payload.price) : products[idx].price,
        mrp: payload.mrp !== undefined ? Number(payload.mrp) : products[idx].mrp,
        sizes: payload.sizes ?? products[idx].sizes,
        images: savedImages,
        edition: payload.edition ?? products[idx].edition,
        description: payload.description ?? products[idx].description,
        inStock: payload.inStock !== undefined ? payload.inStock : products[idx].inStock
      };

      writeProducts(products);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(products[idx]));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    if (!isValidAdminToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required to delete sneakers.' }));
      return;
    }

    const targetId = pathname.replace('/api/products/', '');
    let products = readProducts();
    const target = products.find(p => p.id === targetId);
    if (target && Array.isArray(target.images)) {
      target.images.forEach(imgPath => {
        if (imgPath.startsWith('uploads/')) {
          const fullPath = path.join(ROOT_DIR, imgPath);
          if (fs.existsSync(fullPath)) {
            try { fs.unlinkSync(fullPath); } catch (_) {}
          }
        }
      });
    }
    products = products.filter(p => p.id !== targetId);
    writeProducts(products);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deleted: targetId }));
    return;
  }

  // --- PUBLIC SETTINGS ENDPOINT (ZERO SENSITIVE PASSWORDS EXPOSED) ---
  if (pathname === '/api/settings' && req.method === 'GET') {
    const s = readSettings();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      whatsappNumber: s.whatsappNumber || '917303039323',
      secondaryWhatsappNumber: s.secondaryWhatsappNumber || '916378599513',
      instagramUrl: s.instagramUrl || 'https://www.instagram.com/fixmykickss.in',
      telegramUrl: s.telegramUrl || 'https://t.me/yashaswani77',
      storeAddress: s.storeAddress || 'Karol Bagh, New Delhi - 110005'
    }));
    return;
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    if (!isValidAdminToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required to update store settings.' }));
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const current = readSettings();
      // SECURITY: Strip password and system tokens from general settings payload
      delete payload.adminPin;
      delete payload.token;
      delete payload.githubToken;

      const updated = { ...current, ...payload };
      writeSettings(updated);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        whatsappNumber: updated.whatsappNumber,
        secondaryWhatsappNumber: updated.secondaryWhatsappNumber,
        instagramUrl: updated.instagramUrl,
        telegramUrl: updated.telegramUrl,
        storeAddress: updated.storeAddress
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- HARDENED ADMIN AUTHENTICATION WITH BRUTE-FORCE RATE LIMITING ---
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Security lockout: Too many failed login attempts. Try again in ${rateCheck.remainingMins} minute(s).`
      }));
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const settings = readSettings();
      const enteredPin = String(payload.pin || '').trim();
      const actualPin = String(process.env.ADMIN_PIN || settings.adminPin || 'YashFixMyKicks@6290').trim();

      if (verifyAdminPin(enteredPin, actualPin)) {
        resetFailedLogin(ip);
        const token = createAdminSession();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Admin authenticated securely', token }));
      } else {
        const attempt = recordFailedLogin(ip);
        const remaining = Math.max(0, 5 - attempt.count);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: attempt.lockedUntil
            ? 'Security Alert: Account locked for 15 minutes due to repeated incorrect PIN attempts.'
            : `Incorrect Admin PIN. ${remaining} attempt(s) remaining before security lockout.`
        }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      activeAdminTokens.delete(token);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
    return;
  }

  if (pathname === '/api/admin/change-pin' && req.method === 'POST') {
    if (!isValidAdminToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required to change PIN.' }));
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const newPin = String(payload.newPin || '').trim();
      if (!newPin || newPin.length < 4) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'New PIN must be at least 4 characters long.' }));
        return;
      }
      const settings = readSettings();
      settings.adminPin = newPin;
      writeSettings(settings);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Admin PIN updated successfully.' }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/brands' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readBrands()));
    return;
  }

  if (pathname === '/api/brands' && req.method === 'POST') {
    if (!isValidAdminToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required to add brands.' }));
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const brandName = (payload.name || '').trim();
      if (!brandName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Brand name required' }));
        return;
      }
      const brands = readBrands();
      if (!brands.some(b => b.toLowerCase() === brandName.toLowerCase())) {
        brands.push(brandName);
        writeBrands(brands);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(brands));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/brands/') && req.method === 'DELETE') {
    if (!isValidAdminToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required to delete brands.' }));
      return;
    }

    const targetBrand = pathname.replace('/api/brands/', '').trim();
    let brands = readBrands();
    brands = brands.filter(b => b.toLowerCase() !== targetBrand.toLowerCase());
    writeBrands(brands);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(brands));
    return;
  }

  // --- STATIC FILE SERVING WITH SECURITY FIREWALL ---
  let safePath = pathname === '/' ? '/index.html' : pathname;
  const lowerPath = safePath.toLowerCase();

  // SECURITY FIREWALL: Block private system files, settings, and credentials from direct download
  if (
    lowerPath.includes('settings.json') ||
    lowerPath.includes('.env') ||
    lowerPath.includes('server.js') ||
    lowerPath.includes('package.json') ||
    lowerPath.includes('..') ||
    (lowerPath.startsWith('/data/') && !['/data/catalog-fallback.js', '/data/products.json', '/data/brands.json'].includes(lowerPath))
  ) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access Forbidden: Private system resource' }));
    return;
  }

  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`FixMyKicks Server running at http://localhost:${PORT}`);
});
