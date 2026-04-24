# ⚽ FPL Mini Analytics SPA

![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-yellow)
![Tailwind](https://img.shields.io/badge/TailwindCSS-CDN-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Project-Mini%20SPA-red)

A lightweight **Single Page Application (SPA)** that provides quick insights and analytics for the :contentReference[oaicite:0]{index=0} using **Vanilla JavaScript**, **HTML5**, and **TailwindCSS (CDN)**.

This project demonstrates how to build a **fully functional SPA without frameworks**.

---

# 📸 Preview

Example features available in the dashboard:

- Top Players Leaderboard
- Player Search
- Fixture Difficulty Viewer
- Best Value Players
- Dream XI Generator
- Manager Rank Tracker

All views update **without page reloads**.

---

# 🚀 Features

## Top Players Dashboard
Displays the **top 10 highest scoring players**.

Includes:
- Player name
- Club
- Total points

---

## Player Search
Live search tool to quickly find players.

Features:
- instant filtering
- shows team
- shows total points

---

## Fixture Difficulty Viewer
Shows upcoming fixtures with difficulty color indicators.

| Difficulty | Color |
|---|---|
| Easy | 🟢 Green |
| Medium | 🟡 Yellow |
| Hard | 🔴 Red |

Useful for planning transfers.

---

## Best Value Players
Finds players with the best **points-to-price ratio**.

Formula used:

```
value = total_points / price
```

Helps identify **budget picks**.

---

## Dream XI Generator
Randomly generates a valid fantasy lineup.

Formation used:

```
1 Goalkeeper
4 Defenders
4 Midfielders
2 Forwards
```

Users can regenerate teams instantly.

---

## Manager Rank Tracker
Look up **Fantasy Premier League managers**.

Displays:

- Team name
- Manager name
- Total points
- Overall rank

---

# 🧠 Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 | App structure |
| Vanilla JavaScript | Logic and SPA routing |
| TailwindCSS CDN | UI styling |
| Fetch API | Data fetching |
| FPL API | Football data |

No frameworks or build tools required.

---

# 📡 API Endpoints Used

Data comes from the public endpoints provided by the **Fantasy Premier League API**.

### Players & Teams

```
https://fantasy.premierleague.com/api/bootstrap-static/
```

Returns:

- all players
- team information
- stats
- prices

---

### Fixtures

```
https://fantasy.premierleague.com/api/fixtures/
```

Returns:

- match fixtures
- kickoff times
- difficulty ratings

---

### Manager Info

```
https://fantasy.premierleague.com/api/entry/{manager_id}/
```

Returns:

- team name
- manager name
- total points
- rank

---

# 🗂 Project Structure

```
fpl-mini-analytics/
│
├── index.html
└── README.md
```

The entire application runs from a **single HTML file**.

---

# ⚙️ Installation

### Clone the repository

```
git clone https://github.com/yourusername/fpl-mini-analytics.git
```

### Navigate into the project

```
cd fpl-mini-analytics
```

### Open the app

Simply open:

```
index.html
```

Or run a simple local server:

```
python -m http.server
```

Then visit:

```
http://localhost:8000
```

---

# 💻 Usage

### Top Players
Click **Top** to see the highest scoring players.

---

### Search Players
Navigate to **Search** and type a player name.

Example:

```
salah
haaland
son
```

---

### View Fixtures
Click **Fixtures** to view upcoming matches.

---

### Best Value Players
Shows players offering the **best value per price**.

---

### Generate Dream XI
Click **Dream XI** and press **Generate** to create a random squad.

---

### Manager Lookup
Go to **Manager** and enter a manager ID:

```
123456
```

Then press **Check**.

---

# 📈 Why This Project Matters

This project demonstrates key frontend skills:

- API integration
- SPA architecture
- async JavaScript
- DOM manipulation
- sorting and filtering datasets
- responsive UI design

It is a **great portfolio project for frontend developers**.

---

# 🔮 Future Improvements

Potential upgrades:

- club logos
- player comparison tool
- captain recommendation engine
- charts for player stats
- save/watchlist players
- squad builder with budget constraints
- PWA support

---

# ⚠️ Disclaimer

This project uses publicly available endpoints from **Fantasy Premier League**.

It is **not affiliated with or endorsed by the Premier League**.

---

# 📜 License

MIT License

Free to use, modify, and distribute.

---

⭐ If you like this project, consider **starring the repository**!
