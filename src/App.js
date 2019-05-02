import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import Drawer from "./Logic/Drawer";
import Prediction from "./Logic/Prediction/Prediction";

class App extends Component {
  render() {
    return (
      <div className="App">
        <header className="App-header">
          {/*<img src={logo} className="App-logo" alt="logo" />*/}
          <Drawer/>
          {/*<Prediction/>*/}
        </header>
      </div>
    );
  }
}

export default App;
