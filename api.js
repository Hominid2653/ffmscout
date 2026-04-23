const API_BASE = "https://fantasy.premierleague.com/api"

async function getBootstrap() {
  const res = await fetch(`${API_BASE}/bootstrap-static/`)
  return await res.json()
}

async function getFixtures() {
  const res = await fetch(`${API_BASE}/fixtures/`)
  return await res.json()
}

async function getManager(id) {
  const res = await fetch(`${API_BASE}/entry/${id}/`)
  return await res.json()
}