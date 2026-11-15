import React from 'react';
import ReactDOM from 'react-dom/client';
import TesseractGame from './TesseractGame';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TesseractGame />
  </React.StrictMode>,
);
