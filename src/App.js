import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';
import Section from './Section';
import UploadFile from './UploadFile';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/upload-file" element={<UploadFile />} />
        <Route path="/section" element={<Section />} />
      </Routes>
    </Router>
  );
}

export default App;