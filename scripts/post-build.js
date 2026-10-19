const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
const publicDir = path.join(__dirname, '..', 'public');

console.log('[post-build] Processing dist output...');

// 1. Copy public directory files to dist
if (fs.existsSync(publicDir)) {
    const files = fs.readdirSync(publicDir);
    files.forEach(file => {
        const src = path.join(publicDir, file);
        const dest = path.join(distDir, file);
        fs.copyFileSync(src, dest);
        console.log(`[post-build] Copied ${file} to dist/`);
    });
}

// 2. Inject icon, manifest, and google sign-in tags into dist/index.html
if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');

    const tagsToInject = `
    <!-- App Icon & Favicon with cache-busting -->
    <link rel="icon" type="image/png" href="/favicon.png?v=3" />
    <link rel="shortcut icon" href="/favicon.ico?v=3" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icon.png?v=3" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#1E3A8A" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

    <!-- Google Sign-In SDK -->
    <script src="https://accounts.google.com/gsi/client" async defer></script>
  </head>`;

    if (!html.includes('/favicon.png?v=3')) {
        html = html.replace('</head>', tagsToInject);
        fs.writeFileSync(indexPath, html, 'utf8');
        console.log('[post-build] Successfully injected icon and manifest tags into dist/index.html');
    }
} else {
    console.warn('[post-build] dist/index.html not found!');
}
