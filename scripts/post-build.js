const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
const publicDir = path.join(__dirname, '..', 'public');

console.log('[post-build] Processing dist output...');

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
            copyRecursive(path.join(src, child), path.join(dest, child));
        });
    } else {
        fs.copyFileSync(src, dest);
        console.log(`[post-build] Copied ${path.basename(src)} to ${path.relative(distDir, dest)}`);
    }
}

// 1. Copy public directory files to dist recursively
if (fs.existsSync(publicDir)) {
    copyRecursive(publicDir, distDir);
}

// 2. Inject icon, manifest, and google sign-in tags into dist/index.html
if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');

    // Ensure viewport has interactive-widget=resizes-content for virtual keyboard handling
    html = html.replace(
        '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content" />'
    );

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
    }
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('[post-build] Successfully injected icon and manifest tags into dist/index.html');
} else {
    console.warn('[post-build] dist/index.html not found!');
}
