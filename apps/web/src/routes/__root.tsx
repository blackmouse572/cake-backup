/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { fontLinks, globalCss } from "../styles";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#fcfcfc" },
      { title: "Cage" },
    ],
    links: [...fontLinks, { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
  shellComponent: RootDocument,
  component: Outlet,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
