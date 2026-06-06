const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session setup
app.use(session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

// Initialize SQLite Database
const db = new sqlite3.Database('./movies.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('✅ Connected to SQLite database');
});

// Create Users Table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create Movies Table (with user_id)
db.run(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    genres TEXT,
    director TEXT,
    mainCharacter TEXT,
    year INTEGER,
    imdbRating REAL,
    runtime TEXT,
    posterUrl TEXT,
    plot TEXT,
    rating INTEGER,
    userNotes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create Watchlist Table (with user_id)
db.run(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    genres TEXT,
    director TEXT,
    mainCharacter TEXT,
    year INTEGER,
    imdbRating REAL,
    runtime TEXT,
    posterUrl TEXT,
    plot TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// ===== AUTHENTICATION ROUTES =====

// Sign Up
app.post('/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email or username already exists' });
          }
          return res.status(500).json({ error: 'Signup failed' });
        }

        req.session.userId = this.lastID;
        req.session.username = username;
        res.json({ success: true, message: 'Account created!' });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Signup error' });
  }
});

// Sign In
app.post('/auth/signin', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    try {
      const validPassword = await bcrypt.compare(password, user.password);
      
      if (!validPassword) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      req.session.userId = user.id;
req.session.username = user.username;
res.json({ 
  success: true, 
  message: 'Logged in!', 
  username: user.username,
  userId: user.id 
});
    } catch (error) {
      res.status(500).json({ error: 'Login error' });
    }
  });
});

// Check Auth Status
app.get('/auth/status', (req, res) => {
  if (req.session.userId) {
    res.json({ 
      authenticated: true, 
      username: req.session.username,
      userId: req.session.userId 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// ===== MOVIES ROUTES =====

// Get all movies for user
app.get('/api/movies', requireAuth, (req, res) => {
  db.all(
    'SELECT * FROM movies WHERE user_id = ? ORDER BY created_at DESC',
    [req.session.userId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    }
  );
});

// Add movie
app.post('/api/movies', requireAuth, async (req, res) => {
  const { movieName, rating, notes } = req.body;

  try {
    const response = await axios.get(`http://www.omdbapi.com/`, {
      params: { apikey: OMDB_API_KEY, t: movieName, type: 'movie' }
    });

    if (response.data.Response === 'False') {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const movie = response.data;
    db.run(
      `INSERT INTO movies 
       (user_id, title, genres, director, mainCharacter, year, imdbRating, runtime, posterUrl, plot, rating, userNotes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId,
        movie.Title,
        movie.Genre,
        movie.Director,
        movie.Actors,
        movie.Year,
        movie.imdbRating,
        movie.Runtime,
        movie.Poster,
        movie.Plot,
        rating,
        notes
      ],
      (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({ success: true });
        }
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to add movie' });
  }
});

// Update movie
app.put('/api/movies/:id', requireAuth, (req, res) => {
  const { rating, userNotes } = req.body;
  const movieId = req.params.id;

  db.run(
    'UPDATE movies SET rating = ?, userNotes = ? WHERE id = ? AND user_id = ?',
    [rating, userNotes, movieId, req.session.userId],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true });
      }
    }
  );
});

// Delete movie
app.delete('/api/movies/:id', requireAuth, (req, res) => {
  const movieId = req.params.id;

  db.run(
    'DELETE FROM movies WHERE id = ? AND user_id = ?',
    [movieId, req.session.userId],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true });
      }
    }
  );
});

// ===== WATCHLIST ROUTES =====

// Get watchlist
app.get('/api/watchlist', requireAuth, (req, res) => {
  db.all(
    'SELECT * FROM watchlist WHERE user_id = ? ORDER BY created_at DESC',
    [req.session.userId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    }
  );
});

// Add to watchlist
app.post('/api/watchlist', requireAuth, async (req, res) => {
  const { movieName } = req.body;

  try {
    const response = await axios.get(`http://www.omdbapi.com/`, {
      params: { apikey: OMDB_API_KEY, t: movieName, type: 'movie' }
    });

    if (response.data.Response === 'False') {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const movie = response.data;
    db.run(
      `INSERT INTO watchlist 
       (user_id, title, genres, director, mainCharacter, year, imdbRating, runtime, posterUrl, plot) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId,
        movie.Title,
        movie.Genre,
        movie.Director,
        movie.Actors,
        movie.Year,
        movie.imdbRating,
        movie.Runtime,
        movie.Poster,
        movie.Plot
      ],
      (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({ success: true });
        }
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// Remove from watchlist
app.delete('/api/watchlist/:id', requireAuth, (req, res) => {
  const watchlistId = req.params.id;

  db.run(
    'DELETE FROM watchlist WHERE id = ? AND user_id = ?',
    [watchlistId, req.session.userId],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true });
      }
    }
  );
});

// Move from watchlist to movies
app.post('/api/watchlist-to-movies/:id', requireAuth, async (req, res) => {
  const { rating, notes } = req.body;
  const watchlistId = req.params.id;

  db.get(
    'SELECT * FROM watchlist WHERE id = ? AND user_id = ?',
    [watchlistId, req.session.userId],
    (err, watchlistMovie) => {
      if (err || !watchlistMovie) {
        return res.status(500).json({ error: 'Movie not found' });
      }

      db.run(
        `INSERT INTO movies 
         (user_id, title, genres, director, mainCharacter, year, imdbRating, runtime, posterUrl, plot, rating, userNotes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.session.userId,
          watchlistMovie.title,
          watchlistMovie.genres,
          watchlistMovie.director,
          watchlistMovie.mainCharacter,
          watchlistMovie.year,
          watchlistMovie.imdbRating,
          watchlistMovie.runtime,
          watchlistMovie.posterUrl,
          watchlistMovie.plot,
          rating,
          notes
        ],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          db.run(
            'DELETE FROM watchlist WHERE id = ? AND user_id = ?',
            [watchlistId, req.session.userId],
            (err) => {
              if (err) {
                res.status(500).json({ error: err.message });
              } else {
                res.json({ success: true });
              }
            }
          );
        }
      );
    }
  );
});

// ===== SEARCH & TRAILER =====

// Search movies
app.get('/api/search/:query', requireAuth, async (req, res) => {
  const query = req.params.query;

  try {
    const response = await axios.get(`http://www.omdbapi.com/`, {
      params: { apikey: OMDB_API_KEY, s: query, type: 'movie' }
    });

    if (response.data.Response === 'False') {
      return res.json({ results: [] });
    }

    const results = response.data.Search.slice(0, 5).map(movie => ({
      title: movie.Title,
      year: movie.Year,
      poster: movie.Poster
    }));

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get trailer
app.get('/api/trailer/:movieTitle', requireAuth, async (req, res) => {
  try {
    const search = require('yt-search');
    const results = await search(`${req.params.movieTitle} trailer`);

    if (results.videos.length > 0) {
      const videoId = results.videos[0].videoId;
      res.json({ videoId });
    } else {
      res.json({ videoId: null });
    }
  } catch (error) {
    res.json({ videoId: null });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎬 Movie Tracker Server running on http://localhost:${PORT}`);
});