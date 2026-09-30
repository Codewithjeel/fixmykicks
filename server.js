/**
 * FixMyKicks Delhi - Local Backend Server
 * Handles serving the storefront, saving system-uploaded shoe photos to /uploads,
 * and persisting dynamic inventory (10,000+ shoes capable) in /data/products.json
 */

const http = require('http');
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
  'Puma'
];

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
    adminPin: '8080'
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
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    return { whatsappNumber: '919876543210', storeAddress: 'Karol Bagh, New Delhi - 110005', adminPin: '8080' };
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
 * Save a base64 data URL image from admin's system to /uploads folder
 */
function saveUploadedImage(dataUrl, sku, index) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl; // Already a file path
  }
  const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!matches) return null;

  let ext = matches[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'svg+xml') ext = 'svg';
  const base64Data = matches[2];
  const filename = `${sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}-${index}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  return `uploads/${filename}`;
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
        price: Number(payload.price) || 0,
        mrp: Number(payload.mrp) || Number(payload.price) || 0,
        sizes: Array.isArray(payload.sizes) && payload.sizes.length > 0 ? payload.sizes : ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'],
        images: savedImages,
        edition: payload.edition || 'Master Edition',
        description: payload.description || '',
        inStock: payload.inStock !== false,
        createdAt: new Date().toISOString()
      };

      products.unshift(newShoe);
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

  if (pathname === '/api/settings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readSettings()));
    return;
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const current = readSettings();
      const updated = { ...current, ...payload };
      writeSettings(updated);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(updated));
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
    const targetBrand = pathname.replace('/api/brands/', '').trim();
    let brands = readBrands();
    brands = brands.filter(b => b.toLowerCase() !== targetBrand.toLowerCase());
    writeBrands(brands);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(brands));
    return;
  }

  // --- STATIC FILE SERVING ---
  let safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
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
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`FixMyKicks Server running at http://localhost:${PORT}`);
});
