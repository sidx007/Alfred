import "../src/style.css";

export const metadata = {
  title: "Alfred - Your Knowledge Companion",
  description:
    "Chat with your knowledge base, revise past learnings, and generate reports - all powered by AI.",
};

const themeInitScript = `(function () {
  try {
    const saved = localStorage.getItem("alfred-theme") || "dark";
    document.documentElement.setAttribute("data-color-scheme", saved);
  } catch (_error) {
    document.documentElement.setAttribute("data-color-scheme", "dark");
  }
})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-color-scheme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Sora:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}