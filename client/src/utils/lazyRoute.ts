import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const ROUTE_RELOAD_KEY = "your-five:route-chunk-reload";

/** Reload once when an open tab still points at chunks removed by a newer deployment. */
export function lazyRoute<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await loader();
      try {
        window.sessionStorage.removeItem(ROUTE_RELOAD_KEY);
      } catch {
        // A working route should not depend on storage access.
      }
      return module;
    } catch (error) {
      let shouldReload = false;
      try {
        if (window.sessionStorage.getItem(ROUTE_RELOAD_KEY) !== window.location.pathname) {
          window.sessionStorage.setItem(ROUTE_RELOAD_KEY, window.location.pathname);
          shouldReload = true;
        }
      } catch {
        // The error boundary remains available when storage is disabled.
      }
      if (shouldReload) {
        window.location.reload();
        return new Promise<never>(() => undefined);
      }
      throw error;
    }
  });
}
