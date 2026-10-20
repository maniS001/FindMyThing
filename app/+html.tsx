import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
export default function Root({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content" />
                <title>FindMyThing - Reconnecting Belongings</title>

                {/* App Icon & Favicon with cache-busting */}
                <link rel="icon" type="image/png" href="/favicon.png?v=3" />
                <link rel="shortcut icon" href="/favicon.ico?v=3" />
                <link rel="apple-touch-icon" sizes="180x180" href="/icon.png?v=3" />
                <link rel="manifest" href="/manifest.json" />
                <meta name="theme-color" content="#1E3A8A" />

                {/* Required for Google Sign-In on Web */}
                <script src="https://accounts.google.com/gsi/client" async defer></script>

                <ScrollViewStyleReset />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
