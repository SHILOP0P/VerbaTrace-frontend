// Keep workspace code out of the public page, including on static hosts whose
// fallback sends index.html for every route.
if (location.pathname === "/app" || location.pathname.startsWith("/app/")) {
  void import("./main");
} else {
  void import("./features/landing/main");
}
