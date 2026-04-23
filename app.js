async function init(){

const data = await getBootstrap()

state.players = data.elements
state.teams = data.teams

state.fixtures = await getFixtures()

navigate("top")

}

init()