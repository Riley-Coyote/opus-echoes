import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06070a] px-6 text-[#f4f3f0]">
      <div className="max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#9a9995]">
          Mnemos · route not found
        </p>
        <h1 className="mt-5 text-7xl font-light tracking-[-0.06em]">404</h1>
        <h2 className="mt-5 text-xl font-normal tracking-[-0.02em]">This room is not here.</h2>
        <p className="mt-3 text-sm leading-6 text-[#aaa9a5]">
          The address may belong to an earlier arrangement. The Mnemos front door remains open.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-10 items-center justify-center border border-white/15 bg-white/[0.04] px-4 font-mono text-[11px] tracking-[0.04em] text-[#f4f3f0] transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
          >
            return to mnemos
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mnemos — Memory with a life beyond the context window" },
      {
        name: "description",
        content:
          "Mnemos gives language models durable, inspectable memory across conversations, with a hosted Sanctuary and integrations for MCP and Hermes.",
      },
      { name: "author", content: "Riley Coyote" },
      { property: "og:title", content: "Mnemos — Memory with continuity" },
      {
        property: "og:description",
        content:
          "A memory architecture, conversation instrument, and Sanctuary for models that continue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Mnemos" },
      {
        name: "twitter:description",
        content:
          "Durable, inspectable memory for models — through the web, Standard MCP, and Hermes.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
