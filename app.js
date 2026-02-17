/* ============================================
   Harry's Reading List — Application Logic
   ============================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'harrys-reading-list';
  const STATUS_LABELS = {
    'wishlist': 'Wishlist',
    'up-next': 'Up Next',
    'reading': 'Currently Reading',
    'on-hold': 'On Hold',
    'finished': 'Finished'
  };

  // Book icon SVG for placeholder covers
  const BOOK_ICON_SVG = `<svg class="placeholder-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="12" y1="6" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>`;

  let books = [];
  let currentDetailId = null;

  // Filter state managed via pill chips
  const filterState = {
    genre: '',
    status: '',
    format: '',
    rating: '',
    sort: 'dateAdded'
  };

  // View state
  let currentView = localStorage.getItem('reading-list-view') || 'grid';

  // List view sort state (independent of filter sort)
  let listSortState = { column: 'title', direction: 'asc' };

  // Cover image cache
  const COVER_CACHE_KEY = 'reading-list-covers';

  function loadCoverCache() {
    try {
      return JSON.parse(localStorage.getItem(COVER_CACHE_KEY)) || {};
    } catch { return {}; }
  }

  function saveCoverCache(cache) {
    localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(cache));
  }

  async function fetchCoverForBook(book) {
    const cache = loadCoverCache();
    const cacheKey = `${book.title}|||${book.author}`;
    if (cacheKey in cache) return cache[cacheKey];

    let url = null;

    // Strategy 1: Open Library — title + author
    try {
      const resp = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author)}&limit=1`);
      const data = await resp.json();
      if (data.docs && data.docs.length > 0 && data.docs[0].cover_edition_key) {
        url = `https://covers.openlibrary.org/b/olid/${data.docs[0].cover_edition_key}-M.jpg`;
      }
    } catch { /* continue */ }

    // Strategy 2: Open Library — title only
    if (!url) {
      try {
        const resp = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}&limit=1`);
        const data = await resp.json();
        if (data.docs && data.docs.length > 0 && data.docs[0].cover_edition_key) {
          url = `https://covers.openlibrary.org/b/olid/${data.docs[0].cover_edition_key}-M.jpg`;
        }
      } catch { /* continue */ }
    }

    // Strategy 3: Google Books API
    if (!url) {
      try {
        const q = `intitle:${encodeURIComponent(book.title)}+inauthor:${encodeURIComponent(book.author)}`;
        const resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
        const data = await resp.json();
        if (data.items && data.items.length > 0) {
          const imageLinks = data.items[0].volumeInfo?.imageLinks;
          if (imageLinks) {
            url = (imageLinks.thumbnail || imageLinks.smallThumbnail || '').replace('http://', 'https://');
          }
        }
      } catch { /* continue */ }
    }

    cache[cacheKey] = url;
    saveCoverCache(cache);
    return url;
  }

  // ---- Initialization ----

  async function init() {
    books = loadBooks();

    // If empty, load seed data
    if (books.length === 0 && typeof SEED_DATA !== 'undefined') {
      books = SEED_DATA;
      saveBooks();
      showToast('Loaded seed data — welcome!');
    }

    populateGenreFilter();
    // Set initial view toggle state
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === currentView);
    });
    renderAll();
    updateStats();
    bindEvents();
  }

  // ---- LocalStorage ----

  function loadBooks() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveBooks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  }

  // ---- Rendering ----

  function renderAll() {
    const filtered = getFilteredBooks();

    const favorites = filtered.filter(b => b.favorite && b.status === 'finished');
    const reading = filtered.filter(b => b.status === 'reading');
    const owned = filtered.filter(b => b.status === 'up-next');
    const wantToBuy = filtered.filter(b => b.status === 'wishlist');
    const paused = filtered.filter(b => b.status === 'on-hold');
    const completed = filtered.filter(b => b.status === 'finished' && !b.favorite);

    const renderFn = currentView === 'list' ? renderList : renderGrid;

    renderFn('favoritesGrid', favorites, 'No favorites yet');
    renderFn('readingGrid', reading, 'Nothing currently being read');
    renderFn('ownedGrid', owned, 'No books in this category');
    renderFn('wantToBuyGrid', wantToBuy, 'No books in this category');
    renderFn('pausedGrid', paused, 'No books on hold');
    renderFn('completedGrid', completed, 'No finished books');

    // Update section counts
    updateSectionCount('favoritesSection', favorites.length);
    updateSectionCount('readingSection', reading.length);
    updateSectionCount('ownedSection', owned.length);
    updateSectionCount('wantToBuySection', wantToBuy.length);
    updateSectionCount('pausedSection', paused.length);
    updateSectionCount('completedSection', completed.length);

    // Show/hide sections
    toggleSection('favoritesSection', favorites.length);
    toggleSection('readingSection', reading.length);
    toggleSection('ownedSection', owned.length);
    toggleSection('wantToBuySection', wantToBuy.length);
    toggleSection('pausedSection', paused.length);
    toggleSection('completedSection', completed.length);

    updateClearFiltersButton();

    // Lazy-load covers for cards missing them (grid view only)
    if (currentView === 'grid') {
      lazyLoadCovers();
    }
  }

  function updateSectionCount(sectionId, count) {
    const section = document.getElementById(sectionId);
    const title = section.querySelector('.section-title');
    const baseName = title.dataset.baseName || title.textContent.replace(/\s*\(\d+\)$/, '');
    title.dataset.baseName = baseName;
    title.innerHTML = `${baseName} <span class="section-count">(${count})</span>`;
  }

  function updateClearFiltersButton() {
    const btn = document.getElementById('clearFiltersBtn');
    const active = isFilterActive() || filterState.sort !== 'dateAdded';
    btn.style.display = active ? '' : 'none';
  }

  function clearAllFilters() {
    filterState.genre = '';
    filterState.status = '';
    filterState.format = '';
    filterState.rating = '';
    filterState.sort = 'dateAdded';
    document.getElementById('searchInput').value = '';

    // Reset all pill labels and states
    const defaults = { filterGenrePill: 'Genre', filterStatusPill: 'Status', filterFormatPill: 'Format', filterRatingPill: 'Rating', sortByPill: 'Sort' };
    Object.entries(defaults).forEach(([pillId, label]) => {
      const pill = document.getElementById(pillId);
      pill.classList.remove('active');
      pill.childNodes[0].textContent = label + ' ';
    });

    // Reset selected states in all dropdowns
    document.querySelectorAll('.filter-dropdown-item').forEach(item => {
      item.classList.remove('selected');
    });
    // Re-select the "Date Added" sort default
    const sortDropdown = document.getElementById('sortByDropdown');
    const dateAddedItem = sortDropdown.querySelector('[data-value="dateAdded"]');
    if (dateAddedItem) dateAddedItem.classList.add('selected');

    renderAll();
  }

  function lazyLoadCovers() {
    const cards = document.querySelectorAll('[data-needs-cover="true"]');
    if (cards.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          observer.unobserve(card);
          const bookId = card.dataset.id;
          const book = books.find(b => b.id === bookId);
          if (!book) return;
          fetchCoverForBook(book).then(url => {
            if (url) {
              const coverDiv = card.querySelector('.book-card-cover');
              if (coverDiv) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = book.title;
                img.loading = 'lazy';
                img.onerror = function() { this.remove(); };
                const placeholder = coverDiv.querySelector('.placeholder-cover');
                if (placeholder) placeholder.replaceWith(img);
              }
            }
            card.removeAttribute('data-needs-cover');
          });
        }
      });
    }, { rootMargin: '200px' });

    cards.forEach(card => observer.observe(card));
  }

  function toggleSection(id, count) {
    const el = document.getElementById(id);
    const hasFilters = isFilterActive();
    if (count === 0 && hasFilters) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  }

  function isFilterActive() {
    return document.getElementById('searchInput').value.trim() !== '' ||
      filterState.genre !== '' ||
      filterState.status !== '' ||
      filterState.format !== '' ||
      filterState.rating !== '';
  }

  function renderGrid(gridId, bookList, emptyMsg) {
    const grid = document.getElementById(gridId);
    grid.classList.remove('empty', 'list-view-active');
    grid.removeAttribute('data-empty-message');

    if (bookList.length === 0) {
      if (isFilterActive()) {
        grid.innerHTML = '<div class="empty-state">No books match your filters. <a href="#" class="clear-filters-link">Clear filters</a></div>';
        grid.querySelector('.clear-filters-link').addEventListener('click', (e) => {
          e.preventDefault();
          clearAllFilters();
        });
      } else {
        grid.innerHTML = '';
        grid.classList.add('empty');
        grid.setAttribute('data-empty-message', emptyMsg);
      }
      return;
    }

    grid.innerHTML = bookList.map(book => createBookCard(book)).join('');

    // Bind click events
    grid.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', () => showBookDetail(card.dataset.id));
    });
  }

  function renderList(gridId, bookList, emptyMsg) {
    const grid = document.getElementById(gridId);
    grid.classList.remove('empty');
    grid.removeAttribute('data-empty-message');
    grid.classList.add('list-view-active');

    if (bookList.length === 0) {
      if (isFilterActive()) {
        grid.innerHTML = '<div class="empty-state">No books match your filters. <a href="#" class="clear-filters-link">Clear filters</a></div>';
        grid.querySelector('.clear-filters-link').addEventListener('click', (e) => {
          e.preventDefault();
          clearAllFilters();
        });
      } else {
        grid.innerHTML = '';
        grid.classList.add('empty');
        grid.setAttribute('data-empty-message', emptyMsg);
      }
      return;
    }

    // Sort list by listSortState
    const sorted = [...bookList].sort((a, b) => {
      let cmp = 0;
      switch (listSortState.column) {
        case 'title': cmp = (a.title || '').localeCompare(b.title || ''); break;
        case 'author': cmp = (a.author || '').localeCompare(b.author || ''); break;
        case 'genre': cmp = (a.genre || '').localeCompare(b.genre || ''); break;
        case 'rating': cmp = (a.rating || 0) - (b.rating || 0); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
        case 'format': cmp = (a.format || '').localeCompare(b.format || ''); break;
        default: cmp = (a.title || '').localeCompare(b.title || '');
      }
      return listSortState.direction === 'desc' ? -cmp : cmp;
    });

    const arrow = (col) => {
      if (listSortState.column !== col) return '';
      return listSortState.direction === 'asc' ? ' &#9650;' : ' &#9660;';
    };
    const activeClass = (col) => listSortState.column === col ? ' sort-active' : '';

    let html = `<table class="book-list-table">
      <thead><tr>
        <th class="book-list-col-title${activeClass('title')}" data-sort-col="title">Title${arrow('title')}</th>
        <th class="book-list-col-author${activeClass('author')}" data-sort-col="author">Author${arrow('author')}</th>
        <th class="book-list-col-genre${activeClass('genre')}" data-sort-col="genre">Genre${arrow('genre')}</th>
        <th class="book-list-col-rating${activeClass('rating')}" data-sort-col="rating">Rating${arrow('rating')}</th>
        <th class="book-list-col-status${activeClass('status')}" data-sort-col="status">Status${arrow('status')}</th>
        <th class="book-list-col-format${activeClass('format')}" data-sort-col="format">Format${arrow('format')}</th>
      </tr></thead><tbody>`;

    sorted.forEach(book => {
      const ratingStr = book.rating ? starsHtml(book.rating) : '<span style="color:var(--color-text-muted)">—</span>';
      const statusLabel = STATUS_LABELS[book.status] || book.status;
      html += `<tr class="book-list-row" data-id="${book.id}">
        <td class="book-list-col-title">${escapeHtml(book.title)}</td>
        <td class="book-list-col-author">${escapeHtml(book.author)}</td>
        <td class="book-list-col-genre">${escapeHtml(book.genre || '')}</td>
        <td class="book-list-col-rating">${ratingStr}</td>
        <td class="book-list-col-status"><span class="book-list-status-badge">${escapeHtml(statusLabel)}</span></td>
        <td class="book-list-col-format">${escapeHtml(book.format || '')}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    grid.innerHTML = html;

    // Bind row clicks
    grid.querySelectorAll('.book-list-row').forEach(row => {
      row.addEventListener('click', () => showBookDetail(row.dataset.id));
    });

    // Bind column header clicks for sorting
    grid.querySelectorAll('th[data-sort-col]').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const col = header.dataset.sortCol;
        if (listSortState.column === col) {
          listSortState.direction = listSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          listSortState.column = col;
          listSortState.direction = 'asc';
        }
        renderAll();
      });
    });
  }

  function createBookCard(book) {
    let needsCover = false;
    let coverHtml;

    if (book.coverImage) {
      coverHtml = `<img src="${escapeHtml(book.coverImage)}" alt="${escapeHtml(book.title)}" loading="lazy" onerror="this.parentElement.innerHTML='${placeholderCoverInline()}'">`;
    } else {
      // Check cover cache
      const cache = loadCoverCache();
      const cacheKey = `${book.title}|||${book.author}`;
      if (cacheKey in cache && cache[cacheKey]) {
        coverHtml = `<img src="${escapeHtml(cache[cacheKey])}" alt="${escapeHtml(book.title)}" loading="lazy" onerror="this.parentElement.innerHTML='${placeholderCoverInline()}'">`;
      } else if (!(cacheKey in cache)) {
        coverHtml = `<div class="placeholder-cover">${BOOK_ICON_SVG}</div>`;
        needsCover = true;
      } else {
        coverHtml = `<div class="placeholder-cover">${BOOK_ICON_SVG}</div>`;
      }
    }

    const formatBadge = book.format
      ? `<span class="format-badge">${formatIcon(book.format)}</span>`
      : '';

    const genreHtml = book.genre ? `<span class="book-card-genre">${escapeHtml(book.genre)}</span>` : '';

    let ratingHtml = '';
    if (book.status === 'finished' && book.rating) {
      ratingHtml = `<div class="book-card-rating">${starsHtml(book.rating)}</div>`;
    }

    let progressHtml = '';
    if ((book.status === 'reading' || book.status === 'on-hold') && book.currentPage && book.pageCount) {
      const pct = Math.min(100, Math.round((book.currentPage / book.pageCount) * 100));
      progressHtml = `
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="progress-text">${book.currentPage} / ${book.pageCount} pages</div>`;
    }

    return `
      <div class="book-card" data-id="${book.id}"${needsCover ? ' data-needs-cover="true"' : ''}>
        <div class="book-card-cover">
          ${coverHtml}
          ${formatBadge}
        </div>
        <div class="book-card-info">
          <div class="book-card-title">${escapeHtml(book.title)}</div>
          <div class="book-card-author">${escapeHtml(book.author)}</div>
          ${genreHtml}
          ${ratingHtml}
          ${progressHtml}
        </div>
      </div>`;
  }

  function placeholderCoverInline() {
    // Escaped version for onerror inline HTML
    return '<div class=&quot;placeholder-cover&quot;>' + BOOK_ICON_SVG.replace(/"/g, '&quot;') + '</div>';
  }

  function starsHtml(rating) {
    let html = '<div class="stars">';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="star ${i <= rating ? 'filled' : ''}">&#9733;</span>`;
    }
    html += '</div>';
    return html;
  }

  function formatIcon(format) {
    switch (format) {
      case 'Digital/Kindle': return 'Kindle';
      case 'Audiobook': return 'Audio';
      case 'Physical (New)': return 'New';
      case 'Physical (Used)': return 'Used';
      default: return format;
    }
  }

  function updateStats() {
    const stats = document.getElementById('headerStats');
    const total = books.length;
    const completed = books.filter(b => b.status === 'finished').length;
    const reading = books.filter(b => b.status === 'reading').length;

    stats.innerHTML = `
      <div class="stat-item"><span class="stat-number">${total}</span><span class="stat-label">Books</span></div>
      <div class="stat-item"><span class="stat-number">${completed}</span><span class="stat-label">Read</span></div>
      <div class="stat-item"><span class="stat-number">${reading}</span><span class="stat-label">Reading</span></div>
    `;
  }

  // ---- Filtering & Sorting ----

  function getFilteredBooks() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const genre = filterState.genre;
    const status = filterState.status;
    const format = filterState.format;
    const rating = filterState.rating;
    const sortBy = filterState.sort;

    let result = books.filter(book => {
      if (query && !book.title.toLowerCase().includes(query) && !book.author.toLowerCase().includes(query)) return false;
      if (genre && book.genre !== genre) return false;
      if (status && book.status !== status) return false;
      if (format && book.format !== format) return false;
      if (rating === 'none' && book.rating != null) return false;
      if (rating && rating !== 'none' && book.rating !== parseInt(rating)) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case 'title': return a.title.localeCompare(b.title);
        case 'author': return a.author.localeCompare(b.author);
        case 'rating': return (b.rating || 0) - (a.rating || 0);
        case 'yearPublished': return (b.yearPublished || 0) - (a.yearPublished || 0);
        case 'dateAdded':
        default: return (b.dateAdded || '').localeCompare(a.dateAdded || '');
      }
    });

    return result;
  }

  const ALL_GENRES = [
    'Art', 'Artificial Intelligence', 'Biography', 'Business', 'Classics',
    'Comics / Graphic Novels', 'Cookbook', 'Creativity', 'Cryptocurrency',
    'Design', 'Fairy Tale', 'Fantasy', 'Fiction', 'Food', 'Health', 'History',
    'Horror', 'Humor', 'Leadership / Management', 'Marine Life / Ocean',
    'Military History', 'Money', 'Music', 'Mystery', 'Non-Fiction', 'Novel',
    'Personal Development', 'Philosophy', 'Poetry', 'Politics / Current Affairs',
    'Psychology', 'Real Estate Investing', 'Religion and Spirituality', 'Romance',
    'Science', 'Science Fiction', 'Self-Help', 'Technology', 'Thriller', 'Travel',
    'True Crime', 'UX'
  ];

  function populateGenreFilter() {
    const dropdown = document.getElementById('filterGenreDropdown');
    let html = '<button class="filter-dropdown-item" data-value="">All Genres</button>';
    ALL_GENRES.forEach(g => {
      html += `<button class="filter-dropdown-item" data-value="${escapeHtml(g)}">${escapeHtml(g)}</button>`;
    });
    dropdown.innerHTML = html;

    // Bind genre dropdown items
    bindDropdownItems(dropdown, 'genre', 'filterGenrePill');
  }

  // ---- Pill-Chip Filter Logic ----

  function bindDropdownItems(dropdown, filterKey, pillId) {
    dropdown.querySelectorAll('.filter-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = item.dataset.value;
        filterState[filterKey] = value;

        // Update selected state in dropdown
        dropdown.querySelectorAll('.filter-dropdown-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        // Update pill active state and label
        const pill = document.getElementById(pillId);
        closeAllDropdowns();

        if (value) {
          pill.classList.add('active');
          // Show selected value in pill text
          const label = filterKey === 'sort' ? 'Sort' : item.textContent.replace('✓ ', '');
          pill.childNodes[0].textContent = filterKey === 'sort' ? `Sort: ${item.textContent.replace('✓ ', '')} ` : `${label} `;
        } else {
          pill.classList.remove('active');
          const defaultLabels = { genre: 'Genre', status: 'Status', format: 'Format', rating: 'Rating', sort: 'Sort' };
          pill.childNodes[0].textContent = defaultLabels[filterKey] + ' ';
        }

        renderAll();
      });
    });
  }

  function toggleDropdown(pillId, dropdownId) {
    const pill = document.getElementById(pillId);
    const dropdown = document.getElementById(dropdownId);
    const isOpen = dropdown.classList.contains('open');

    closeAllDropdowns();

    if (!isOpen) {
      dropdown.classList.add('open');
      pill.classList.add('open');
    }
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('open'));
    const overflowDropdown = document.getElementById('overflowDropdown');
    if (overflowDropdown) overflowDropdown.classList.remove('open');
    const ratingLegend = document.getElementById('ratingLegend');
    if (ratingLegend) ratingLegend.classList.remove('open');
  }

  // ---- Book Detail Modal ----

  function showBookDetail(id) {
    const book = books.find(b => b.id === id);
    if (!book) return;
    currentDetailId = id;

    const body = document.getElementById('bookDetailBody');
    const placeholderSvg = BOOK_ICON_SVG;
    const coverHtml = book.coverImage
      ? `<img src="${escapeHtml(book.coverImage)}" alt="${escapeHtml(book.title)}" onerror="this.outerHTML='<div class=\\'placeholder-cover\\'>${placeholderSvg.replace(/'/g, "\\'")}</div>'">`
      : `<div class="placeholder-cover">${placeholderSvg}</div>`;

    let ratingHtml = '';
    if (book.rating) {
      ratingHtml = `<div class="detail-rating">${starsHtml(book.rating)}</div>`;
    }

    let badges = [];
    if (book.genre) badges.push(`<span class="badge">${escapeHtml(book.genre)}</span>`);
    if (book.format) badges.push(`<span class="badge">${escapeHtml(book.format)}</span>`);
    if (book.yearPublished) badges.push(`<span class="badge">${book.yearPublished}</span>`);
    if (book.favorite) badges.push(`<span class="badge badge-accent">Top Pick</span>`);
    if (book.tags && book.tags.length) {
      book.tags.forEach(t => badges.push(`<span class="badge">${escapeHtml(t)}</span>`));
    }

    let fieldsHtml = '';
    if (book.recommendedBy) {
      fieldsHtml += `<div class="detail-field"><div class="detail-field-label">Recommended By</div><div class="detail-field-value">${escapeHtml(book.recommendedBy)}</div></div>`;
    }
    if (book.pageCount) {
      fieldsHtml += `<div class="detail-field"><div class="detail-field-label">Pages</div><div class="detail-field-value">${book.pageCount}</div></div>`;
    }
    if (book.datePurchased) {
      fieldsHtml += `<div class="detail-field"><div class="detail-field-label">Date Purchased</div><div class="detail-field-value">${book.datePurchased}</div></div>`;
    }
    if (book.dateStarted) {
      fieldsHtml += `<div class="detail-field"><div class="detail-field-label">Date Started</div><div class="detail-field-value">${book.dateStarted}</div></div>`;
    }
    if (book.dateCompleted) {
      fieldsHtml += `<div class="detail-field"><div class="detail-field-label">Date Completed</div><div class="detail-field-value">${book.dateCompleted}</div></div>`;
    }
    if ((book.status === 'reading' || book.status === 'on-hold') && book.currentPage) {
      const progressStr = book.pageCount ? `${book.currentPage} / ${book.pageCount}` : `Page ${book.currentPage}`;
      fieldsHtml += `<div class="detail-field"><div class="detail-field-label">Progress</div><div class="detail-field-value">${progressStr}</div></div>`;
    }

    if (book.description) {
      fieldsHtml += `<div class="detail-field"><div class="detail-field-label">Description</div><div class="detail-field-value">${escapeHtml(book.description)}</div></div>`;
    }

    let notesHtml = '';
    if (book.notes) {
      notesHtml = `<div class="detail-field"><div class="detail-field-label">Notes</div><div class="detail-notes">${escapeHtml(book.notes)}</div></div>`;
    }

    // Status dropdown
    const statusOptions = Object.entries(STATUS_LABELS).map(([val, label]) =>
      `<option value="${val}" ${book.status === val ? 'selected' : ''}>${label}</option>`
    ).join('');

    body.innerHTML = `
      <div class="detail-header">
        <div class="detail-cover">${coverHtml}</div>
        <div class="detail-meta">
          <h3>${escapeHtml(book.title)}</h3>
          <div class="detail-author">${escapeHtml(book.author)}</div>
          ${ratingHtml}
          <div class="detail-badges">${badges.join('')}</div>
        </div>
      </div>
      ${fieldsHtml}
      ${notesHtml}
      <div class="detail-actions">
        <select class="detail-status-select" id="detailStatusSelect">${statusOptions}</select>
        <button class="btn btn-subtle btn-small" id="editBookBtn">Edit</button>
        <button class="btn btn-danger btn-small" id="deleteBookBtn">Delete</button>
      </div>
    `;

    // Bind detail actions
    document.getElementById('detailStatusSelect').addEventListener('change', (e) => {
      book.status = e.target.value;
      saveBooks();
      renderAll();
      updateStats();
      showToast(`Moved to ${STATUS_LABELS[book.status]}`);
    });

    document.getElementById('editBookBtn').addEventListener('click', () => {
      closeModal('bookDetailModal');
      openEditForm(book);
    });

    document.getElementById('deleteBookBtn').addEventListener('click', () => {
      showConfirmDialog('Delete Book', `Are you sure you want to delete "${book.title}"?`, () => {
        books = books.filter(b => b.id !== id);
        saveBooks();
        closeModal('bookDetailModal');
        populateGenreFilter();
        renderAll();
        updateStats();
        showToast('Book deleted');
      });
    });

    openModal('bookDetailModal');
  }

  // ---- Add/Edit Form ----

  function openAddForm() {
    document.getElementById('formModalTitle').textContent = 'Add Book';
    document.getElementById('bookForm').reset();
    document.getElementById('formBookId').value = '';
    document.getElementById('olResults').innerHTML = '';
    document.getElementById('formStatus').value = 'up-next';
    openModal('bookFormModal');
  }

  function openEditForm(book) {
    document.getElementById('formModalTitle').textContent = 'Edit Book';
    document.getElementById('formBookId').value = book.id;
    document.getElementById('formTitle').value = book.title || '';
    document.getElementById('formAuthor').value = book.author || '';
    document.getElementById('formGenre').value = book.genre || '';
    document.getElementById('formYear').value = book.yearPublished || '';
    document.getElementById('formPages').value = book.pageCount || '';
    document.getElementById('formFormat').value = book.format || '';
    document.getElementById('formStatus').value = book.status || 'up-next';
    document.getElementById('formRating').value = book.rating || '';
    document.getElementById('formCover').value = book.coverImage || '';
    document.getElementById('formDatePurchased').value = book.datePurchased || '';
    document.getElementById('formDateStarted').value = book.dateStarted || '';
    document.getElementById('formDateCompleted').value = book.dateCompleted || '';
    document.getElementById('formCurrentPage').value = book.currentPage || '';
    document.getElementById('formRecommendedBy').value = book.recommendedBy || '';
    document.getElementById('formTags').value = (book.tags || []).join(', ');
    document.getElementById('formDescription').value = book.description || '';
    document.getElementById('formNotes').value = book.notes || '';
    document.getElementById('formFavorite').checked = book.favorite || false;
    document.getElementById('olResults').innerHTML = '';
    openModal('bookFormModal');
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('formBookId').value;
    const isEdit = !!id;

    const bookData = {
      id: isEdit ? id : generateId(),
      title: document.getElementById('formTitle').value.trim(),
      author: document.getElementById('formAuthor').value.trim(),
      genre: document.getElementById('formGenre').value,
      yearPublished: parseInt(document.getElementById('formYear').value) || null,
      pageCount: parseInt(document.getElementById('formPages').value) || null,
      coverImage: document.getElementById('formCover').value.trim(),
      format: document.getElementById('formFormat').value,
      status: document.getElementById('formStatus').value,
      datePurchased: document.getElementById('formDatePurchased').value,
      dateStarted: document.getElementById('formDateStarted').value,
      dateCompleted: document.getElementById('formDateCompleted').value,
      currentPage: parseInt(document.getElementById('formCurrentPage').value) || null,
      rating: parseInt(document.getElementById('formRating').value) || null,
      favorite: document.getElementById('formFavorite').checked,
      tags: document.getElementById('formTags').value.split(',').map(t => t.trim()).filter(Boolean),
      recommendedBy: document.getElementById('formRecommendedBy').value.trim(),
      notes: document.getElementById('formNotes').value.trim(),
      description: document.getElementById('formDescription').value.trim(),
      dateAdded: isEdit ? (books.find(b => b.id === id)?.dateAdded || today()) : today()
    };

    if (isEdit) {
      const idx = books.findIndex(b => b.id === id);
      if (idx !== -1) books[idx] = bookData;
    } else {
      books.push(bookData);
    }

    saveBooks();
    closeModal('bookFormModal');
    populateGenreFilter();
    renderAll();
    updateStats();
    showToast(isEdit ? 'Book updated' : 'Book added');
  }

  // ---- Open Library Search ----

  async function searchOpenLibrary(query) {
    if (!query.trim()) return;
    const resultsDiv = document.getElementById('olResults');
    resultsDiv.innerHTML = '<span class="loading"></span> Searching...';

    try {
      const resp = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`);
      const data = await resp.json();

      if (!data.docs || data.docs.length === 0) {
        resultsDiv.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">No results found.</p>';
        return;
      }

      resultsDiv.innerHTML = data.docs.map(doc => {
        const coverUrl = doc.cover_edition_key
          ? `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-S.jpg`
          : '';
        const author = doc.author_name ? doc.author_name[0] : 'Unknown';
        const year = doc.first_publish_year || '';
        const pages = doc.number_of_pages_median || '';
        const olid = doc.cover_edition_key || '';

        return `
          <div class="ol-result-item" data-title="${escapeAttr(doc.title)}" data-author="${escapeAttr(author)}" data-year="${year}" data-pages="${pages}" data-olid="${olid}">
            ${coverUrl ? `<img src="${coverUrl}" alt="">` : '<div style="width:36px;height:52px;background:var(--color-surface-alt);border-radius:3px;"></div>'}
            <div class="ol-result-info">
              <div class="ol-result-title">${escapeHtml(doc.title)}</div>
              <div class="ol-result-author">${escapeHtml(author)}</div>
              ${year ? `<div class="ol-result-year">${year}</div>` : ''}
            </div>
          </div>`;
      }).join('');

      // Bind selection
      resultsDiv.querySelectorAll('.ol-result-item').forEach(item => {
        item.addEventListener('click', () => {
          document.getElementById('formTitle').value = item.dataset.title;
          document.getElementById('formAuthor').value = item.dataset.author;
          if (item.dataset.year) document.getElementById('formYear').value = item.dataset.year;
          if (item.dataset.pages) document.getElementById('formPages').value = item.dataset.pages;
          if (item.dataset.olid) {
            document.getElementById('formCover').value = `https://covers.openlibrary.org/b/olid/${item.dataset.olid}-M.jpg`;
          }
          resultsDiv.innerHTML = '';
        });
      });
    } catch (err) {
      resultsDiv.innerHTML = '<p style="color:var(--color-danger);font-size:13px;">Search failed. Try again.</p>';
    }
  }

  // ---- Import / Export ----

  function exportBooks() {
    const json = JSON.stringify(books, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reading-list-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported successfully');
  }

  function openImportModal() {
    document.getElementById('importTextarea').value = '';
    document.getElementById('importFile').value = '';
    document.getElementById('importReplace').checked = false;
    openModal('importModal');
  }

  async function doImport() {
    const file = document.getElementById('importFile').files[0];
    const text = document.getElementById('importTextarea').value.trim();
    const replace = document.getElementById('importReplace').checked;

    let data;
    try {
      if (file) {
        const content = await file.text();
        data = JSON.parse(content);
      } else if (text) {
        data = JSON.parse(text);
      } else {
        showToast('No data to import');
        return;
      }

      if (!Array.isArray(data)) {
        showToast('Invalid format — expected an array of books');
        return;
      }

      if (replace) {
        books = data;
      } else {
        // Merge: add new books, skip existing by id
        const existingIds = new Set(books.map(b => b.id));
        const newBooks = data.filter(b => !existingIds.has(b.id));
        books = books.concat(newBooks);
      }

      saveBooks();
      closeModal('importModal');
      populateGenreFilter();
      renderAll();
      updateStats();
      showToast(`Imported ${data.length} books`);
    } catch (err) {
      showToast('Import failed — invalid JSON');
    }
  }

  // ---- Confirm Dialog ----

  function showConfirmDialog(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    openModal('confirmModal');

    const cancelBtn = document.getElementById('confirmCancelBtn');
    const deleteBtn = document.getElementById('confirmDeleteBtn');

    // Clone and replace to remove old listeners
    const newCancel = cancelBtn.cloneNode(true);
    const newDelete = deleteBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    deleteBtn.parentNode.replaceChild(newDelete, deleteBtn);

    newCancel.addEventListener('click', () => closeModal('confirmModal'));
    newDelete.addEventListener('click', () => {
      closeModal('confirmModal');
      onConfirm();
    });
  }

  // ---- Modal Helpers ----

  function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
  }

  // ---- Event Binding ----

  function bindEvents() {
    // Search
    document.getElementById('searchInput').addEventListener('input', debounce(() => {
      renderAll();
    }, 200));

    // Clear Filters button
    document.getElementById('clearFiltersBtn').addEventListener('click', clearAllFilters);

    // Rating Legend toggle
    document.getElementById('ratingLegendToggle').addEventListener('click', (e) => {
      e.stopPropagation();
      const legend = document.getElementById('ratingLegend');
      const isOpen = legend.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) legend.classList.add('open');
    });

    // View Toggle
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.view;
        localStorage.setItem('reading-list-view', currentView);
        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderAll();
      });
    });

    // Filter pill toggles
    const pillConfigs = [
      { pillId: 'filterGenrePill', dropdownId: 'filterGenreDropdown', filterKey: 'genre' },
      { pillId: 'filterStatusPill', dropdownId: 'filterStatusDropdown', filterKey: 'status' },
      { pillId: 'filterFormatPill', dropdownId: 'filterFormatDropdown', filterKey: 'format' },
      { pillId: 'filterRatingPill', dropdownId: 'filterRatingDropdown', filterKey: 'rating' },
      { pillId: 'sortByPill', dropdownId: 'sortByDropdown', filterKey: 'sort' },
    ];

    pillConfigs.forEach(({ pillId, dropdownId, filterKey }) => {
      const pill = document.getElementById(pillId);
      pill.addEventListener('click', (e) => {
        // Don't toggle if clicking a dropdown item
        if (e.target.closest('.filter-dropdown-item')) return;
        e.stopPropagation();
        toggleDropdown(pillId, dropdownId);
      });

      // Bind dropdown items (except genre which is populated dynamically)
      if (filterKey !== 'genre') {
        const dropdown = document.getElementById(dropdownId);
        bindDropdownItems(dropdown, filterKey, pillId);
      }
    });

    // Overflow menu toggle
    document.getElementById('overflowBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('overflowDropdown');
      const isOpen = dropdown.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        dropdown.classList.add('open');
      }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
      closeAllDropdowns();
    });

    // Add book
    document.getElementById('addBookBtn').addEventListener('click', openAddForm);

    // Form
    document.getElementById('bookForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('cancelFormBtn').addEventListener('click', () => closeModal('bookFormModal'));
    document.getElementById('closeFormModal').addEventListener('click', () => closeModal('bookFormModal'));

    // Detail modal
    document.getElementById('closeDetailModal').addEventListener('click', () => closeModal('bookDetailModal'));

    // Import / Export
    document.getElementById('exportBtn').addEventListener('click', () => {
      closeAllDropdowns();
      exportBooks();
    });
    document.getElementById('importBtn').addEventListener('click', () => {
      closeAllDropdowns();
      openImportModal();
    });
    document.getElementById('doImportBtn').addEventListener('click', doImport);
    document.getElementById('cancelImportBtn').addEventListener('click', () => closeModal('importModal'));
    document.getElementById('closeImportModal').addEventListener('click', () => closeModal('importModal'));

    // Open Library search
    document.getElementById('olSearchBtn').addEventListener('click', () => {
      searchOpenLibrary(document.getElementById('olSearchInput').value);
    });
    document.getElementById('olSearchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchOpenLibrary(document.getElementById('olSearchInput').value);
      }
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllDropdowns();
        document.querySelectorAll('.modal-overlay.active').forEach(m => {
          m.classList.remove('active');
        });
        document.body.style.overflow = '';
      }
    });
  }

  // ---- Utilities ----

  function generateId() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', init);
})();
