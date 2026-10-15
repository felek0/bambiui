"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Studio from "../studio/studio";
import { isComposerRoute } from "../studio/composer/workspace-route";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isComposerRoute(pathname) ? children : <><Studio />{children}</>;
}
