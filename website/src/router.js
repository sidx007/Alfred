// ── Simple hash-based SPA router ────────────────────────────────────

const routes = {};
let currentRoute = null;

export function registerRoute(path, renderFn) {
    routes[path] = renderFn;
}

export function navigate(path) {
    window.location.hash = path;
}

export function getCurrentRoute() {
    return currentRoute;
}

export function startRouter(container) {
    function handleRoute() {
        const hash = window.location.hash.slice(1) || "/chat";
        currentRoute = hash;

        // Update active nav
        document.querySelectorAll(".nav-item").forEach((el) => {
            el.classList.toggle("active", el.dataset.route === hash);
        });

        // Render page
        const renderFn = routes[hash];
        if (renderFn) {
            container.innerHTML = "";
            renderFn(container);
        }
    }

    window.addEventListener("hashchange", handleRoute);
    handleRoute();
}
