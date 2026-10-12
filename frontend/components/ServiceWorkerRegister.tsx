"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            // Check for service worker updates periodically
            registration.addEventListener("updatefound", () => {
              const installing = registration.installing;
              if (installing) {
                installing.addEventListener("statechange", () => {
                  if (installing.state === "installed" && navigator.serviceWorker.controller) {
                    console.log("New content is available; please refresh.");
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn("ServiceWorker registration failed:", err);
          });
      };

      if (document.readyState === "complete") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW);
        return () => window.removeEventListener("load", registerSW);
      }
    }
  }, []);

  return null;
}
