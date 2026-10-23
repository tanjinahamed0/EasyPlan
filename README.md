# EasyPlan — To-Do List & Productivity App

A lightweight, static to-do list and productivity app built from the original `taskflow_dashboard_ui.html` design. Light theme with slate-gray surfaces and indigo accents, no frameworks, no build step — plain HTML, CSS, and JavaScript with Tailwind CSS (CDN) and Lucide icons. The app starts with an empty task list.

## Features

- **Task management** — create, edit, complete/reactivate, and delete tasks (with confirmation).
- **Task details** — title, optional description, due date (`YYYY-MM-DD`), priority (Low / Medium / High), and category (Personal / Work / Study).
- **Sidebar views** — Dashboard, My Tasks, Today, Upcoming, and Completed, each filtering the task list.
- **Category lists** — filter by Personal, Work, or Study; counts update from real data.
- **Search & filters** — search across titles, descriptions, and categories; combine with All/Active/Completed tabs and the priority filter.
- **Live statistics** — Total, Completed (with completion rate), In Progress, and Overdue cards, all calculated from actual tasks.
- **Today's Progress panel** — circular progress based on tasks due today and their completion status.
- **Upcoming Deadlines panel** — real incomplete tasks with due dates from today onward, sorted by date.
- **Persistence** — everything is saved to browser Local Storage on every change. The app starts empty; there are no starter or sample tasks.
- **Responsive layout** — desktop three-column layout, collapsible off-canvas sidebar with backdrop on tablet/mobile.
- **Accessible UI** — labeled form controls, `aria` attributes on dialogs/filters, Escape closes modals and the mobile sidebar, focus-visible styles, scroll lock while a modal is open.
- **Safe rendering** — all user-entered text is HTML-escaped; nothing is inserted raw into `innerHTML`.

## File structure

```
EasyPlan/
├── index.html   # Markup: sidebar, dashboard, task list, panels, modals
├── style.css    # Custom styles: scrollbars, checkboxes, active-nav icons
├── script.js    # All application logic (state, rendering, storage, events)
└── README.md
```

## Running locally

No build step or dependencies to install. Any static server works:

```bash
# Option 1: Node (if installed)
npx serve .

# Option 2: Python (if installed)
python -m http.server 8080
```

Then open `http://localhost:8080`. Opening `index.html` directly (double-click) also works in most browsers.

## Deploying

The site is fully static — drop the folder onto Vercel, Netlify, or GitHub Pages as-is.

## Data & Local Storage notes

- Tasks are stored in your browser's **Local Storage** under the key `easyplan.tasks.v1`.
- Local Storage is **browser- and device-specific**: data does not sync across browsers, devices, or users, and there is no cloud backup. Clearing your browser's site data will erase your tasks.
- If stored data is missing or corrupted, the app recovers gracefully (invalid entries are dropped or the list resets).
- The task list starts empty by default — nothing is pre-seeded.

## External dependencies

- **Tailwind CSS (CDN)** and **Lucide icons (CDN)** are loaded from the network. The Inter font falls back to system fonts if Google Fonts is unavailable. If the Tailwind CDN cannot be reached, the app injects a minimal fallback stylesheet so it remains usable (layout will look plainer).

## Known limitations

- No dark-mode/theme toggle: the design system is light-theme only, and adding one would require restyling every component; light mode is the intended default.
- Fixed categories (Personal / Work / Study) — no custom lists yet.
- The Tailwind CDN prints a console warning recommending the production build; it is harmless for local use, and for production you may later swap the CDN for a compiled Tailwind stylesheet.
