import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css'; // Optional CSS

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      <h1>Welcome to Document Evalution Portal</h1>
      <div className="button-group">
        <button onClick={() => navigate('/upload-file')}>Upload files</button>
        <button onClick={() => navigate('/section')}>Get Insights</button>
      </div>
    </div>
  );
}

export default LandingPage;