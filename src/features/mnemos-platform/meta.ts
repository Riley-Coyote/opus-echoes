const SITE_ORIGIN = "https://mnemos.chat";

export function platformHead({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const url = `${SITE_ORIGIN}${path}`;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "theme-color", content: "#06070a" },
      { name: "color-scheme", content: "dark" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:site_name", content: "Mnemos" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [
      { rel: "canonical", href: url },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous" as const,
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@300;400;500&display=swap",
      },
    ],
  };
}
