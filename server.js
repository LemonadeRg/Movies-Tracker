const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const search = require('yt-search');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const db = new sqlite3.Database('./movies.db');

db.run(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    imdbId TEXT,
    posterUrl TEXT,
    director TEXT,
    mainCharacter TEXT,
    genres TEXT,
    plot TEXT,
    year TEXT,
    imdbRating TEXT,
    runtime TEXT,
    rating INTEGER,
    userNotes TEXT,
    dateAdded TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    imdbId TEXT,
    posterUrl TEXT,
    director TEXT,
    mainCharacter TEXT,
    genres TEXT,
    plot TEXT,
    year TEXT,
    imdbRating TEXT,
    runtime TEXT,
    dateAdded TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

async function fetchMovieData(movieName) {
  try {
    const response = await axios.get('https://www.omdbapi.com/', {
      params: { apikey: OMDB_API_KEY, t: movieName, type: 'movie' },
    });
    if (response.data.Response === 'False') return null;
    return {
      title: response.data.Title,
      imdbId: response.data.imdbID,
      posterUrl: response.data.Poster,
      director: response.data.Director,
      mainCharacter: response.data.Actors.split(',')[0].trim(),
      genres: response.data.Genre,
      plot: response.data.Plot || 'No plot available',
      year: response.data.Year || 'N/A',
      imdbRating: response.data.imdbRating || 'N/A',
      runtime: response.data.Runtime || 'N/A',
    };
  } catch (error) {
    console.error('Error fetching movie:', error);
    return null;
  }
}

// Add movie to watched
app.post('/api/movies', async (req, res) => {
  const { movieName, rating, notes } = req.body;
  const movieData = await fetchMovieData(movieName);
  if (!movieData) return res.status(404).json({ error: 'Movie not found' });

  db.run(
    `INSERT INTO movies (title, imdbId, posterUrl, director, mainCharacter, genres, plot, year, imdbRating, runtime, rating, userNotes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [movieData.title, movieData.imdbId, movieData.posterUrl, movieData.director, movieData.mainCharacter, movieData.genres, movieData.plot, movieData.year, movieData.imdbRating, movieData.runtime, rating, notes],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, ...movieData, rating, notes });
    }
  );
});

app.get('/api/movies', (req, res) => {
  db.all(`SELECT * FROM movies ORDER BY dateAdded DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/movies/:id', (req, res) => {
  db.run(`DELETE FROM movies WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.put('/api/movies/:id', (req, res) => {
  const { rating, userNotes } = req.body;
  db.run(
    `UPDATE movies SET rating = ?, userNotes = ? WHERE id = ?`,
    [rating, userNotes, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Watchlist endpoints
app.post('/api/watchlist', async (req, res) => {
  const { movieName } = req.body;
  const movieData = await fetchMovieData(movieName);
  if (!movieData) return res.status(404).json({ error: 'Movie not found' });

  db.run(
    `INSERT INTO watchlist (title, imdbId, posterUrl, director, mainCharacter, genres, plot, year, imdbRating, runtime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [movieData.title, movieData.imdbId, movieData.posterUrl, movieData.director, movieData.mainCharacter, movieData.genres, movieData.plot, movieData.year, movieData.imdbRating, movieData.runtime],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, ...movieData });
    }
  );
});

app.get('/api/watchlist', (req, res) => {
  db.all(`SELECT * FROM watchlist ORDER BY dateAdded DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/watchlist/:id', (req, res) => {
  db.run(`DELETE FROM watchlist WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/watchlist-to-movies/:id', async (req, res) => {
  const { rating, notes } = req.body;
  db.get(`SELECT * FROM watchlist WHERE id = ?`, [req.params.id], (err, m) => {
    if (err || !m) return res.status(404).json({ error: 'Movie not found' });
    db.run(
      `INSERT INTO movies (title, imdbId, posterUrl, director, mainCharacter, genres, plot, year, imdbRating, runtime, rating, userNotes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.title, m.imdbId, m.posterUrl, m.director, m.mainCharacter, m.genres, m.plot, m.year, m.imdbRating, m.runtime, rating, notes],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`DELETE FROM watchlist WHERE id = ?`, [req.params.id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        });
      }
    );
  });
});

// YouTube trailer
app.get('/api/trailer/:query', async (req, res) => {
  try {
    const results = await search(req.params.query + ' official trailer');
    if (results && results.videos && results.videos.length > 0) {
      const video = results.videos[0];
      res.json({ videoId: video.videoId, title: video.title, url: video.url });
    } else {
      res.status(404).json({ error: 'Trailer not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search for movies (autocomplete)
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const response = await axios.get('https://www.omdbapi.com/', {
      params: {
        apikey: OMDB_API_KEY,
        s: query,
        type: 'movie',
      },
    });

    if (response.data.Response === 'False') {
      return res.json({ results: [] });
    }

    const results = response.data.Search.slice(0, 8).map(movie => ({
      title: movie.Title,
      year: movie.Year,
      imdbId: movie.imdbID,
      poster: movie.Poster !== 'N/A' ? movie.Poster : null,
    }));

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));