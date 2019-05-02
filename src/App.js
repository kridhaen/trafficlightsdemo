import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import Drawer from "./Logic/Drawer";
import Graph from "./Logic/Graph";

class App extends Component {
  render() {
    return (
      <div className="App">
        <header className="App-header">
          {/* <img src={logo} className="App-logo" alt="logo" /> */}
          <p>This visualisation gives an idea of the remaining time in a certain phase for each trajectory. The colours represent the colours of the traffic lights in their current state. The left column shows the start positions, the following rows are the end positions.</p>
          <Drawer/>
        </header>
      </div>
    );
  }
}

export default App;
