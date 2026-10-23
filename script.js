/* EasyPlan — application logic
 * Tasks are persisted in localStorage under a stable key.
 * All user-entered text is escaped before being inserted into HTML.
 */
(function () {
    'use strict';

    // ---------- Constants ----------
    var STORAGE_KEY = 'easyplan.tasks.v1';
    var PRIORITIES = ['Low', 'Medium', 'High'];
    var CATEGORIES = ['Personal', 'Work', 'Study'];
    var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    var VIEW_TITLES = {
        dashboard: 'My Tasks',
        tasks: 'My Tasks',
        today: 'Today',
        upcoming: 'Upcoming',
        completed: 'Completed'
    };

    var TIPS = [
        '"Try the Pomodoro Technique: 25 minutes of deep focus followed by a 5-minute break."',
        '"Break large tasks into small steps — starting is the hardest part."',
        '"Do the hardest task first. Everything after it will feel easier."',
        '"A two-minute task? Do it right away instead of writing it down."',
        '"End each day by planning the top three tasks for tomorrow."',
        '"Group similar tasks together to avoid context-switching costs."',
        '"Schedule breaks like meetings — they protect your focus."'
    ];

    // ---------- State ----------
    var tasks = [];
    var state = {
        view: 'tasks',
        category: null,
        status: 'all',       // all | active | completed
        priority: 'all',     // all | Low | Medium | High
        search: ''
    };
    var editingId = null;
    var pendingDeleteId = null;

    // ---------- DOM refs ----------
    function $(id) { return document.getElementById(id); }

    var els = {};
    function cacheDom() {
        ['sidebar', 'mobileBackdrop', 'menuBtn', 'sidebarCloseBtn', 'logoBtn',
            'searchInput', 'priorityFilter', 'taskList', 'emptyState', 'emptyStateTitle',
            'emptyStateText', 'emptyStateAddBtn', 'sectionTitle', 'activeCountBadge',
            'clearCategoryChip', 'categoryChipLabel', 'statTotal', 'statTotalSub',
            'statCompleted', 'statCompletedSub', 'statInProgress', 'statOverdue',
            'statOverdueSub', 'navDashCount', 'navTaskCount', 'navTodayBadge',
            'todayProgressSub', 'todayProgressPct', 'todayProgressBadge', 'progressCircle',
            'progressBar', 'upcomingList', 'viewAllDeadlines', 'tipText', 'greetingTitle',
            'addTaskBtn', 'taskModal', 'taskForm', 'taskTitleInput', 'taskDescInput',
            'taskDueDateInput', 'taskPriorityInput', 'taskCategoryInput', 'modalTitle',
            'modalIcon', 'modalCloseBtn', 'modalCancelBtn', 'modalSubmitBtn', 'titleError',
            'confirmModal', 'confirmText', 'confirmCancelBtn', 'confirmDeleteBtn'
        ].forEach(function (id) { els[id] = $(id); });
    }

    // ---------- Utilities ----------
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function toISO(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function todayISO() { return toISO(new Date()); }

    function parseISO(iso) {
        var parts = iso.split('-');
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }

    function dayDiff(iso) {
        var a = parseISO(iso).getTime();
        var b = parseISO(todayISO()).getTime();
        return Math.round((a - b) / 86400000);
    }

    function formatDateLabel(iso) {
        if (!iso) return '';
        var diff = dayDiff(iso);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Tomorrow';
        if (diff === -1) return 'Yesterday';
        var d = parseISO(iso);
        var label = MONTHS[d.getMonth()] + ' ' + d.getDate();
        if (d.getFullYear() !== new Date().getFullYear()) label += ', ' + d.getFullYear();
        return label;
    }

    function isOverdue(task) {
        return !task.completed && !!task.dueDate && task.dueDate < todayISO();
    }

    function refreshIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // ---------- Persistence ----------
    function sanitizeTask(raw) {
        if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || !raw.title.trim()) return null;
        var due = typeof raw.dueDate === 'string' && DATE_RE.test(raw.dueDate) && !isNaN(parseISO(raw.dueDate).getTime())
            ? raw.dueDate : null;
        return {
            id: typeof raw.id === 'number' ? raw.id : Date.now() + Math.floor(Math.random() * 1000),
            title: raw.title.slice(0, 120),
            description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : '',
            priority: PRIORITIES.indexOf(raw.priority) !== -1 ? raw.priority : 'Medium',
            dueDate: due,
            category: CATEGORIES.indexOf(raw.category) !== -1 ? raw.category : 'Personal',
            completed: !!raw.completed,
            createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
        };
    }

    function loadTasks() {
        var stored = null;
        try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }

        if (stored) {
            try {
                var parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    tasks = parsed.map(sanitizeTask).filter(Boolean);
                    return;
                }
            } catch (e) {
                // Corrupt data — start with an empty list.
            }
        }

        tasks = [];
    }

    function saveTasks() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } catch (e) { /* storage full or unavailable — app still works in-memory */ }
    }

    // ---------- Filtering ----------
    function getVisibleTasks() {
        var today = todayISO();
        var search = state.search.trim().toLowerCase();

        return tasks.filter(function (task) {
            // View (sidebar navigation)
            if (state.view === 'today' && task.dueDate !== today) return false;
            if (state.view === 'upcoming' && (!task.dueDate || task.dueDate < today)) return false;
            if (state.view === 'completed' && !task.completed) return false;

            // Category (sidebar lists)
            if (state.category && task.category !== state.category) return false;

            // Status tabs
            if (state.status === 'active' && task.completed) return false;
            if (state.status === 'completed' && !task.completed) return false;

            // Priority select
            if (state.priority !== 'all' && task.priority !== state.priority) return false;

            // Search across title, description, category
            if (search) {
                var haystack = (task.title + ' ' + task.description + ' ' + task.category).toLowerCase();
                if (haystack.indexOf(search) === -1) return false;
            }

            return true;
        });
    }

    // ---------- Rendering: task list ----------
    function priorityBadgeClasses(priority) {
        if (priority === 'High') return 'bg-rose-50 text-rose-600 border border-rose-100';
        if (priority === 'Medium') return 'bg-amber-50 text-amber-600 border border-amber-100';
        return 'bg-brand-50 text-brand-600 border border-brand-100';
    }

    function categoryDotClasses(category) {
        if (category === 'Work') return 'bg-brand-500';
        if (category === 'Personal') return 'bg-emerald-500';
        if (category === 'Study') return 'bg-purple-500';
        return 'bg-slate-500';
    }

    function taskRowHtml(task) {
        var overdue = isOverdue(task);
        var dueLabel = task.dueDate ? formatDateLabel(task.dueDate) : 'No date';
        var dueClasses = overdue ? 'text-rose-600 font-semibold' : (task.dueDate ? 'text-slate-400' : 'text-slate-300');
        var toggleLabel = task.completed
            ? 'Mark "' + task.title + '" as active'
            : 'Mark "' + task.title + '" as completed';

        return '' +
            '<div class="p-4 sm:px-6 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4 group' +
                (task.completed ? ' opacity-60 bg-slate-50/40' : '') + '" role="listitem">' +
                '<div class="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">' +
                    '<input type="checkbox" class="custom-checkbox mt-1 sm:mt-0 flex-shrink-0" data-action="toggle" data-id="' + task.id + '"' +
                        (task.completed ? ' checked' : '') + ' aria-label="' + escapeHtml(toggleLabel) + '">' +
                    '<div class="min-w-0 flex-1">' +
                        '<div class="flex flex-wrap items-center gap-2">' +
                            '<span class="text-sm font-semibold ' + (task.completed ? 'line-through text-slate-400' : 'text-slate-800') + ' truncate">' + escapeHtml(task.title) + '</span>' +
                            '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-md ' + priorityBadgeClasses(task.priority) + '">' + task.priority + '</span>' +
                            '<span class="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-medium">' +
                                '<span class="w-1.5 h-1.5 rounded-full ' + categoryDotClasses(task.category) + '"></span>' + task.category +
                            '</span>' +
                        '</div>' +
                        (task.description ? '<p class="text-xs text-slate-500 mt-0.5 truncate">' + escapeHtml(task.description) + '</p>' : '') +
                        '<div class="flex sm:hidden items-center gap-1 text-xs mt-1 ' + dueClasses + '">' +
                            '<span>' + (overdue ? 'Overdue · ' : '') + dueLabel + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="flex items-center gap-1 sm:gap-3 flex-shrink-0">' +
                    '<div class="hidden sm:flex items-center gap-1 text-xs font-medium ' + dueClasses + '">' +
                        '<i data-lucide="calendar" class="w-3.5 h-3.5"></i>' +
                        '<span>' + (overdue ? 'Overdue · ' : '') + dueLabel + '</span>' +
                    '</div>' +
                    '<button type="button" data-action="edit" data-id="' + task.id + '" aria-label="Edit task" ' +
                        'class="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-all sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">' +
                        '<i data-lucide="pencil" class="w-4 h-4"></i>' +
                    '</button>' +
                    '<button type="button" data-action="delete" data-id="' + task.id + '" aria-label="Delete task" ' +
                        'class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">' +
                        '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function renderTasks() {
        var visible = getVisibleTasks();

        if (visible.length === 0) {
            els.taskList.innerHTML = '';
            els.taskList.classList.add('hidden');
            els.emptyState.classList.remove('hidden');
            if (tasks.length === 0) {
                els.emptyStateTitle.textContent = 'No tasks yet';
                els.emptyStateText.textContent = 'Create your first task and start organizing your day.';
            } else {
                els.emptyStateTitle.textContent = 'All caught up!';
                els.emptyStateText.textContent = 'There are no tasks matching your current view or filter. Take a breath or create a new task.';
            }
        } else {
            els.emptyState.classList.add('hidden');
            els.taskList.classList.remove('hidden');
            els.taskList.innerHTML = visible.map(taskRowHtml).join('');
        }

        els.activeCountBadge.textContent = visible.length;
        refreshIcons();
    }

    // ---------- Rendering: stats, sidebar, panels ----------
    function renderStats() {
        var total = tasks.length;
        var completed = tasks.filter(function (t) { return t.completed; }).length;
        var inProgress = total - completed;
        var overdue = tasks.filter(isOverdue).length;
        var dueToday = tasks.filter(function (t) { return t.dueDate === todayISO(); }).length;
        var rate = total > 0 ? Math.round((completed / total) * 100) : 0;

        els.statTotal.textContent = total;
        els.statTotalSub.textContent = dueToday === 1 ? '1 task due today' : dueToday + ' tasks due today';
        els.statCompleted.textContent = completed;
        els.statCompletedSub.textContent = rate + '% completion rate';
        els.statInProgress.textContent = inProgress;
        els.statOverdue.textContent = overdue;
        els.statOverdueSub.textContent = overdue > 0 ? 'Requires attention' : 'Nothing overdue';
        els.statOverdueSub.className = overdue > 0
            ? 'text-[11px] text-rose-500 font-medium mt-1'
            : 'text-[11px] text-slate-400 mt-1';
    }

    function renderSidebarCounts() {
        els.navDashCount.textContent = tasks.length;
        els.navTaskCount.textContent = tasks.filter(function (t) { return !t.completed; }).length;

        var dueToday = tasks.filter(function (t) { return t.dueDate === todayISO() && !t.completed; }).length;
        els.navTodayBadge.textContent = dueToday + ' due';
        els.navTodayBadge.classList.toggle('hidden', dueToday === 0);

        CATEGORIES.forEach(function (cat) {
            var el = document.querySelector('[data-count="' + cat + '"]');
            if (el) {
                el.textContent = tasks.filter(function (t) { return t.category === cat; }).length;
            }
        });
    }

    function renderNavActive() {
        document.querySelectorAll('.nav-item').forEach(function (item) {
            var active = item.getAttribute('data-view') === state.view;
            item.classList.toggle('bg-brand-50', active);
            item.classList.toggle('text-brand-600', active);
            item.classList.toggle('active', active);
            item.classList.toggle('text-slate-600', !active);
            item.setAttribute('aria-current', active ? 'page' : 'false');
        });

        document.querySelectorAll('.category-item').forEach(function (item) {
            var cat = item.getAttribute('data-category');
            var active = !!cat && cat === state.category;
            item.classList.toggle('bg-brand-50', active);
            item.classList.toggle('text-brand-600', active);
            item.classList.toggle('active', active);
            if (cat) item.classList.toggle('text-slate-600', !active);
        });

        // Category chip next to the section title
        if (state.category) {
            els.categoryChipLabel.textContent = state.category;
            els.clearCategoryChip.classList.remove('hidden');
            els.clearCategoryChip.classList.add('inline-flex');
        } else {
            els.clearCategoryChip.classList.add('hidden');
            els.clearCategoryChip.classList.remove('inline-flex');
        }
    }

    function renderTodayProgress() {
        var today = todayISO();
        var dueToday = tasks.filter(function (t) { return t.dueDate === today; });
        var doneToday = dueToday.filter(function (t) { return t.completed; }).length;
        var pct = dueToday.length > 0 ? Math.round((doneToday / dueToday.length) * 100) : 0;

        els.todayProgressSub.textContent = dueToday.length === 0
            ? 'No tasks due today.'
            : "You've completed " + doneToday + ' of ' + dueToday.length + ' tasks due today!';
        els.progressCircle.setAttribute('stroke-dasharray', pct + ', 100');
        els.todayProgressPct.textContent = pct + '%';
        els.progressBar.style.width = pct + '%';

        var badgeText, badgeClass;
        if (dueToday.length === 0) {
            badgeText = 'Add tasks due today to track progress';
            badgeClass = 'text-slate-500 bg-slate-100 border-slate-200';
        } else if (pct >= 100) {
            badgeText = 'Daily goal achieved! 🎉';
            badgeClass = 'text-emerald-600 bg-emerald-50 border-emerald-100';
        } else if (pct >= 50) {
            badgeText = 'Almost at daily goal! 🔥';
            badgeClass = 'text-emerald-600 bg-emerald-50 border-emerald-100';
        } else {
            badgeText = 'Keep going! 💪';
            badgeClass = 'text-brand-600 bg-brand-50 border-brand-100';
        }
        els.todayProgressBadge.textContent = badgeText;
        els.todayProgressBadge.className = 'text-[11px] font-medium px-2 py-0.5 rounded-md border ' + badgeClass;
    }

    function renderUpcomingDeadlines() {
        var today = todayISO();
        var priorityRank = { High: 0, Medium: 1, Low: 2 };
        var upcoming = tasks
            .filter(function (t) { return !t.completed && t.dueDate && t.dueDate >= today; })
            .sort(function (a, b) {
                if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
                return priorityRank[a.priority] - priorityRank[b.priority];
            })
            .slice(0, 4);

        if (upcoming.length === 0) {
            els.upcomingList.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No upcoming deadlines. Enjoy the calm!</p>';
            return;
        }

        var barColor = { High: 'bg-rose-500', Medium: 'bg-amber-500', Low: 'bg-brand-500' };
        var badgeStyle = {
            High: 'text-rose-600 bg-rose-50',
            Medium: 'text-amber-600 bg-amber-50',
            Low: 'text-brand-600 bg-brand-50'
        };
        var badgeText = { High: 'High', Medium: 'Med', Low: 'Low' };

        els.upcomingList.innerHTML = upcoming.map(function (t) {
            var isToday = t.dueDate === today;
            return '' +
                '<div class="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between gap-2 hover:border-slate-300 transition-all">' +
                    '<div class="flex items-center gap-3 min-w-0">' +
                        '<div class="w-2 h-8 rounded-full flex-shrink-0 ' + barColor[t.priority] + '"></div>' +
                        '<div class="leading-tight min-w-0">' +
                            '<div class="text-xs font-semibold text-slate-800 truncate">' + escapeHtml(t.title) + '</div>' +
                            '<div class="text-[10px] flex items-center gap-1 mt-0.5 ' + (isToday ? 'text-rose-500' : 'text-slate-400') + '">' +
                                '<i data-lucide="' + (isToday ? 'clock' : 'calendar') + '" class="w-3 h-3"></i> ' + formatDateLabel(t.dueDate) +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<span class="text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0 ' + badgeStyle[t.priority] + '">' + badgeText[t.priority] + '</span>' +
                '</div>';
        }).join('');
    }

    function renderHeader() {
        els.sectionTitle.textContent = VIEW_TITLES[state.view] || 'My Tasks';

        var hour = new Date().getHours();
        var part = hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening');
        els.greetingTitle.innerHTML = 'Good ' + part + ' <span class="animate-bounce" aria-hidden="true">👋</span>';
    }

    function renderAll() {
        renderHeader();
        renderTasks();
        renderStats();
        renderSidebarCounts();
        renderNavActive();
        renderTodayProgress();
        renderUpcomingDeadlines();
    }

    // ---------- Task actions ----------
    function findTask(id) {
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === id) return tasks[i];
        }
        return null;
    }

    function toggleTask(id) {
        var task = findTask(id);
        if (!task) return;
        task.completed = !task.completed;
        saveTasks();
        renderAll();
    }

    function openConfirmDelete(id) {
        var task = findTask(id);
        if (!task) return;
        pendingDeleteId = id;
        els.confirmText.textContent = '"' + task.title + '" will be permanently removed. This action cannot be undone.';
        showModal(els.confirmModal);
        els.confirmCancelBtn.focus();
    }

    function confirmDelete() {
        if (pendingDeleteId === null) return;
        tasks = tasks.filter(function (t) { return t.id !== pendingDeleteId; });
        pendingDeleteId = null;
        saveTasks();
        hideModal(els.confirmModal);
        renderAll();
    }

    // ---------- Modal helpers ----------
    function showModal(modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function hideModal(modal) {
        modal.classList.add('hidden');
        if (els.taskModal.classList.contains('hidden') && els.confirmModal.classList.contains('hidden')) {
            document.body.style.overflow = '';
        }
    }

    function openTaskModal(task) {
        editingId = task ? task.id : null;
        els.taskForm.reset();
        els.titleError.classList.add('hidden');
        els.taskTitleInput.removeAttribute('aria-invalid');

        if (task) {
            els.modalTitle.textContent = 'Edit Task';
            els.modalIcon.textContent = '✎';
            els.modalSubmitBtn.textContent = 'Save Changes';
            els.taskTitleInput.value = task.title;
            els.taskDescInput.value = task.description;
            els.taskDueDateInput.value = task.dueDate || '';
            els.taskPriorityInput.value = task.priority;
            els.taskCategoryInput.value = task.category;
        } else {
            els.modalTitle.textContent = 'Add New Task';
            els.modalIcon.textContent = '+';
            els.modalSubmitBtn.textContent = 'Save Task';
            els.taskDueDateInput.value = todayISO();
        }

        showModal(els.taskModal);
        els.taskTitleInput.focus();
    }

    function closeTaskModal() {
        hideModal(els.taskModal);
        els.taskForm.reset();
        els.titleError.classList.add('hidden');
        editingId = null;
    }

    function handleTaskSubmit(event) {
        event.preventDefault();

        var title = els.taskTitleInput.value.trim();
        if (!title) {
            els.titleError.classList.remove('hidden');
            els.taskTitleInput.setAttribute('aria-invalid', 'true');
            els.taskTitleInput.focus();
            return;
        }

        var dueRaw = els.taskDueDateInput.value;
        var dueDate = dueRaw && DATE_RE.test(dueRaw) ? dueRaw : null;
        var priority = PRIORITIES.indexOf(els.taskPriorityInput.value) !== -1 ? els.taskPriorityInput.value : 'Medium';
        var category = CATEGORIES.indexOf(els.taskCategoryInput.value) !== -1 ? els.taskCategoryInput.value : 'Personal';
        var description = els.taskDescInput.value.trim();

        if (editingId !== null) {
            var task = findTask(editingId);
            if (task) {
                task.title = title.slice(0, 120);
                task.description = description.slice(0, 500);
                task.dueDate = dueDate;
                task.priority = priority;
                task.category = category;
            }
        } else {
            tasks.unshift({
                id: Date.now(),
                title: title.slice(0, 120),
                description: description.slice(0, 500),
                priority: priority,
                dueDate: dueDate,
                category: category,
                completed: false,
                createdAt: Date.now()
            });
        }

        saveTasks();
        closeTaskModal();
        renderAll();
    }

    // ---------- Mobile sidebar ----------
    function openSidebar() {
        els.sidebar.classList.remove('-translate-x-full');
        els.mobileBackdrop.classList.remove('hidden');
    }

    function closeSidebar() {
        els.sidebar.classList.add('-translate-x-full');
        els.mobileBackdrop.classList.add('hidden');
    }

    function isMobile() { return window.innerWidth < 1024; }

    // ---------- View / filter switching ----------
    function setView(view) {
        state.view = view;
        renderAll();
        if (isMobile()) closeSidebar();
    }

    function setCategory(category) {
        state.category = category || null;
        renderAll();
        if (isMobile()) closeSidebar();
    }

    function setStatus(status) {
        state.status = status;
        document.querySelectorAll('.filter-tab').forEach(function (btn) {
            var active = btn.getAttribute('data-status') === status;
            btn.classList.toggle('bg-white', active);
            btn.classList.toggle('text-slate-900', active);
            btn.classList.toggle('shadow-sm', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        renderTasks();
    }

    // ---------- Event wiring ----------
    function bindEvents() {
        // Sidebar navigation (views)
        document.querySelectorAll('.nav-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                setView(item.getAttribute('data-view'));
            });
        });
        els.logoBtn.addEventListener('click', function () {
            setView('dashboard');
        });

        // Category links
        document.querySelectorAll('.category-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                setCategory(item.getAttribute('data-category'));
            });
        });
        els.clearCategoryChip.addEventListener('click', function () { setCategory(null); });

        // Mobile sidebar
        els.menuBtn.addEventListener('click', openSidebar);
        els.sidebarCloseBtn.addEventListener('click', closeSidebar);
        els.mobileBackdrop.addEventListener('click', closeSidebar);

        // Search, status tabs, priority filter
        els.searchInput.addEventListener('input', function () {
            state.search = els.searchInput.value;
            renderTasks();
        });
        document.querySelectorAll('.filter-tab').forEach(function (btn) {
            btn.addEventListener('click', function () { setStatus(btn.getAttribute('data-status')); });
        });
        els.priorityFilter.addEventListener('change', function () {
            state.priority = els.priorityFilter.value;
            renderTasks();
        });

        // Task list actions (event delegation)
        els.taskList.addEventListener('change', function (e) {
            var target = e.target.closest('[data-action="toggle"]');
            if (target) toggleTask(Number(target.getAttribute('data-id')));
        });
        els.taskList.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var id = Number(btn.getAttribute('data-id'));
            if (btn.getAttribute('data-action') === 'edit') {
                var task = findTask(id);
                if (task) openTaskModal(task);
            } else if (btn.getAttribute('data-action') === 'delete') {
                openConfirmDelete(id);
            }
        });

        // Add-task entry points
        els.addTaskBtn.addEventListener('click', function () { openTaskModal(null); });
        els.emptyStateAddBtn.addEventListener('click', function () { openTaskModal(null); });

        // Task modal closing
        els.modalCloseBtn.addEventListener('click', closeTaskModal);
        els.modalCancelBtn.addEventListener('click', closeTaskModal);
        els.taskModal.addEventListener('mousedown', function (e) {
            if (e.target === els.taskModal) closeTaskModal();
        });
        els.taskForm.addEventListener('submit', handleTaskSubmit);
        els.taskTitleInput.addEventListener('input', function () {
            if (els.taskTitleInput.value.trim()) {
                els.titleError.classList.add('hidden');
                els.taskTitleInput.removeAttribute('aria-invalid');
            }
        });

        // Delete confirmation modal
        els.confirmCancelBtn.addEventListener('click', function () {
            pendingDeleteId = null;
            hideModal(els.confirmModal);
        });
        els.confirmDeleteBtn.addEventListener('click', confirmDelete);
        els.confirmModal.addEventListener('mousedown', function (e) {
            if (e.target === els.confirmModal) {
                pendingDeleteId = null;
                hideModal(els.confirmModal);
            }
        });

        // Escape key closes topmost overlay
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!els.confirmModal.classList.contains('hidden')) {
                pendingDeleteId = null;
                hideModal(els.confirmModal);
            } else if (!els.taskModal.classList.contains('hidden')) {
                closeTaskModal();
            } else if (isMobile() && !els.sidebar.classList.contains('-translate-x-full')) {
                closeSidebar();
            }
        });

        // Upcoming deadlines "View All"
        els.viewAllDeadlines.addEventListener('click', function (e) {
            e.preventDefault();
            setView('upcoming');
        });

        // Keep sidebar state consistent when resizing to desktop
        window.addEventListener('resize', function () {
            if (!isMobile()) closeSidebar();
        });
    }

    // ---------- CDN fallback ----------
    function injectFallbackStyles() {
        if (window.tailwind) return; // Tailwind CDN loaded fine
        var css = [
            '*{box-sizing:border-box}',
            'body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;color:#1e293b;background:#f8fafc}',
            '#appContainer>div{display:flex;align-items:flex-start;gap:0}',
            '#sidebar{width:240px;min-width:240px;background:#fff;border-right:1px solid #e2e8f0;padding:12px;position:static;transform:none}',
            '#sidebar a{display:block;padding:8px;color:#334155;text-decoration:none;border-radius:8px}',
            'main{flex:1;padding:24px;min-width:0}',
            '#rightPanel{width:300px;min-width:300px;background:#fff;border-left:1px solid #e2e8f0;padding:16px}',
            'input,select,textarea,button{font:inherit;padding:8px;border:1px solid #cbd5e1;border-radius:8px}',
            'button{cursor:pointer}',
            '#addTaskBtn,#modalSubmitBtn,#emptyStateAddBtn{background:#4f46e5;color:#fff;border:none}',
            '.bg-white,#taskList>div{background:#fff}',
            '#taskList>div{border-bottom:1px solid #f1f5f9;padding:12px;display:flex;justify-content:space-between;gap:12px}',
            '#taskModal,#confirmModal{position:fixed;inset:0;background:rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}',
            '#taskModal.hidden,#confirmModal.hidden,#mobileBackdrop.hidden,#emptyState.hidden,.hidden{display:none}',
            '#taskModal>div,#confirmModal>div{background:#fff;border-radius:12px;max-width:520px;width:100%;padding:16px;max-height:90vh;overflow:auto}',
            '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}',
            '#upcomingList>div{border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px}',
            '@media(max-width:1100px){#rightPanel{display:none}}',
            '@media(max-width:800px){#appContainer>div{flex-direction:column}#sidebar{width:100%;min-width:0;border-right:none;border-bottom:1px solid #e2e8f0}}'
        ].join('');
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ---------- Init ----------
    function init() {
        cacheDom();
        injectFallbackStyles();
        loadTasks();
        bindEvents();
        setStatus('all');

        // Rotate the productivity tip once per day
        var dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        els.tipText.textContent = TIPS[dayOfYear % TIPS.length];

        renderAll();
        refreshIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
