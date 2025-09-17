// frontend/src/App.js
import React, { useState } from 'react';
import './App.css';

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [customSubtopics, setCustomSubtopics] = useState('');
  const [provider, setProvider] = useState('groq');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const subtopicsArray = customSubtopics
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (!subtopicsArray.length) throw new Error('Please enter at least one subtopic.');

      const response = await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl, topic, customSubtopics: subtopicsArray, provider }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      setResults(data);
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setYoutubeUrl('');
    setTopic('');
    setCustomSubtopics('');
    setProvider('groq');
    setResults(null);
    setError('');
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>YouTube Educational Content Evaluator</h1>
        <p>Analyze how well a video covers provided subtopics with free LLMs (Groq & Gemini)</p>
      </header>

      <main className="main-content">
        {!results && (
          <form onSubmit={handleAnalyze} className="analysis-form">
            <div className="form-group">
              <label htmlFor="youtubeUrl">YouTube Video URL:</label>
              <input
                type="url"
                id="youtubeUrl"
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="topic">Educational Topic:</label>
              <input
                type="text"
                id="topic"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g., Machine Learning"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="customSubtopics">Subtopics (one per line):</label>
              <textarea
                id="customSubtopics"
                value={customSubtopics}
                onChange={e => setCustomSubtopics(e.target.value)}
                placeholder="Enter subtopics manually, one per line"
                rows="6"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="provider">Choose LLM:</label>
              <select id="provider" value={provider} onChange={e => setProvider(e.target.value)}>
                <option value="groq">Groq (LLaMA – Free)</option>
                <option value="gemini">Google Gemini (Free quota)</option>
              </select>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing...' : 'Analyze Video'}
            </button>
          </form>
        )}

        {error && (
          <div className="error-message">
            <h3>Error</h3>
            <p>{error}</p>
            <button onClick={clearForm}>Try Again</button>
          </div>
        )}

        {results && (
          <div className="results">
            <div className="video-info">
              <img src={results.videoInfo.thumbnail} alt="Video thumbnail" />
              <div className="video-details">
                <h3>{results.videoInfo.title}</h3>
                <p className="channel-name">{results.videoInfo.channelTitle}</p>
                <a href={results.videoInfo.youtubeUrl} target="_blank" rel="noopener noreferrer">
                  Watch on YouTube
                </a>
              </div>
            </div>

            <div className="overall-score">
              <h3>{results.provider} Coverage: {results.analysis.overallScore}%</h3>
              <div className="score-bar">
                <div className="score-fill" style={{ width: `${results.analysis.overallScore}%` }}></div>
              </div>
            </div>

            <div className="subtopics-analysis">
              <h3>Subtopic Coverage</h3>
              {results.analysis.subtopicAnalysis.map((item, index) => (
                <div key={index} className="subtopic-item">
                  <h4>{item.subtopic}</h4>
                  <div className="coverage-details">
                    <span
                      className={`score ${
                        item.coverageScore >= 70 ? 'covered' : item.coverageScore >= 40 ? 'partial' : 'not-covered'
                      }`}
                    >
                      {item.coverageScore}% {item.coverageScore >= 70 ? '✓' : item.coverageScore >= 40 ? '~' : '✗'}
                    </span>
                    <p className="evidence">{item.evidence}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="summary">
              <h3>Summary</h3>
              <p>{results.analysis.summary}</p>
            </div>

            <div className="transcript-preview">
              <h3>Transcript Preview</h3>
              <p>{results.transcript}</p>
            </div>

            <button onClick={clearForm} className="back-button">Analyze Another Video</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
