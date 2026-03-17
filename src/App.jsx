import IonicSimulation from './components/IonicSimulation'
import MetallicSimulation from './components/MetallicSimulation'
import './App.css'

function App() {
  return (
    <main className="app">
      <header>
        <h1>Chemistry Bonding Simulations</h1>
        <p className="subtitle">Interactive visualizations of ionic and metallic bonding</p>
      </header>
      <IonicSimulation />
      <MetallicSimulation />
    </main>
  )
}

export default App
