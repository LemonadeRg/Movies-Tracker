console.log('✅ app.js loaded successfully');
// ===== PASSWORD PROTECTION =====
const APP_PASSWORD = 'riyad123';  // Change this to your password!

window.addEventListener('load', function() {
  const isAuthenticated = sessionStorage.getItem('appAuthenticated');
  if (!isAuthenticated) {
    document.getElementById('passwordModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
});

function checkPassword() {
  const password = document.getElementById('passwordInput').value;
  if (password === APP_PASSWORD) {
    sessionStorage.setItem('appAuthenticated', 'true');
    document.getElementById('passwordModal').style.display = 'none';
    document.body.style.overflow = 'auto';
  } else {
    showAlert('❌ Wrong password!');
    document.getElementById('passwordInput').value = '';
  }
}
let allMovies = [];
let allWatchlist = [];
let currentFilter = 'all';
let selectedMovieId = null;
let ratingCallback = null;
let confirmCallback = null;
let selectedRating = 0;

// ===== ALERT & CONFIRM MODALS =====
function showAlert(message) {
  document.getElementById('alertMessage').textContent = message;
  document.getElementById('alertModal').classList.add('active');
}

function closeAlert() {
  document.getElementById('alertModal').classList.remove('active');
}

function showConfirm(message, callback) {
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirmModal').classList.add('active');
}

function confirmYes() {
  document.getElementById('confirmModal').classList.remove('active');
  if (confirmCallback) confirmCallback(true);
  confirmCallback = null;
}

function confirmNo() {
  document.getElementById('confirmModal').classList.remove('active');
  if (confirmCallback) confirmCallback(false);
  confirmCallback = null;
}

window.addEventListener('click', function(event) {
  const alertModal = document.getElementById('alertModal');
  const confirmModal = document.getElementById('confirmModal');
  if (alertModal && event.target === alertModal) closeAlert();
  if (confirmModal && event.target === confirmModal) confirmNo();
});

// ===== SECTION NAVIGATION =====
function showSection(section) {
  document.getElementById('moviesSection').style.display = 'none';
  document.getElementById('watchlistSection').style.display = 'none';
  document.getElementById('moviesBtn').classList.remove('active');
  document.getElementById('watchlistBtn').classList.remove('active');
  
  if (section === 'movies') {
    document.getElementById('moviesSection').style.display = 'block';
    document.getElementById('moviesBtn').classList.add('active');
  } else {
    document.getElementById('watchlistSection').style.display = 'block';
    document.getElementById('watchlistBtn').classList.add('active');
    loadWatchlist();
  }
}

// ===== ADD MOVIE =====
async function addMovie() {
  const movieInput = document.getElementById('movieInput').value.trim();

  if (!movieInput) {
    showAlert('Please enter a movie name');
    return;
  }

  openRatingModal(async (rating, notes) => {
    try {
      const response = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieName: movieInput,
          rating: rating,
          notes: notes || '',
        }),
      });

      if (!response.ok) throw new Error('Movie not found on IMDb');

      document.getElementById('movieInput').value = '';
      loadMovies();
      showAlert('Movie added! ✅');
    } catch (error) {
      showAlert('Error: ' + error.message);
    }
  });
}

// ===== LOAD & DISPLAY MOVIES =====
async function loadMovies() {
  try {
    const response = await fetch('/api/movies');
    allMovies = await response.json();
    displayMovies(allMovies);
  } catch (error) {
    console.error('Error loading movies:', error);
  }
}

function displayMovies(movies) {
  const container = document.getElementById('moviesContainer');
  container.innerHTML = '';

  if (movies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>No movies yet</h2>
        <p>Start by adding your first movie! 🍿</p>
      </div>
    `;
    return;
  }

  movies.forEach((movie) => {
    const movieCard = document.createElement('div');
    movieCard.className = 'movie-card';
    movieCard.innerHTML = `
      <div class="poster-container" onclick="openMovieDetails(${movie.id})">
        <img src="${movie.posterUrl}" alt="${movie.title}" class="poster">
        <div class="play-button">▶</div>
      </div>
      <div class="movie-info">
        <h3>${movie.title}</h3>
        <p class="genre">${movie.genres}</p>
        <p class="director"><strong>Dir:</strong> ${movie.director.substring(0, 30)}</p>
        <p class="actor"><strong>Actor:</strong> ${movie.mainCharacter}</p>
        <div class="rating">
          <span class="stars">${'⭐'.repeat(movie.rating)}</span>
          <span class="rating-number">${movie.rating}/5</span>
        </div>
        <div class="actions">
          <button class="view-btn" onclick="openMovieDetails(${movie.id})">View</button>
          <button class="delete-btn" onclick="deleteMovie(${movie.id})">Delete</button>
        </div>
      </div>
    `;
    container.appendChild(movieCard);
  });
}

// ===== FILTER MOVIES =====
function filterMovies(genre) {
  currentFilter = genre;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  if (genre === 'all') {
    displayMovies(allMovies);
  } else {
    const filtered = allMovies.filter((movie) =>
      movie.genres.toLowerCase().includes(genre.toLowerCase())
    );
    displayMovies(filtered);
  }
}

// ===== MOVIE DETAILS MODAL =====
async function openMovieDetails(movieId) {
  const movie = allMovies.find(m => m.id === movieId);
  if (!movie) return;

  selectedMovieId = movieId;

  document.getElementById('modalTitle').textContent = movie.title;
  document.getElementById('modalPoster').src = movie.posterUrl;
  document.getElementById('modalGenre').textContent = movie.genres || 'N/A';
  document.getElementById('modalDirector').textContent = movie.director || 'N/A';
  document.getElementById('modalActor').textContent = movie.mainCharacter || 'N/A';
  document.getElementById('modalPlot').textContent = movie.plot || 'Plot not available';
  document.getElementById('modalYear').textContent = movie.year || 'N/A';
  document.getElementById('modalIMDbRating').textContent = movie.imdbRating || 'N/A';
  document.getElementById('modalRuntime').textContent = movie.runtime || 'N/A';

  document.getElementById('modalUserRating').innerHTML = `
    <div class="user-stars">${'⭐'.repeat(movie.rating)}</div>
    <div style="color: #00d9ff; font-weight: bold;">${movie.rating}/5</div>
  `;

  if (movie.userNotes) {
    document.getElementById('modalUserNotes').innerHTML = `<strong>Your Notes:</strong> ${movie.userNotes}`;
  } else {
    document.getElementById('modalUserNotes').textContent = 'No notes added';
  }

  // Trailer
  const trailerContainer = document.getElementById('trailerContainer');
  trailerContainer.innerHTML = `
    <div style="background: #0f1424; padding: 40px; border-radius: 10px; border: 1px solid #00d9ff; text-align: center;">
      <p style="color: #aaa;">Loading trailer...</p>
    </div>
  `;

  fetch(`/api/trailer/${encodeURIComponent(movie.title)}`)
    .then(r => r.json())
    .then(data => {
      if (data.videoId) {
        trailerContainer.innerHTML = `
          <div class="video-container">
            <iframe src="https://www.youtube.com/embed/${data.videoId}" allowfullscreen></iframe>
          </div>
        `;
      } else throw new Error();
    })
    .catch(() => {
      trailerContainer.innerHTML = `
        <div style="background: #0f1424; padding: 50px 30px; border-radius: 10px; border: 1px solid #ff006e; text-align: center;">
          <h3 style="color: #ff006e;">🎬 Trailer Not Available</h3>
        </div>
      `;
    });

  const modalActions = document.querySelector('.modal-actions');
  modalActions.innerHTML = `
    <button class="edit-btn" onclick="editMovieFromModal()">Edit Rating & Notes</button>
    <button class="delete-modal-btn" onclick="deleteMovieFromModal()">Delete</button>
  `;

  document.getElementById('movieModal').classList.add('active');
}

function closeModal() {
  document.getElementById('movieModal').classList.remove('active');
  selectedMovieId = null;
}

function editMovieFromModal() {
  if (!selectedMovieId) return;
  const movie = allMovies.find(m => m.id === selectedMovieId);
  const newRating = prompt('New rating (1-10):', movie.rating);
  if (newRating) {
    const newNotes = prompt('Update notes:', movie.userNotes || '');
    updateMovie(selectedMovieId, parseInt(newRating), newNotes);
    closeModal();
  }
}

function deleteMovieFromModal() {
  showConfirm('Delete this movie?', (confirmed) => {
    if (confirmed) {
      deleteMovie(selectedMovieId);
      closeModal();
    }
  });
}

async function updateMovie(id, rating, notes) {
  await fetch(`/api/movies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, userNotes: notes }),
  });
  loadMovies();
}

async function deleteMovie(id) {
  showConfirm('Delete this movie?', async (confirmed) => {
    if (confirmed) {
      await fetch(`/api/movies/${id}`, { method: 'DELETE' });
      loadMovies();
    }
  });
}

window.addEventListener('click', function(event) {
  const modal = document.getElementById('movieModal');
  if (modal && event.target === modal) closeModal();
});

// ===== WATCHLIST =====
async function addToWatchlist() {
  const input = document.getElementById('watchlistInput').value.trim();
  if (!input) {
    showAlert('Please enter a movie name');
    return;
  }

  try {
    const response = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieName: input }),
    });

    if (!response.ok) throw new Error('Movie not found on IMDb');

    document.getElementById('watchlistInput').value = '';
    showAlert('Added to Watch Later! ✅');
    loadWatchlist();
  } catch (error) {
    showAlert('Error: ' + error.message);
  }
}

async function loadWatchlist() {
  try {
    const response = await fetch('/api/watchlist');
    allWatchlist = await response.json();
    displayWatchlist(allWatchlist);
  } catch (error) {
    console.error('Error loading watchlist:', error);
  }
}

function displayWatchlist(movies) {
  const container = document.getElementById('watchlistContainer');
  container.innerHTML = '';

  if (movies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>No movies yet</h2>
        <p>Add movies you want to watch later! 🎬</p>
      </div>
    `;
    return;
  }

  movies.forEach((movie) => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
      <div class="poster-container" onclick="openWatchlistDetails(${movie.id})">
        <img src="${movie.posterUrl}" alt="${movie.title}" class="poster">
        <div class="play-button">▶</div>
      </div>
      <div class="movie-info">
        <h3>${movie.title}</h3>
        <p class="genre">${movie.genres}</p>
        <p class="director"><strong>Dir:</strong> ${movie.director.substring(0, 30)}</p>
        <p class="actor"><strong>Actor:</strong> ${movie.mainCharacter}</p>
        <p style="color: #ffd700; margin: 10px 0; font-size: 0.9em;"><strong>IMDb:</strong> ⭐ ${movie.imdbRating}</p>
        <div class="watchlist-actions">
          <button class="watch-btn" onclick="markAsWatched(${movie.id})">✅ Watched</button>
          <button class="remove-btn" onclick="removeFromWatchlist(${movie.id})">Remove</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function openWatchlistDetails(movieId) {
  const movie = allWatchlist.find(m => m.id === movieId);
  if (!movie) return;

  document.getElementById('modalTitle').textContent = movie.title;
  document.getElementById('modalPoster').src = movie.posterUrl;
  document.getElementById('modalGenre').textContent = movie.genres || 'N/A';
  document.getElementById('modalDirector').textContent = movie.director || 'N/A';
  document.getElementById('modalActor').textContent = movie.mainCharacter || 'N/A';
  document.getElementById('modalPlot').textContent = movie.plot || 'Plot not available';
  document.getElementById('modalYear').textContent = movie.year || 'N/A';
  document.getElementById('modalIMDbRating').textContent = movie.imdbRating || 'N/A';
  document.getElementById('modalRuntime').textContent = movie.runtime || 'N/A';

  document.getElementById('modalUserRating').innerHTML = `<div style="color: #aaa; font-style: italic;">Not watched yet</div>`;
  document.getElementById('modalUserNotes').innerHTML = `<div style="color: #aaa;">Click "Watched" on the card to add your rating!</div>`;

  const modalActions = document.querySelector('.modal-actions');
  modalActions.innerHTML = `
    <button class="edit-btn" onclick="closeModal(); markAsWatched(${movie.id})">✅ Mark as Watched</button>
    <button class="delete-modal-btn" onclick="closeModal(); removeFromWatchlist(${movie.id})">Remove from List</button>
  `;

  const trailerContainer = document.getElementById('trailerContainer');
  trailerContainer.innerHTML = `<div style="background: #0f1424; padding: 40px; border-radius: 10px; border: 1px solid #00d9ff; text-align: center;"><p style="color: #aaa;">Loading trailer...</p></div>`;

  fetch(`/api/trailer/${encodeURIComponent(movie.title)}`)
    .then(r => r.json())
    .then(data => {
      if (data.videoId) {
        trailerContainer.innerHTML = `<div class="video-container"><iframe src="https://www.youtube.com/embed/${data.videoId}" allowfullscreen></iframe></div>`;
      } else throw new Error();
    })
    .catch(() => {
      trailerContainer.innerHTML = `<div style="background: #0f1424; padding: 50px 30px; border-radius: 10px; border: 1px solid #ff006e; text-align: center;"><h3 style="color: #ff006e;">🎬 Trailer Not Available</h3></div>`;
    });

  document.getElementById('movieModal').classList.add('active');
}

async function removeFromWatchlist(id) {
  showConfirm('Remove from Watch Later?', async (confirmed) => {
    if (confirmed) {
      await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
      loadWatchlist();
    }
  });
}

async function markAsWatched(id) {
  openRatingModal(async (rating, notes) => {
    try {
      const response = await fetch(`/api/watchlist-to-movies/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: rating, notes: notes || '' }),
      });

      if (!response.ok) throw new Error('Error');
      
      showAlert('Moved to My Movies! ✅');
      loadWatchlist();
      loadMovies();
    } catch (error) {
      showAlert('Error: ' + error.message);
    }
  });
}

// ===== SEARCH/AUTOCOMPLETE =====
let searchTimeout;

async function searchMovies(inputId, suggestionsId) {
  const input = document.getElementById(inputId);
  const suggestionsBox = document.getElementById(suggestionsId);
  const query = input.value.trim();

  clearTimeout(searchTimeout);

  if (query.length < 2) {
    suggestionsBox.classList.remove('active');
    suggestionsBox.innerHTML = '';
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/api/search/${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        suggestionsBox.innerHTML = data.results.map(movie => `
          <div class="suggestion-item" onclick="selectSuggestion('${inputId}', '${suggestionsId}', '${movie.title.replace(/'/g, "\\'")}')">
            <img src="${movie.poster || ''}" alt="" class="suggestion-poster" onerror="this.style.display='none'">
            <div class="suggestion-info">
              <div class="suggestion-title">${movie.title}</div>
              <div class="suggestion-year">${movie.year}</div>
            </div>
          </div>
        `).join('');
        suggestionsBox.classList.add('active');
      } else {
        suggestionsBox.innerHTML = '<div class="suggestion-empty">No movies found</div>';
        suggestionsBox.classList.add('active');
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  }, 300);
}

function selectSuggestion(inputId, suggestionsId, title) {
  document.getElementById(inputId).value = title;
  document.getElementById(suggestionsId).classList.remove('active');
  document.getElementById(suggestionsId).innerHTML = '';
}

document.addEventListener('click', function(event) {
  if (!event.target.closest('.search-wrapper')) {
    document.querySelectorAll('.suggestions-box').forEach(box => {
      box.classList.remove('active');
    });
  }
});

// ===== RATING MODAL =====
function openRatingModal(callback) {
  selectedRating = 0;
  ratingCallback = callback;
  document.getElementById('ratingModal').classList.add('active');
  document.getElementById('notesInput').value = '';
  document.getElementById('selectedRatingDisplay').textContent = 'Select a rating';
  
  document.querySelectorAll('.star-rating .star').forEach(star => {
    star.classList.remove('selected');
  });
}

function closeRatingModal() {
  document.getElementById('ratingModal').classList.remove('active');
  selectedRating = 0;
  ratingCallback = null;
}

function selectRating(rating) {
  selectedRating = rating;
  
  document.querySelectorAll('.star-rating .star').forEach((star, index) => {
    if (index < rating) {
      star.classList.add('selected');
    } else {
      star.classList.remove('selected');
    }
  });
  
  document.getElementById('selectedRatingDisplay').textContent = `Rating: ${rating}/5 ⭐`;
}

function submitRating() {
  if (selectedRating === 0) {
    showAlert('Please select a rating!');
    return;
  }
  
  const notes = document.getElementById('notesInput').value.trim();
  
  if (ratingCallback) {
    ratingCallback(selectedRating, notes);  // Keep as 1-5
  }
  
  closeRatingModal();
}

window.addEventListener('click', function(event) {
  const ratingModal = document.getElementById('ratingModal');
  if (ratingModal && event.target === ratingModal) {
    closeRatingModal();
  }
});

// Load movies on startup
loadMovies();