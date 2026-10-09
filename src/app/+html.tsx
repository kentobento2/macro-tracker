import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Root HTML for web (static rendering only; never runs on native).
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        {/* Status bar / title bar color, following the phone's light or dark mode (the app's background colors in
            src/constants/theme.ts). The manifest's theme_color can only hold one value; it's used before this loads. */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F2F3F5" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0C0F12" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Macros" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
