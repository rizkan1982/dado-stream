// ==========================================================================
// DADO STREAM - Main Application JavaScript
// ==========================================================================

// Cache version - increment this to invalidate old cache
const CACHE_VERSION = 'v2';

// Clear old cache on version change
(function() {
  const storedVersion = localStorage.getItem('cache_version');
  if (storedVersion !== CACHE_VERSION) {
    console.log('[CACHE] Version changed, clearing old cache');
    // Clear all API cache from localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('api_')) localStorage.removeItem(key);
    });
    // Clear sessionStorage
    sessionStorage.clear();
    localStorage.setItem('cache_version', CACHE_VERSION);
  }
})();

// State Management
const state = {
  currentSection: 'home',
  previousSection: null,
  theme: localStorage.getItem('theme') || 'dark',
  searchQuery: '',
  currentContent: null,
  navigationHistory: [],
  currentEpisodes: [],
  cache: {
    drama: {},
    anime: {},
    komik: {}
  },
  historyStack: []
};

// Browser back button handler
window.addEventListener('popstate', (event) => {
  console.log('[HISTORY] Pop state:', event.state);
  if (event.state && event.state.section) {
    // Restore previous section without pushing to history again
    state.currentSection = event.state.section;
    state.currentContent = event.state.content || null;
    
    if (event.state.section === 'home') {
      navigateTo('home', false); // false = don't push to history
    } else if (event.state.section === 'detail' && event.state.content) {
      // Restore detail page based on content type
      if (event.state.contentType === 'drama') {
        showDramaDetail(event.state.content.id, false);
      } else if (event.state.contentType === 'anime') {
        showAnimeDetail(event.state.content.id, false);
      } else if (event.state.contentType === 'komik') {
        showKomikDetail(event.state.content.id, false);
      }
    } else if (event.state.section === 'player' && event.state.episodeData) {
      // Restore player state
      if (event.state.contentType === 'anime') {
        playAnimeEpisode(event.state.episodeData.id, false);
      } else if (event.state.contentType === 'drama') {
        playDramaEpisode(event.state.episodeData.id, false);
      }
    } else if (event.state.section === 'komik-reader' && event.state.chapterData) {
      openKomikChapter(event.state.chapterData.komikId, event.state.chapterData.chapterId, false);
    } else {
      navigateTo(event.state.section, false);
    }
  } else {
    // No state, go to home
    navigateTo('home', false);
  }
});

// API Base URL
const API_BASE = '/api';

// Helper to proxy images to avoid CORS and blocked content
function getProxyImageUrl(url) {
  if (!url) return '';
  if (url.includes('localhost') || url.startsWith('/') || url.startsWith('data:')) return url;
  return `${API_BASE}/proxy/image?url=${encodeURIComponent(url)}`;
}

// Search by star name
function searchStar(name) {
  document.getElementById('search-input').value = name;
  performSearch();
}

// Helper to proxy videos to solve ERR_NAME_NOT_RESOLVED / ISP blocks
function getProxyVideoUrl(url) {
  if (!url) return '';
  if (url.includes('localhost') || url.startsWith('/') || url.startsWith('data:')) return url;
  
  // NEVER proxy embed/iframe URLs - they MUST be used directly
  // These include: filedon.co/embed, backup blogspot, wibuu.info/stream, etc
  if (url.includes('/embed') || url.includes('embed.php') || url.includes('stream') || url.includes('iframe')) {
    return url; // Use directly for embeds
  }
  
  // DramaBox videos work directly without needing proxy (they're CORS-enabled)
  // Also they're too large (50-100MB) for Vercel's 4.5MB response limit
  if (url.includes('dramabox') || url.includes('hwztakavideo') || url.includes('hwztvideo')) {
    return url;
  }
  
  // Blogger.com embeds must be used directly (not proxied) as they're iframe embeds
  if (url.includes('blogger.com')) {
    return url;
  }
  
  // Wibufile, samehadaku, backup blogspot - these are direct video files or embeds
  // Don't proxy them because they're too large for Vercel's 4.5MB limit
  // and have their own embed system
  if (url.includes('wibufile') || url.includes('samehadaku') || url.includes('wibuu.info') || url.includes('backup') || url.includes('blogspot')) {
    return url; // Use directly - they work in iframe or direct
  }
  
  // Only proxy small files or files that need CORS bypass
  // For video files, most are too large - just return as-is
  if (url.endsWith('.mp4') || url.endsWith('.m3u8') || url.endsWith('.webm')) {
    return url; // Direct video files - too large to proxy
  }
  
  // For filedon, pixeldrain, etc - these are embed services, use directly
  if (url.includes('filedon.co') || url.includes('pixeldrain') || url.includes('drive.google')) {
    return url; // Use directly
  }
  
  // For other URLs (streaming services, etc), try proxy but expect it might fail
  return `${API_BASE}/proxy/video?url=${encodeURIComponent(url)}`;
}

// Global Image Error Handler for fallback
function handleImageError(img) {
  img.onerror = null; // Prevent infinite loop
  img.src = 'data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"%3e%3crect fill="%23222" width="300" height="400"/%3e%3ctext fill="%23555" font-family="Arial" font-size="20" dy=".3em" x="50%25" y="50%25" text-anchor="middle"%3eGambar Tidak Ada%3c/text%3e%3c/svg%3e';
  img.style.opacity = '0.5';
}

// ==========================================================================
// Initialization
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Check if user has selected a focus before
  checkWelcomeScreen();
  
  // Initialize browser history with home state
  if (!history.state) {
    history.replaceState({ section: 'home' }, '', '#home');
  }
  
  initTheme();
  initEventListeners();
  loadInitialData();
  hideLoadingOverlay();
});

// ==========================================================================
// Welcome Screen & Focus Mode
// ==========================================================================

let currentFocus = localStorage.getItem('dado_focus') || null;

function checkWelcomeScreen() {
  const welcomeScreen = document.getElementById('welcome-screen');
  if (!welcomeScreen) return;
  
  // If user has already selected a focus, skip welcome screen and show content
  if (currentFocus && currentFocus !== 'all') {
    welcomeScreen.classList.add('hidden');
    applyFocusMode(currentFocus);
  } else if (currentFocus === 'all') {
    // User chose "Semua" - hide welcome screen but don't filter
    welcomeScreen.classList.add('hidden');
  }
  // else: first visit, welcome screen stays visible (no hidden class added)
}

function selectFocus(focus) {
  currentFocus = focus;
  localStorage.setItem('dado_focus', focus);
  
  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.classList.add('hidden');
  }
  
  applyFocusMode(focus);
  
  // Auto-navigate to the focused section
  if (focus === 'drama') {
    navigateTo('drama');
  } else if (focus === 'anime') {
    navigateTo('anime');
  } else if (focus === 'komik') {
    navigateTo('komik');
  }
}

function applyFocusMode(focus) {
  // Remove existing focus indicator
  const existingIndicator = document.querySelector('.focus-indicator');
  if (existingIndicator) existingIndicator.remove();
  
  if (focus === 'all') return;
  
  // Add focus indicator
  const indicator = document.createElement('div');
  indicator.className = 'focus-indicator visible';
  indicator.innerHTML = `
    <span>Fokus: ${focus.charAt(0).toUpperCase() + focus.slice(1)}</span>
    <button class="close-focus" onclick="clearFocus()">✕</button>
  `;
  document.body.appendChild(indicator);
  
  // Hide non-focused sections on home
  updateHomeForFocus(focus);
}

function updateHomeForFocus(focus) {
  const sections = {
    drama: document.getElementById('home-drama-grid'),
    anime: document.getElementById('home-anime-grid'),
    komik: document.getElementById('home-komik-grid')
  };
  
  // Get parent sections
  const dramaSection = sections.drama?.closest('.content-section');
  const animeSection = sections.anime?.closest('.content-section');
  const komikSection = sections.komik?.closest('.content-section');
  
  if (focus === 'drama') {
    if (dramaSection) dramaSection.style.display = '';
    if (animeSection) animeSection.style.display = 'none';
    if (komikSection) komikSection.style.display = 'none';
  } else if (focus === 'anime') {
    if (dramaSection) dramaSection.style.display = 'none';
    if (animeSection) animeSection.style.display = '';
    if (komikSection) komikSection.style.display = 'none';
  } else if (focus === 'komik') {
    if (dramaSection) dramaSection.style.display = 'none';
    if (animeSection) animeSection.style.display = 'none';
    if (komikSection) komikSection.style.display = '';
  } else {
    // Show all
    if (dramaSection) dramaSection.style.display = '';
    if (animeSection) animeSection.style.display = '';
    if (komikSection) komikSection.style.display = '';
  }
}

function clearFocus() {
  currentFocus = 'all';
  localStorage.setItem('dado_focus', 'all');
  
  const indicator = document.querySelector('.focus-indicator');
  if (indicator) indicator.remove();
  
  updateHomeForFocus('all');
}

function showWelcomeScreen() {
  localStorage.removeItem('dado_focus');
  currentFocus = null;
  
  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.classList.remove('hidden');
  }
  
  clearFocus();
}

function hideLoadingOverlay() {
  // Hilangkan loading overlay lebih cepat (300ms saja)
  setTimeout(() => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.classList.add('hidden'), 300);
    }
  }, 300);
}

function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

function initEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Scroll header effect
  window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // Close menu on link click (mobile)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });
}

// ==========================================================================
// Navigation
// ==========================================================================

function navigateTo(section, pushHistory = true) {
  state.navigationHistory.push(state.currentSection);
  state.previousSection = state.currentSection;
  state.currentSection = section;

  // Push to browser history
  if (pushHistory) {
    const historyState = {
      section: section,
      content: null
    };
    history.pushState(historyState, '', `#${section}`);
  }

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.section === section) {
      link.classList.add('active');
    }
  });

  // Show section
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
  });
  const targetSection = document.getElementById(`${section}-section`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // Load data for section
  switch (section) {
    case 'home':
      loadHomeData();
      break;
    case 'drama':
      loadDramaCategory('latest');
      break;
    case 'anime':
      loadAnimeCategory('latest');
      break;
    case 'komik':
      loadKomikCategory('popular');
      break;
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  navigateTo('home');
}

function goBack() {
  const prevSection = state.navigationHistory.pop();
  if (prevSection) {
    state.currentSection = prevSection;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById(`${prevSection}-section`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.section === prevSection) {
        link.classList.add('active');
      }
    });
  } else {
    navigateTo('home');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================================
// Mobile Menu Functions
// ========================================

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  const hamburger = document.getElementById('hamburger-btn');
  
  menu.classList.toggle('active');
  overlay.classList.toggle('active');
  hamburger.classList.toggle('active');
  
  // Prevent body scroll when menu is open
  document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  const hamburger = document.getElementById('hamburger-btn');
  
  menu.classList.remove('active');
  overlay.classList.remove('active');
  hamburger.classList.remove('active');
  document.body.style.overflow = '';
}

function mobileNavigate(section) {
  closeMobileMenu();
  
  // Update active state in mobile menu
  document.querySelectorAll('.mobile-menu-link').forEach(link => {
    link.classList.remove('active');
  });
  event.target.classList.add('active');
  
  navigateTo(section);
}

function mobileDramaCategory(category) {
  closeMobileMenu();
  loadDramaCategory(category);
}

function toggleSearchBar() {
  const searchBar = document.getElementById('mobile-search-bar');
  searchBar.classList.toggle('active');
  
  if (searchBar.classList.contains('active')) {
    document.getElementById('mobile-search-input').focus();
  }
}

function performMobileSearch() {
  const input = document.getElementById('mobile-search-input');
  const query = input.value.trim();
  
  if (query) {
    document.getElementById('search-input').value = query;
    performSearch();
    toggleSearchBar();
    input.value = '';
  }
}

// Close search bar on Enter key
document.addEventListener('DOMContentLoaded', () => {
  const mobileSearchInput = document.getElementById('mobile-search-input');
  if (mobileSearchInput) {
    mobileSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performMobileSearch();
      }
    });
  }

  // Setup mobile menu click handlers
  document.querySelectorAll('.mobile-menu-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      const section = link.dataset.section;
      const category = link.dataset.category;
      
      // Update active state
      document.querySelectorAll('.mobile-menu-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      closeMobileMenu();
      
      if (section) {
        navigateTo(section);
      } else if (category) {
        loadDramaCategory(category);
      }
    });
  });
});

// Legacy toggle functions for compatibility
function toggleMenu() {
  toggleMobileMenu();
}

function closeMenu() {
  navMenu.classList.remove('active');
  navToggle.classList.remove('active');
}

// ==========================================================================
// Theme
// ==========================================================================

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
}

// ==========================================================================
// Data Loading - OPTIMIZED FOR INSTANT LOAD
// ==========================================================================

// Preload cache for instant data
const PRELOAD_CACHE = {
  drama: null,
  anime: null,
  komik: null,
  loaded: false
};

async function loadInitialData() {
  // Start preloading all data in background immediately
  preloadAllData();
  // Show homepage with skeleton first, then render when data ready
  await loadHomeData();
}

// Preload semua data di background
async function preloadAllData() {
  if (PRELOAD_CACHE.loaded) return;
  
  try {
    const [dramaData, animeData, komikData] = await Promise.allSettled([
      fetchAPI('/dramabox/latest'),
      fetchAPI('/anime/latest'),
      fetchAPI('/komik/popular')
    ]);
    
    if (dramaData.status === 'fulfilled') PRELOAD_CACHE.drama = dramaData.value;
    if (animeData.status === 'fulfilled') PRELOAD_CACHE.anime = animeData.value;
    if (komikData.status === 'fulfilled') {
      const komikValue = komikData.value;
      PRELOAD_CACHE.komik = Array.isArray(komikValue) ? komikValue : (komikValue?.data || []);
    }
    
    PRELOAD_CACHE.loaded = true;
    console.log('[PRELOAD] All data cached for instant access');
  } catch (e) {
    console.warn('[PRELOAD] Failed:', e);
  }
}

async function loadHomeData() {
  // Tampilkan skeleton dulu
  renderHeroSkeleton();
  showGridSkeleton('home-drama-grid');
  showGridSkeleton('home-anime-grid');
  showGridSkeleton('home-komik-grid');
  
  // Load semua data secara parallel
  const [dramaResult, animeResult, komikResult] = await Promise.allSettled([
    PRELOAD_CACHE.drama ? Promise.resolve(PRELOAD_CACHE.drama) : fetchAPI('/dramabox/latest'),
    PRELOAD_CACHE.anime ? Promise.resolve(PRELOAD_CACHE.anime) : fetchAPI('/anime/latest'),
    PRELOAD_CACHE.komik ? Promise.resolve(PRELOAD_CACHE.komik) : fetchAPI('/komik/popular')
  ]);

  // Render Drama (Hero + Grid)
  if (dramaResult.status === 'fulfilled' && Array.isArray(dramaResult.value) && dramaResult.value.length > 0) {
    PRELOAD_CACHE.drama = dramaResult.value;
    renderHero(dramaResult.value[0]);
    renderContentGrid('home-drama-grid', dramaResult.value.slice(1, 13), 'drama');
  } else {
    document.getElementById('home-drama-grid').innerHTML = '<p class="no-results">Drama tidak tersedia</p>';
  }

  // Render Anime
  if (animeResult.status === 'fulfilled' && Array.isArray(animeResult.value)) {
    PRELOAD_CACHE.anime = animeResult.value;
    renderContentGrid('home-anime-grid', animeResult.value.slice(0, 12), 'anime');
  } else {
    document.getElementById('home-anime-grid').innerHTML = '<p class="no-results">Anime tidak tersedia</p>';
  }

  // Render Komik
  if (komikResult.status === 'fulfilled') {
    let komikArray = [];
    const komikData = komikResult.value;
    if (Array.isArray(komikData)) {
      komikArray = komikData;
    } else if (komikData && typeof komikData === 'object') {
      komikArray = komikData.data || komikData.results || [];
    }
    PRELOAD_CACHE.komik = komikArray;
    if (komikArray.length > 0) {
      renderContentGrid('home-komik-grid', komikArray.slice(0, 12), 'komik');
    } else {
      document.getElementById('home-komik-grid').innerHTML = '<p class="no-results">Komik tidak tersedia</p>';
    }
  } else {
    document.getElementById('home-komik-grid').innerHTML = '<p class="no-results">Komik tidak tersedia</p>';
  }
}

// Fungsi renderHeroSkeleton
function renderHeroSkeleton() {
  const homeSection = document.getElementById('home-section');
  let hero = document.querySelector('.hero');
  if (!hero) {
    hero = document.createElement('div');
    hero.className = 'hero';
    homeSection.prepend(hero);
  }
  hero.innerHTML = `
    <div class="hero-bg skeleton" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);"></div>
    <div class="hero-content container">
      <div class="skeleton-line" style="width:100px;height:24px;background:#333;border-radius:4px;margin-bottom:15px;"></div>
      <div class="skeleton-line" style="width:60%;height:40px;background:#333;border-radius:4px;margin-bottom:10px;"></div>
      <div class="skeleton-line" style="width:80%;height:20px;background:#333;border-radius:4px;margin-bottom:20px;"></div>
      <div class="skeleton-line" style="width:150px;height:44px;background:#333;border-radius:4px;"></div>
    </div>
  `;
}

function renderHero(item) {
  const homeSection = document.getElementById('home-section');
  // Check if hero already exists or create it
  let hero = document.querySelector('.hero');
  if (!hero) {
    hero = document.createElement('div');
    hero.className = 'hero';
    homeSection.prepend(hero);
  }

  const coverUrl = item.coverWap || item.cover;

  hero.innerHTML = `
    <div class="hero-bg" style="background-image: url('${getProxyImageUrl(coverUrl)}')"></div>
    <div class="hero-content container">
      <div class="card-top-tag" style="position: static; display: inline-block; margin-bottom: 15px;">TOP 1 Populer</div>
      <h1 class="hero-title">${item.bookName}</h1>
      <p class="hero-subtitle">${item.introduction || item.bookName + ' adalah drama china terbaru yang sangat populer tahun ini. Tonton perjuangan dan kisah cintanya di WibuStream.'}</p>
      <div class="hero-buttons">
        <button class="btn btn-primary btn-glow" onclick="showDramaDetail('${item.bookId}')" style="background: var(--primary-color); border: none; padding: 12px 30px; border-radius: 4px; color: white; font-weight: 700; cursor: pointer;">
          <span>▶️</span> Tonton Sekarang
        </button>
      </div>
    </div>
  `;
}

// ==========================================================================
// Drama Functions
// ==========================================================================

async function loadDramaCategory(category) {
  try {
    // First, navigate to drama section to make sure the grid is visible
    state.navigationHistory.push(state.currentSection);
    state.currentSection = 'drama';
    
    // Show drama section
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('drama-section').classList.add('active');
    
    // Update nav tabs
    document.querySelectorAll('.tab-link').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.section === 'drama') {
        link.classList.add('active');
      }
    });

    // Update active category tab
    document.querySelectorAll('#drama-section .category-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.category === category) {
        tab.classList.add('active');
      }
    });

    showGridSkeleton('drama-grid');

    const endpoint = `/dramabox/${category}`;
    const data = await fetchAPI(endpoint);

    console.log(`Drama ${category} response type:`, typeof data, data);

    // Handle different response structures
    let dramaArray = [];
    if (Array.isArray(data)) {
      dramaArray = data;
    } else if (data && typeof data === 'object') {
      // Try common property names for array data
      dramaArray = data.data || data.results || data.books || data.dramas || [];
    }

    console.log('Processed drama array:', dramaArray.length, 'items');

    if (Array.isArray(dramaArray) && dramaArray.length > 0) {
      renderContentGrid('drama-grid', dramaArray, 'drama');
    } else {
      document.getElementById('drama-grid').innerHTML = '<p class="no-results">Tidak ada drama ditemukan</p>';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error loading drama:', error);
    showToast('Gagal memuat drama. Silakan coba lagi.', 'error');
    document.getElementById('drama-grid').innerHTML = '<p class="no-results">Gagal memuat drama</p>';
  }
}

async function showDramaDetail(bookId, pushHistory = true) {
  try {
    state.navigationHistory.push(state.currentSection);
    state.currentSection = 'detail';

    // Push to browser history
    if (pushHistory) {
      const historyState = {
        section: 'detail',
        content: { type: 'drama', id: bookId },
        contentType: 'drama'
      };
      history.pushState(historyState, '', `#detail/drama/${bookId}`);
    }

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('detail-section').classList.add('active');

    showDetailSkeleton();

    console.log('Fetching drama detail for bookId:', bookId);

    // Fetch detail from API
    const response = await fetchAPI(`/dramabox/detail?bookId=${bookId}`);
    console.log('Drama detail response:', response);

    // Handle the response structure
    let book, episodes;
    if (response.data) {
      book = response.data.book || response.data;
      episodes = response.data.chapterList || [];
    } else if (response.book) {
      book = response.book;
      episodes = response.chapterList || [];
    } else {
      book = response;
      episodes = response.chapterList || [];
    }

    console.log('Parsed book:', book);
    console.log('Parsed episodes:', episodes.length, 'episodes');

    // 🔓 FETCH ALLEPISODE - This endpoint provides VIDEO URLs for ALL episodes including VIP!
    try {
      const allEpisodesResponse = await fetchAPI(`/dramabox/allepisode?bookId=${bookId}`);
      console.log('All episodes response:', allEpisodesResponse);

      // allepisode returns array directly
      const allEpisodes = Array.isArray(allEpisodesResponse) ? allEpisodesResponse :
        (allEpisodesResponse.data || allEpisodesResponse);

      if (allEpisodes && allEpisodes.length > 0) {
        // Merge video URLs from allepisode into episodes
        // allepisode contains cdnList with videoPathList for EVERY episode
        state.allEpisodesData = allEpisodes;
        console.log('🔓 Loaded', allEpisodes.length, 'episodes with video URLs (including VIP)');
      }
    } catch (err) {
      console.log('Could not fetch allepisode, using detail episodes:', err);
    }

    if (book && book.bookId) {
      renderDramaDetail(book, episodes);
    } else {
      showToast('Detail drama tidak ditemukan', 'error');
      goBack();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error loading drama detail:', error);
    showToast('Gagal memuat detail drama.', 'error');
    goBack();
  }
}

function renderDramaDetail(detail, episodes) {
  const container = document.getElementById('detail-content');

  const tagsHtml = (detail.tags || detail.labels || []).map(tag =>
    `<span class="detail-tag">${tag}</span>`
  ).join('');

  // Episodes use index starting from 0
  // 🔓 All episodes are now playable via allepisode endpoint!
  const episodesHtml = (episodes || []).map((ep, idx) => {
    const episodeIndex = ep.index !== undefined ? ep.index : idx;
    const episodeNum = episodeIndex + 1;

    return `
      <button class="episode-btn" 
              onclick="playDramaEpisode('${detail.bookId}', ${episodeIndex})">
        ${episodeNum}
      </button>
    `;
  }).join('');

  const viewCount = detail.viewCount ? `${(detail.viewCount / 1000).toFixed(1)}K` : '';
  const followCount = detail.followCount ? `${(detail.followCount / 1000).toFixed(1)}K` : '';

  container.innerHTML = `
    <div class="detail-wrapper">
      <div class="detail-poster">
        <img src="${detail.cover}" alt="${detail.bookName}" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
      </div>
      <div class="detail-info">
        <h1 class="detail-title">${detail.bookName}</h1>
        <div class="detail-meta">
          <span class="detail-meta-item">📺 ${detail.chapterCount || episodes.length || 0} Episode</span>
          ${viewCount ? `<span class="detail-meta-item">👁️ ${viewCount} views</span>` : ''}
          ${followCount ? `<span class="detail-meta-item">❤️ ${followCount} followers</span>` : ''}
        </div>
        <p class="detail-synopsis">${detail.introduction || 'Tidak ada sinopsis.'}</p>
        <div class="detail-tags">${tagsHtml}</div>
        <div class="detail-actions">
          <button class="btn btn-primary btn-glow" onclick="playDramaEpisode('${detail.bookId}', 0)">
            <span>▶️</span> Tonton Episode 1
          </button>
        </div>
      </div>
    </div>
    ${episodes && episodes.length > 0 ? `
    <div class="episodes-section">
      <h3 class="episodes-title">📋 Daftar Episode (${episodes.length} Episode)</h3>
      <div class="episodes-grid">${episodesHtml}</div>
    </div>
    ` : ''}
  `;

  // Store episodes in state for playback
  state.currentEpisodes = episodes;
  state.currentDrama = detail;
}

async function playDramaEpisode(bookId, episodeIndex) {
  console.log('Playing drama episode:', bookId, episodeIndex);

  try {
    let videoUrl = null;
    const episodes = state.currentEpisodes || [];

    // 🔓 FIRST: Try to get video from allepisode data (includes VIP episodes!)
    if (state.allEpisodesData && state.allEpisodesData.length > 0) {
      const allEpData = state.allEpisodesData.find(ep => ep.chapterIndex === episodeIndex);

      if (allEpData && allEpData.cdnList && allEpData.cdnList.length > 0) {
        const cdnList = allEpData.cdnList[0];
        if (cdnList.videoPathList && cdnList.videoPathList.length > 0) {
          // Get highest quality video (usually first in list)
          videoUrl = cdnList.videoPathList[0].videoPath;
          console.log('🔓 Got video URL from allepisode (unlocked):', videoUrl?.substring(0, 80) + '...');
        }
      }
    }

    // Fallback: Try to get from regular episode data (only works for free episodes)
    if (!videoUrl) {
      const episode = episodes.find(ep => ep.index === episodeIndex) || episodes[episodeIndex];
      if (episode) {
        videoUrl = episode.mp4 || episode.m3u8Url;
        console.log('Using regular episode video URL');
      }
    }

    // If still no video, fetch allepisode directly
    if (!videoUrl) {
      console.log('Fetching allepisode for video URL...');
      try {
        const allEpisodesResponse = await fetchAPI(`/dramabox/allepisode?bookId=${bookId}`);
        const allEpisodes = Array.isArray(allEpisodesResponse) ? allEpisodesResponse :
          (allEpisodesResponse.data || allEpisodesResponse);

        state.allEpisodesData = allEpisodes;

        const allEpData = allEpisodes.find(ep => ep.chapterIndex === episodeIndex);
        if (allEpData && allEpData.cdnList && allEpData.cdnList.length > 0) {
          const cdnList = allEpData.cdnList[0];
          if (cdnList.videoPathList && cdnList.videoPathList.length > 0) {
            videoUrl = cdnList.videoPathList[0].videoPath;
            console.log('🔓 Got video URL from fresh allepisode fetch');
          }
        }
      } catch (err) {
        console.error('Failed to fetch allepisode:', err);
      }
    }

    const proxiedVideoUrl = getProxyVideoUrl(videoUrl);
    console.log('Final Video URL (Proxied):', proxiedVideoUrl);

    // Navigate to player
    state.navigationHistory.push('detail');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('player-section').classList.add('active');

    // Render player
    const title = state.currentDrama?.bookName || 'Drama';
    renderDramaPlayer(proxiedVideoUrl, title, episodeIndex, episodes, bookId);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error playing drama:', error);
    showToast('Gagal memutar video.', 'error');
  }
}

function renderDramaPlayer(videoUrl, title, currentIndex, episodes, bookId) {
  const container = document.getElementById('player-content');
  const episodeNum = currentIndex + 1;

  // Build episode navigation - all episodes now playable!
  // No longer slicing to 30, show everything
  const episodesNav = episodes.map((ep, idx) => {
    const epIndex = ep.index !== undefined ? ep.index : idx;
    const isActive = epIndex === currentIndex;

    return `
      <button class="episode-btn ${isActive ? 'active' : ''}" 
              onclick="playDramaEpisode('${bookId}', ${epIndex})">
        ${epIndex + 1}
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="player-wrapper">
      <video id="drama-player" controls autoplay playsinline>
        <source src="${videoUrl}" type="video/mp4">
        Browser Anda tidak mendukung video tag.
      </video>
    </div>
    <div class="player-info-card">
      <div class="player-main-info">
        <h2 class="player-title">${title}</h2>
        <span class="player-episode-badge">Episode ${episodeNum}</span>
      </div>
      <div class="player-actions">
        <button class="player-nav-btn" ${currentIndex === 0 ? 'disabled' : ''} 
                onclick="playDramaEpisode('${bookId}', ${currentIndex - 1})">
          ⏮️ Prev
        </button>
        <button class="player-nav-btn" ${currentIndex === episodes.length - 1 ? 'disabled' : ''} 
                onclick="playDramaEpisode('${bookId}', ${currentIndex + 1})">
          Next ⏭️
        </button>
      </div>
    </div>
    <div class="episodes-section">
      <div class="episodes-header">
        <h3 class="episodes-title">📋 Daftar Episode</h3>
        <span class="episodes-count">${episodes.length} Episode</span>
      </div>
      <div class="episodes-grid" id="player-episodes-grid">${episodesNav}</div>
    </div>
  `;

  // Add event handlers for video
  const video = document.getElementById('drama-player');
  if (video) {
    video.onerror = function () {
      console.error('Video error:', video.error);
      showToast('Gagal memuat video. Video mungkin tidak tersedia.', 'error');
    };

    // 🔓 AUTO NEXT: Play next episode when finished
    video.onended = function () {
      if (currentIndex < episodes.length - 1) {
        showToast('Memutar episode berikutnya...', 'info');
        setTimeout(() => {
          playDramaEpisode(bookId, currentIndex + 1);
        }, 2000);
      }
    };

    // Scroll active episode into view
    setTimeout(() => {
      const activeBtn = document.querySelector('#player-episodes-grid .episode-btn.active');
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 500);
  }
}

// ==========================================================================
// Anime Functions
// ==========================================================================

async function loadAnimeCategory(category) {
  try {
    document.querySelectorAll('#anime-section .category-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.category === category) {
        tab.classList.add('active');
      }
    });

    showGridSkeleton('anime-grid');

    const endpoint = `/anime/${category}`;
    const data = await fetchAPI(endpoint);

    if (Array.isArray(data)) {
      renderContentGrid('anime-grid', data, 'anime');
    } else {
      document.getElementById('anime-grid').innerHTML = '<p class="no-results">Tidak ada anime ditemukan</p>';
    }
  } catch (error) {
    console.error('Error loading anime:', error);
    showToast('Gagal memuat anime. Silakan coba lagi.', 'error');
  }
}

async function showAnimeDetail(animeId, pushHistory = true) {
  try {
    state.navigationHistory.push(state.currentSection);
    state.currentSection = 'detail';

    // Push to browser history
    if (pushHistory) {
      const historyState = {
        section: 'detail',
        content: { type: 'anime', id: animeId },
        contentType: 'anime'
      };
      history.pushState(historyState, '', `#detail/anime/${animeId}`);
    }

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('detail-section').classList.add('active');

    showDetailSkeleton();

    console.log('Fetching anime detail for:', animeId);

    const detail = await fetchAPI(`/anime/detail?urlId=${animeId}`);
    console.log('Final Parsed Detail:', detail);

    if (detail && typeof detail === 'object') {
      state.currentEpisodes = detail.episodes || [];
      state.currentContent = detail;
      renderAnimeDetail(detail);
    } else {
      showToast('Detail anime tidak ditemukan.', 'error');
      goBack();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error loading anime detail:', error);
    showToast('Gagal memuat detail anime.', 'error');
    goBack();
  }
}

function renderAnimeDetail(detail) {
  const container = document.getElementById('detail-content');

  const genres = detail.genre || detail.genres || detail.genreList || [];
  const genresHtml = genres.map(genre => {
    const genreText = typeof genre === 'string' ? genre : (genre.title || genre.name || genre);
    return `<span class="detail-tag">${genreText}</span>`;
  }).join('');

  const totalEp = detail.episodes?.length || detail.total_episode || detail.totalEpisodes || '?';
  const coverUrl = getProxyImageUrl(detail.cover_image_url || detail.cover || detail.image || detail.poster || detail.thumbnail_url);

  // Title fallback chain
  const title = detail.judul || detail.title || detail.judul_jp || 'Untitled';
  
  // Synopsis fallback chain
  const synopsis = detail.sinopsis || detail.synopsis || detail.description || detail.plot || 'Tidak ada sinopsis.';

  // Render episodes list
  let chapters = state.currentEpisodes || [];
  if (!Array.isArray(chapters)) chapters = [];

  const episodesHtml = chapters.map((ch, idx) => {
    let chTitle = ch.judul || ch.title || `Episode ${ch.episode || idx + 1}`;
    let chUrlId = ch.urlId || ch.id || ch.url || ch.chapterUrlId || "";
    if (typeof ch === 'string' && ch.includes('url=')) {
      // Parse pseudo-JSON strings like "@{id=...; ch=...; url=...}"
      const urlMatch = ch.match(/url=([^;]+)/);
      const chMatch = ch.match(/ch=([^;]+)/);
      chUrlId = urlMatch ? urlMatch[1] : "";
      chTitle = chMatch ? chMatch[1] : chTitle;
    }

    return `
      <button class="episode-btn" 
              onclick="playAnimeEpisode('${chUrlId}', '${chTitle}', '${title}')">
        ${chTitle}
      </button>
    `;
  }).reverse().join(''); // Show latest episodes first

  container.innerHTML = `
    <div class="detail-wrapper">
      <div class="detail-poster">
        <img src="${coverUrl}" alt="${title}" onerror="handleImageError(this)">
      </div>
      <div class="detail-info">
        <h1 class="detail-title">${title}</h1>
        <div class="detail-meta">
          <span class="detail-meta-item">📺 ${totalEp} Episode</span>
          <span class="detail-meta-item">⭐ ${detail.score || detail.rating || 'N/A'}</span>
          <span class="detail-meta-item">📊 ${detail.status || 'Unknown'}</span>
          ${detail.studio ? `<span class="detail-meta-item">🎬 ${detail.studio}</span>` : ''}
          ${detail.rilis || detail.releaseDate ? `<span class="detail-meta-item">📅 ${detail.rilis || detail.releaseDate}</span>` : ''}
        </div>
        <p class="detail-synopsis">${synopsis}</p>
        <div class="detail-tags">${genresHtml}</div>
        
        <div class="episodes-container" style="margin-top: 30px;">
          <h3 style="margin-bottom: 15px;">Daftar Episode</h3>
          <div class="episodes-grid">
            ${episodesHtml || '<p>Tidak ada episode tersedia.</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function playAnimeEpisode(chapterUrlId, chTitle, animeTitle) {
  try {
    console.log('Playing anime episode:', chapterUrlId);

    state.navigationHistory.push('detail');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('player-section').classList.add('active');

    showPlayerSkeleton();

    // Fetch video data from API using the new parameter
    const response = await fetchAPI(`/anime/getvideo?chapterUrlId=${chapterUrlId}`);

    console.log('[Anime Player] Response:', response);

    let videoUrl = null;
    let streams = []; // Declare streams outside the if block

    if (response.data && response.data.length > 0) {
      const streamData = response.data[0].stream || [];

      // Map and prioritize streams
      streams = streamData.map(s => {
        if (typeof s === 'string') {
          const linkMatch = s.match(/link=([^;]+)/);
          const resoMatch = s.match(/reso=([^;]+)/);
          return {
            link: linkMatch ? linkMatch[1] : '',
            reso: resoMatch ? resoMatch[1] : ''
          };
        }
        return s;
      }).filter(s => s.link);

      console.log('Available streams:', streams);

      // Prioritize pixeldrain or other reliable hosts
      const prioritizedStream = streams.find(s => s.link.includes('pixeldrain.com')) ||
        streams.find(s => s.link.includes('.mp4') || s.link.includes('.m3u8')) ||
        streams[0];

      videoUrl = prioritizedStream ? prioritizedStream.link : null;
    }

    // Check for error response from API
    if (response.error === 'streaming_unavailable' || response.error === 'server_error') {
      showToast(`❌ ${response.message || 'Video anime tidak tersedia untuk episode ini.'}`, 'error');
      goBack();
      return;
    }

    if (!videoUrl || streams.length === 0) {
      console.log('[Anime] No streams available. Response:', response);
      showToast('❌ Video anime belum tersedia. Maaf kami masih mengupdate library anime streaming. Silahkan coba episode atau judul anime lain.', 'error');
      goBack();
      return;
    }

    renderAnimePlayer(streams, 0, animeTitle, chTitle, chapterUrlId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error playing anime:', error);
    showToast('❌ Gagal memutar video anime. Silahkan coba lagi nanti.', 'error');
    goBack();
  }
}

function renderAnimePlayer(streams, currentIndex, animeTitle, chTitle, chapterUrlId) {
  const stream = streams[currentIndex];
  const videoUrl = getProxyVideoUrl(stream.link);
  const container = document.getElementById('player-content');

  console.log(`[Player] Rendering stream ${currentIndex + 1}/${streams.length}:`, videoUrl);

  // Check if URL should be embedded as iframe (blogger.com always needs iframe)
  const isBloggerEmbed = stream.link.includes('blogger.com') || videoUrl.includes('blogger.com');
  const isEmbed = isBloggerEmbed || stream.link.includes('embed') || stream.link.includes('iframe') || (stream.link.includes('pixeldrain') && !stream.link.includes('download'));

  container.innerHTML = `
    <div class="player-wrapper glass-card">
      ${isEmbed ?
      `<iframe src="${videoUrl}" allowfullscreen frameborder="0" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;"></iframe>` :
      `<video id="anime-player" controls autoplay playsinline onerror="handleVideoError()">
          <source src="${videoUrl}" type="video/mp4">
          Browser Anda tidak mendukung video HTML5.
        </video>`
    }
    </div>
    <div class="player-info-card glass-card">
      <div class="player-main-info">
        <h2 class="player-title">${animeTitle}</h2>
        <span class="player-episode-badge">${chTitle} ${stream.reso ? `(${stream.reso})` : ''}</span>
      </div>
      <div class="player-meta-info">
        <small>Server ${currentIndex + 1} dari ${streams.length} • Quality: ${stream.reso}</small>
      </div>
      <div class="player-actions">
         ${streams.length > 1 ? `
         <button class="btn btn-primary" onclick="switchServer()">
           🔄 Ganti Server (${currentIndex + 1}/${streams.length})
         </button>` : ''}
         <button class="btn btn-secondary" onclick="goBack()">
           ⬅️ Kembali
         </button>
      </div>
    </div>
  `;

  // Initialize HLS.js for .m3u8 files
  if (!isEmbed) {
    const video = document.getElementById('anime-player');
    const isM3U8 = stream.link.includes('.m3u8') || stream.isM3U8;

    if (isM3U8 && Hls.isSupported()) {
      // Configure HLS.js - proxy rewrites URLs inside M3U8
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      });
      
      // Use proxied URL - server will rewrite URLs inside M3U8
      const proxiedM3U8 = `${API_BASE}/proxy/video?url=${encodeURIComponent(stream.link)}`;
      console.log('[HLS] Loading proxied M3U8:', proxiedM3U8);
      
      hls.loadSource(proxiedM3U8);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[HLS] Manifest parsed, starting playback');
        video.play().catch(e => console.log("Auto-play blocked"));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[HLS Error]', data.type, data.details, data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error, retrying...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, recovering...');
              hls.recoverMediaError();
              break;
            default:
              console.log('Fatal error, switching server...');
              window.handleVideoError();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = videoUrl;
      video.play().catch(e => console.log("Auto-play blocked"));
    }

    // Auto Next Episode for Anime
    video.onended = () => {
      const episodes = state.currentEpisodes || [];
      const currentEpIdx = episodes.findIndex(ep => (ep.urlId || ep.id) === chapterUrlId);
      if (currentEpIdx !== -1 && currentEpIdx < episodes.length - 1) {
        const nextEp = episodes[currentEpIdx + 1];
        showToast('Memutar episode berikutnya dalam 3 detik...', 'info');
        setTimeout(() => {
          playAnimeEpisode(nextEp.urlId || nextEp.id || nextEp.url, `Episode ${nextEp.episode}`, animeTitle);
        }, 3000);
      }
    };
  }

  // Global functions for this player instance
  window.switchServer = () => {
    const nextIndex = (currentIndex + 1) % streams.length;
    renderAnimePlayer(streams, nextIndex, animeTitle, chTitle, chapterUrlId);
    showToast('Mencoba server lain...', 'info');
  };

  window.handleVideoError = () => {
    console.warn('[Player] Video error detected on server', currentIndex + 1);
    if (streams.length > 1) {
      showToast('Server bermasalah, mengalihkan otomatis...', 'warning');
      setTimeout(() => window.switchServer(), 2000);
    } else {
      showToast('Video gagal dimuat di semua server.', 'error');
    }
  };
}

// ==========================================================================
// Komik Functions
// ==========================================================================

async function loadKomikCategory(category) {
  try {
    document.querySelectorAll('#komik-section .category-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.category === category) {
        tab.classList.add('active');
      }
    });

    showGridSkeleton('komik-grid');

    const endpoint = `/komik/${category}`;
    const response = await fetchAPI(endpoint);

    // Sansekai API for komik often returns { data: [...] }
    const items = Array.isArray(response) ? response : (response.data || []);

    if (items.length > 0) {
      renderContentGrid('komik-grid', items, 'komik');
    } else {
      document.getElementById('komik-grid').innerHTML = '<p class="no-results">Komik tidak tersedia saat ini</p>';
    }
  } catch (error) {
    console.error('Error loading komik:', error);
    document.getElementById('komik-grid').innerHTML = '<p class="no-results">Gagal memuat komik</p>';
  }
}

async function showKomikDetail(komikId, pushHistory = true) {
  try {
    state.navigationHistory.push(state.currentSection);
    state.currentSection = 'detail';

    // Push to browser history
    if (pushHistory) {
      const historyState = {
        section: 'detail',
        content: { type: 'komik', id: komikId },
        contentType: 'komik'
      };
      history.pushState(historyState, '', `#detail/komik/${komikId}`);
    }

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('detail-section').classList.add('active');

    showDetailSkeleton();

    console.log('Fetching komik detail for:', komikId);

    // Fetch detail and chapters
    const detailResponse = await fetchAPI(`/komik/detail?manga_id=${komikId}`);
    const chaptersResponse = await fetchAPI(`/komik/chapterlist?manga_id=${komikId}`);

    console.log('Detail response:', detailResponse);
    console.log('Chapters response:', chaptersResponse);

    // Parse detail - Prioritize API spec {"data": {...}}
    let detail = null;
    if (detailResponse?.data) {
      detail = detailResponse.data;
    } else if (detailResponse?.result?.data) {
      detail = detailResponse.result.data;
    } else if (detailResponse?.result) {
      detail = detailResponse.result;
    } else {
      detail = detailResponse;
    }

    // Parse chapters - Use recursive search if standard paths fail
    let chapterList = [];
    if (Array.isArray(chaptersResponse?.chapters)) {
      chapterList = chaptersResponse.chapters;
    } else if (Array.isArray(chaptersResponse?.data)) {
      chapterList = chaptersResponse.data;
    } else if (Array.isArray(chaptersResponse)) {
      chapterList = chaptersResponse;
    }

    // Deep Search for any array with chapter IDs or numbers
    if (chapterList.length === 0 && chaptersResponse && typeof chaptersResponse === 'object') {
      const findArrays = (obj, depth = 0) => {
        if (!obj || typeof obj !== 'object' || depth > 4) return null;
        for (const key in obj) {
          const val = obj[key];
          if (Array.isArray(val) && val.length > 0) {
            const first = val[0];
            if (first && (first.id || first.chapter_id || first.chapter_number || first.chapter)) return val;
          }
          if (val && typeof val === 'object') {
            const f = findArrays(val, depth + 1);
            if (f) return f;
          }
        }
        return null;
      };
      chapterList = findArrays(chaptersResponse) || [];
    }

    console.log('Final parsed detail:', detail);
    console.log('Final parsed chapters:', chapterList.length);

    if (detail) {
      renderKomikDetail(detail, chapterList, komikId);
    } else {
      showToast('Detail komik tidak ditemukan', 'error');
      goBack();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error loading komik detail:', error);
    showToast('Gagal memuat detail komik.', 'error');
    goBack();
  }
}

function renderKomikDetail(detail, chapters, komikId) {
  const container = document.getElementById('detail-content');

  // Support multiple synopsis fields
  const synopsis = detail.description || detail.synopsis || detail.intro || detail.introduction || 'Tidak ada sinopsis.';

  const genres = detail.taxonomy?.Genre || detail.genre || [];
  const genresHtml = Array.isArray(genres) ? genres.map(g =>
    `<span class="detail-tag">${g.name || g}</span>`
  ).join('') : '';

  const coverUrl = getProxyImageUrl(detail.cover_portrait_url || detail.cover_image_url || detail.cover || detail.thumbnail);

  const chaptersHtml = (chapters || []).slice(0, 100).map((ch, idx) => {
    // Determine a valid chapter ID
    const chapterId = ch.chapter_id || ch.id || ch.slug || ch.chapter_id_ext;

    return `
    <button class="episode-btn" onclick="readKomikChapter('${komikId}', '${chapterId}', '${escapeHtml(detail.title || detail.judul || 'Komik')}')">
      Ch ${ch.chapter_number || ch.chapter || idx + 1}
    </button>
  `}).join('');

  if (chapters && chapters.length > 0) {
    console.log('[Debug] First chapter object keys:', Object.keys(chapters[0]));
    console.log('[Debug] Mapping test:', {
      chapter_id: chapters[0].chapter_id,
      id: chapters[0].id,
      slug: chapters[0].slug
    });
  }

  container.innerHTML = `
    <div class="detail-wrapper">
      <div class="detail-poster">
        <img src="${coverUrl}" alt="${detail.title || detail.judul}" onerror="handleImageError(this)">
      </div>
      <div class="detail-info">
        <h1 class="detail-title">${detail.title || detail.judul}</h1>
        <div class="detail-meta">
          ${detail.author ? `<span class="detail-meta-item">✍️ ${detail.author}</span>` : ''}
          ${detail.status ? `<span class="detail-meta-item">📊 ${detail.status}</span>` : ''}
          ${detail.rating || detail.user_rate ? `<span class="detail-meta-item">⭐ ${detail.rating || detail.user_rate}</span>` : ''}
        </div>
        <p class="detail-synopsis">${synopsis}</p>
        <div class="detail-tags">${genresHtml}</div>
        <div class="detail-actions">
          ${(chapters && chapters.length > 0) ? `
          <button class="btn btn-primary btn-glow" onclick="readKomikChapter('${komikId}', '${chapters[0].chapter_id || chapters[0].id || chapters[0].slug || 0}', '${escapeHtml(detail.title || detail.judul || 'Komik')}')">
            <span>📖</span> Baca Sekarang
          </button>
          ` : '<p>Tidak ada chapter tersedia</p>'}
        </div>
      </div>
    </div>
    ${(chapters && chapters.length > 0) ? `
    <div class="episodes-section">
      <h3 class="episodes-title">📋 Daftar Chapter</h3>
      <div class="episodes-grid">${chaptersHtml}</div>
    </div>
    ` : ''}
  `;
}

async function readKomikChapter(komikId, chapterId, title) {
  try {
    state.navigationHistory.push('detail');
    state.currentKomikId = komikId;
    state.currentChapterId = chapterId;

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('reader-section').classList.add('active');

    showReaderSkeleton();

    console.log('Fetching comic images for chapter:', chapterId);
    const response = await fetchAPI(`/komik/getimage?chapter_id=${chapterId}`);
    
    // Make sure we have chapters list in state for navigation
    if (!state.currentEpisodes || state.currentEpisodes.length === 0) {
      console.log('[Reader] Loading chapters for navigation');
      const chaptersResponse = await fetchAPI(`/komik/chapterlist?manga_id=${komikId}`);
      const chapterList = Array.isArray(chaptersResponse) ? chaptersResponse : 
        (chaptersResponse.data?.list || chaptersResponse.data || []);
      state.currentEpisodes = chapterList;
    }
    
    renderKomikReader(response, title, chapterId, komikId);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error reading komik:', error);
    showToast('Gagal memuat chapter.', 'error');
    goBack();
  }
}

// Helper to identify and filter out credit/promo pages
function isCreditImage(url) {
  if (!url) return false;
  const fullUrl = url.toLowerCase();
  const pathParts = fullUrl.split('/');
  const fileName = pathParts.pop() || '';

  // keywords that identify a credit/promo page
  const creditKeywords = [
    'credit', 'promo', 'watermark', 'donasi', 'discord', 'join', 'staff',
    'sh-ae', 'ae-logo', 'social-media', 'banner', 'website-group'
  ];

  // 1. Check filename prefixes (most common for shinigami)
  if (fileName.startsWith('00-') || fileName.startsWith('9999-') || fileName.startsWith('zzz-')) return true;

  // 2. Check for keywords in the filename
  if (creditKeywords.some(k => fileName.includes(k))) return true;

  // 3. Special check for 'shinigami' but NOT 'shngm' (because shngm is the domain)
  if (fileName.includes('shinigami') || (fullUrl.includes('shinigami') && !fullUrl.includes('shngm.id'))) return true;

  return false;
}

function renderKomikReader(response, title, chapterId, komikId) {
  const container = document.getElementById('reader-content');
  const chapters = state.currentEpisodes || [];
  
  // Find current chapter index - try multiple ID fields
  let currentIdx = chapters.findIndex(ch => {
    const chId = ch.chapter_id || ch.id || ch.slug;
    return chId === chapterId || String(chId) === String(chapterId);
  });
  
  console.log('[Reader] Chapter lookup:', { chapterId, currentIdx, totalChapters: chapters.length });
  if (chapters.length > 0) {
    console.log('[Reader] First chapter sample:', chapters[0]);
  }

  // Sansekai API: can be many structures
  let imagesArray = [];
  const rawData = response?.data?.chapter?.data || response?.data?.images || response?.chapter?.data;

  if (Array.isArray(rawData)) {
    imagesArray = rawData;
  } else if (typeof rawData === 'string') {
    // Some APIs return a space-separated or comma-separated string
    imagesArray = rawData.trim().split(/[\s,]+/);
  } else if (Array.isArray(response)) {
    imagesArray = response;
  } else if (Array.isArray(response?.images)) {
    imagesArray = response.images;
  } else if (Array.isArray(response?.data)) {
    imagesArray = response.data;
  }

  // Final fallback: Deep recursive search for any array containing http/https strings
  if (imagesArray.length === 0 && response) {
    const findImageArray = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 4) return null;
      for (const key in obj) {
        const val = obj[key];
        if (Array.isArray(val) && val.length > 0) {
          if (typeof val[0] === 'string' && val[0].startsWith('http')) return val;
        }
        if (val && typeof val === 'object') {
          const found = findImageArray(val, depth + 1);
          if (found) return found;
        }
      }
      return null;
    };
    imagesArray = findImageArray(response) || [];
  }

  console.log(`[Reader] Found ${imagesArray.length} potential images.`);

  // Filter out credit/promo images
  const filteredImages = imagesArray.filter(imgUrl => !isCreditImage(imgUrl));
  console.log(`[Reader] Filtered ${imagesArray.length - filteredImages.length} credit images.`);

  const imagesHtml = filteredImages.map((imgUrl, idx) => {
    const proxiedUrl = getProxyImageUrl(imgUrl);

    return `
    <img src="${proxiedUrl}"
  alt="Page ${idx + 1}"
  loading="lazy"
  onerror="handleImageError(this)">
    `;
  }).join('');

  const hasPrev = currentIdx !== -1 && currentIdx < chapters.length - 1;
  const hasNext = currentIdx !== -1 && currentIdx > 0;

  // Get chapter IDs properly
  const prevChapterId = hasPrev ? (chapters[currentIdx + 1]?.chapter_id || chapters[currentIdx + 1]?.id || chapters[currentIdx + 1]?.slug) : null;
  const nextChapterId = hasNext ? (chapters[currentIdx - 1]?.chapter_id || chapters[currentIdx - 1]?.id || chapters[currentIdx - 1]?.slug) : null;
  const prevChapterTitle = hasPrev ? (chapters[currentIdx + 1]?.title || title) : '';
  const nextChapterTitle = hasNext ? (chapters[currentIdx - 1]?.title || title) : '';

  console.log('[Reader] Navigation:', { currentIdx, hasPrev, hasNext, prevChapterId, nextChapterId, totalChapters: chapters.length });

  container.innerHTML = `
    <div class="reader-wrapper">
      <div class="reader-controls glass-card">
        <div class="reader-header" style="display:flex; align-items:center; gap:15px; margin-bottom:15px;">
           <button class="btn btn-sm btn-secondary" onclick="goBack()">←</button>
           <span class="reader-title" style="flex:1;">${title}</span>
        </div>
        <div class="reader-nav" style="display:flex; gap:10px;">
          <button class="btn btn-sm btn-primary" ${!hasPrev ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} 
                  onclick="${hasPrev ? `readKomikChapter('${komikId}', '${prevChapterId}', '${escapeHtml(prevChapterTitle)}')` : ''}">
            ← Prev
          </button>
          <button class="btn btn-sm btn-primary" ${!hasNext ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} 
                  onclick="${hasNext ? `readKomikChapter('${komikId}', '${nextChapterId}', '${escapeHtml(nextChapterTitle)}')` : ''}">
            Next →
          </button>
        </div>
      </div>
      <div class="reader-images">
        ${imagesHtml || '<p class="no-results">Tidak ada gambar tersedia</p>'}
      </div>
      <div class="reader-footer-nav" style="padding: 40px; text-align: center; background: #000;">
          <button class="btn btn-primary btn-glow" ${!hasNext ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} 
                  onclick="${hasNext ? `readKomikChapter('${komikId}', '${nextChapterId}', '${escapeHtml(nextChapterTitle)}')` : ''}"
                  style="padding: 15px 50px; font-size: 18px; border-radius: 30px;">
            ${hasNext ? 'Baca Chapter Selanjutnya →' : 'Ini Chapter Terakhir'}
          </button>
      </div>
    </div>
    `;
}

// ==========================================================================
// Search Functions
// ==========================================================================

async function performSearch() {
  const searchInput = document.getElementById('search-input');
  const query = searchInput.value.trim();

  if (!query) {
    showToast('Masukkan kata kunci pencarian', 'error');
    return;
  }

  state.searchQuery = query;
  state.navigationHistory.push(state.currentSection);

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('search-section').classList.add('active');
  document.getElementById('search-query-text').textContent = `Hasil untuk: "${query}"`;

  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

  showGridSkeleton('search-drama-grid');
  showGridSkeleton('search-anime-grid');
  showGridSkeleton('search-komik-grid');

  try {
    const [dramaResults, animeResults, komikResults] = await Promise.all([
      fetchAPI(`/dramabox/search?q=${encodeURIComponent(query)}`).catch(() => []),
      fetchAPI(`/anime/search?q=${encodeURIComponent(query)}`).catch(() => []),
      fetchAPI(`/komik/search?q=${encodeURIComponent(query)}`).catch(() => [])
    ]);

    const dramaCount = Array.isArray(dramaResults) ? dramaResults.length : 0;
    const animeCount = Array.isArray(animeResults) ? animeResults.length : (animeResults?.data?.length || 0);
    const komikCount = Array.isArray(komikResults) ? komikResults.length : (komikResults?.data?.length || 0);

    // Helper to safely extract data array
    const getItems = (result) => {
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.data)) return result.data;
      return [];
    };

    const cleanDrama = getItems(dramaResults);
    const cleanAnime = getItems(animeResults);
    const cleanKomik = getItems(komikResults);

    renderContentGrid('search-drama-grid', cleanDrama, 'drama');
    renderContentGrid('search-anime-grid', cleanAnime, 'anime');
    renderContentGrid('search-komik-grid', cleanKomik, 'komik');

    // Auto-select tab with results
    if (cleanDrama.length > 0) showSearchTab('drama');
    else if (cleanAnime.length > 0) showSearchTab('anime');
    else if (cleanKomik.length > 0) showSearchTab('komik');
    else showSearchTab('drama'); // Default fallback

  } catch (error) {
    console.error('Search error:', error);
    showToast('Gagal melakukan pencarian', 'error');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showSearchTab(type) {
  document.querySelectorAll('.search-results-tabs .category-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.search === type) {
      tab.classList.add('active');
    }
  });

  document.querySelectorAll('.search-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`search-${type}-results`).classList.add('active');
}

// ==========================================================================
// Rendering Functions
// ==========================================================================

function renderContentGrid(containerId, items, type) {
  const container = document.getElementById(containerId);

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="no-results" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">
        <div class="no-results-icon" style="font-size: 40px; margin-bottom: 10px;">😔</div>
        <p>Tidak ada konten ditemukan</p>
      </div>
    `;
    return;
  }

  const cardsHtml = items.map(item => {
    switch (type) {
      case 'drama':
        return createDramaCard(item);
      case 'anime':
        return createAnimeCard(item);
      case 'komik':
        return createKomikCard(item);
      default:
        return '';
    }
  }).join('');

  container.innerHTML = cardsHtml;
}

function createDramaCard(item) {
  const originalCover = item.cover || item.coverWap;
  const coverUrl = getProxyImageUrl(originalCover);
  const episodes = item.chapterCount || item.episodes || 0;

  return `
    <div class="card" onclick="trackClick('${escapeHtml(item.bookName)}', 'drama'); showDramaDetail('${item.bookId}')">
      <div class="card-img-wrapper">
        <img class="card-img" src="${coverUrl}" alt="" loading="lazy" onerror="handleImageError(this)">
        <span class="card-badge">Gratis</span>
        ${item.isNew ? '<span class="card-top-tag">NEW</span>' : ''}
      </div>
      <div class="card-info">
        <div class="card-title">${item.bookName}</div>
        <div class="card-meta">${episodes} Episode • Drama China</div>
      </div>
    </div>
    `;
}

function createAnimeCard(item) {
  const animeId = item.urlId || item.url || item.id;
  const originalCover = item.cover_image_url || item.image || item.thumbnail || item.cover;
  const coverUrl = getProxyImageUrl(originalCover);

  return `
    <div class="card" onclick="trackClick('${escapeHtml(item.judul || item.title)}', 'anime'); showAnimeDetail('${animeId}')">
      <div class="card-img-wrapper">
        <img class="card-img" src="${coverUrl}" alt="" loading="lazy" onerror="handleImageError(this)">
        <span class="card-badge">${item.episode || item.status || 'Ongoing'}</span>
        ${item.score || item.rating ? `<span class="card-top-tag">${item.score ? '⭐ ' + item.score : item.rating}</span>` : ''}
      </div>
      <div class="card-info">
        <div class="card-title">${item.judul || item.title}</div>
        <div class="card-meta">${item.type || 'Anime'} • AniWatch</div>
      </div>
    </div>
    `;
}

function createKomikCard(item) {
  // Extract manga ID from href like "/series/48270276-bd79-4a46-b15e-fdd2cf5655b1"
  let mangaId = item.manga_id || item.id || item.slug;
  if (item.href) {
    const hrefParts = item.href.split('/');
    mangaId = hrefParts[hrefParts.length - 1] || mangaId;
  }
  // Use thumbnail field from shinigami API
  const originalCover = item.thumbnail || item.cover_image_url || item.cover || item.image;
  const coverUrl = getProxyImageUrl(originalCover);

  return `
    <div class="card" onclick="trackClick('${escapeHtml(item.title || item.judul)}', 'komik'); showKomikDetail('${mangaId}')">
      <div class="card-img-wrapper">
        <img class="card-img" src="${coverUrl}" alt="" loading="lazy" onerror="handleImageError(this)">
        <span class="card-badge">${item.chapter || 'Chapter ?'}</span>
      </div>
      <div class="card-info">
        <div class="card-title">${item.title || item.judul}</div>
        <div class="card-meta">${item.type || 'Komik'} • ${item.status || 'Ongoing'}</div>
      </div>
    </div>
    `;
}

async function trackClick(itemName, type) {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'click',
        page: window.location.hash || '#home',
        metadata: { itemName, type }
      })
    });
  } catch (e) {
    console.warn('Tracking failed:', e);
  }
}

// ==========================================================================
// Skeleton Loaders
// ==========================================================================

function showGridSkeleton(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>
    <div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>
    <div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>
    <div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>
    <div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>
    <div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>
  `;
}

function showDetailSkeleton() {
  const container = document.getElementById('detail-content');
  container.innerHTML = `
    <div class="detail-wrapper">
      <div class="detail-poster skeleton-card"><div class="skeleton-image" style="aspect-ratio: 3/4;"></div></div>
      <div class="detail-info">
        <div class="skeleton-line" style="width: 60%; height: 40px;"></div>
        <div class="skeleton-line" style="width: 40%; height: 20px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 100px;"></div>
      </div>
    </div>
    `;
}

function showPlayerSkeleton() {
  const container = document.getElementById('player-content');
  container.innerHTML = `
    <div class="player-wrapper skeleton-card"><div class="skeleton-image" style="aspect-ratio: 16/9;"></div></div>
      <div class="skeleton-line" style="width: 40%; height: 30px; margin-top: 20px;"></div>
  `;
}

function showReaderSkeleton() {
  const container = document.getElementById('reader-content');
  container.innerHTML = `
    <div class="reader-wrapper">
      <div class="skeleton-line" style="width: 100%; height: 40px;"></div>
      <div class="skeleton-line" style="width: 100%; height: 500px; margin-top: 20px;"></div>
    </div>
    `;
}

// ==========================================================================
// API Helper with Aggressive Client-Side Caching
// ==========================================================================

const API_CACHE = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache (longer for speed)

async function fetchAPI(endpoint, useCache = true) {
  const cacheKey = endpoint;

  // Check memory cache first (fastest - instant)
  if (useCache && API_CACHE[cacheKey]) {
    const cached = API_CACHE[cacheKey];
    if (Date.now() - cached.time < CACHE_TTL) {
      console.log('[INSTANT CACHE]', endpoint);
      return cached.data;
    }
  }

  // Check sessionStorage (persists across page navigations)
  if (useCache) {
    try {
      const stored = sessionStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.time < CACHE_TTL) {
          console.log('[SESSION CACHE]', endpoint);
          API_CACHE[cacheKey] = parsed;
          return parsed.data;
        }
      }
    } catch (e) { }
  }

  // Check localStorage for even longer persistence
  if (useCache) {
    try {
      const stored = localStorage.getItem('api_' + cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // localStorage cache valid for 1 hour
        if (Date.now() - parsed.time < 60 * 60 * 1000) {
          console.log('[LOCAL CACHE]', endpoint);
          API_CACHE[cacheKey] = parsed;
          return parsed.data;
        }
      }
    } catch (e) { }
  }

  // Fetch from API with timeout - longer timeout for video endpoints
  console.log('[FETCH]', API_BASE + endpoint);
  
  // Video/detail endpoints need longer timeout (30 seconds), regular endpoints 15 seconds
  const isVideoEndpoint = endpoint.includes('getvideo') || endpoint.includes('video') || endpoint.includes('detail');
  const timeoutMs = isVideoEndpoint ? 30000 : 15000;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('API Error:', response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Cache the response in multiple layers (except video which changes)
    // Don't cache empty arrays
    const isValidData = Array.isArray(data) ? data.length > 0 : (data && Object.keys(data).length > 0);
    if (!isVideoEndpoint && isValidData) {
      const cacheEntry = { data, time: Date.now() };
      API_CACHE[cacheKey] = cacheEntry;
      
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
        localStorage.setItem('api_' + cacheKey, JSON.stringify(cacheEntry));
      } catch (e) {
        // Storage full, ignore
      }
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // If fetch fails, try to return stale cache
    if (API_CACHE[cacheKey]) {
      console.log('[STALE CACHE FALLBACK]', endpoint);
      return API_CACHE[cacheKey].data;
    }
    
    throw error;
  }
}

// ==========================================================================
// Utility Functions
// ==========================================================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} active`;

  setTimeout(() => {
    toast.classList.remove('active');
  }, 3000);
}

function openModal(content) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = content;
  modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('active');
}

// Tentang Kami Modal
function showTentangKami() {
  const content = `
    <div style="padding: 20px; max-width: 600px;">
      <h2 style="color: #FF6B00; margin-bottom: 20px; font-size: 24px;">Tentang DADO STREAM</h2>
      
      <p style="margin-bottom: 15px; line-height: 1.7; color: #ddd;">
        DADO STREAM lahir dari kecintaan kami terhadap dunia hiburan Asia. Kami paham betapa sulitnya 
        mencari platform yang menyediakan drama China, anime, dan komik dalam satu tempat yang mudah diakses.
      </p>
      
      <p style="margin-bottom: 15px; line-height: 1.7; color: #ddd;">
        Berawal dari hobi nonton drama China tengah malam dan marathon anime sampai subuh, kami akhirnya 
        memutuskan untuk membangun platform ini. Bukan sekadar website biasa, tapi rumah digital buat 
        semua pecinta konten Asia.
      </p>
      
      <p style="margin-bottom: 15px; line-height: 1.7; color: #ddd;">
        Di DADO STREAM, kamu bisa menikmati ribuan judul drama China dengan subtitle Indonesia, 
        koleksi anime lengkap dari yang jadul sampai ongoing, plus komik-komik seru yang update tiap hari. 
        Semua gratis, tanpa ribet, langsung tancap gas nonton.
      </p>
      
      <p style="margin-bottom: 20px; line-height: 1.7; color: #ddd;">
        Kami terus berusaha menghadirkan pengalaman streaming terbaik. Kalau ada saran atau konten yang 
        pengen ditambahin, langsung hubungi kami aja. Selamat menikmati! 🎬
      </p>
      
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #333;">
        <span style="color: #FF6B00; font-weight: 600;">DADO STREAM</span>
        <span style="color: #888;"> - Hiburan Tanpa Batas</span>
      </div>
    </div>
  `;
  openModal(content);
}

// FAQ Modal
function showFAQ() {
  const content = `
    <div style="padding: 20px; max-width: 600px;">
      <h2 style="color: #FF6B00; margin-bottom: 25px; font-size: 24px;">Pertanyaan yang Sering Ditanyakan</h2>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #fff; margin-bottom: 8px;">❓ DADO STREAM itu apa sih?</h4>
        <p style="color: #bbb; line-height: 1.6;">
          Platform streaming gratis buat nonton drama China, anime, dan baca komik. Satu aplikasi, semua hiburan ada.
        </p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #fff; margin-bottom: 8px;">💰 Beneran gratis? Nggak ada biaya tersembunyi?</h4>
        <p style="color: #bbb; line-height: 1.6;">
          Iya, 100% gratis. Nggak perlu langganan, nggak perlu bayar apapun. Tinggal buka dan nikmati.
        </p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #fff; margin-bottom: 8px;">📱 Bisa dibuka di HP?</h4>
        <p style="color: #bbb; line-height: 1.6;">
          Bisa banget! Website kami responsive, jadi mau buka di HP, tablet, atau laptop sama enaknya.
        </p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #fff; margin-bottom: 8px;">🎬 Subtitle-nya bahasa apa?</h4>
        <p style="color: #bbb; line-height: 1.6;">
          Kebanyakan drama China sudah ada subtitle Indonesia. Untuk anime juga tersedia sub Indo.
        </p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #fff; margin-bottom: 8px;">🔄 Kontennya update nggak?</h4>
        <p style="color: #bbb; line-height: 1.6;">
          Update dong! Drama dan anime ongoing kita usahakan update secepat mungkin. Komik juga update chapter terbaru.
        </p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #fff; margin-bottom: 8px;">📞 Kalau ada masalah atau saran, hubungi kemana?</h4>
        <p style="color: #bbb; line-height: 1.6;">
          Langsung chat aja ke WhatsApp kami. Klik tombol "Kontak" di bagian bawah website.
        </p>
      </div>
      
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #333;">
        <a href="https://wa.me/6281945330179" target="_blank" style="color: #25D366; text-decoration: none; font-weight: 600;">
          💬 Hubungi Kami via WhatsApp
        </a>
      </div>
    </div>
  `;
  openModal(content);
}

// Close modal on backdrop click
document.getElementById('modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal') {
    closeModal();
  }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeMenu();
  }
});

console.log('🎬 DADO STREAM loaded successfully!');
