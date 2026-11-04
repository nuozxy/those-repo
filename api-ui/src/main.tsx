import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { brandName } from './lib/config';
import './styles.css';
import './cinema.css';

/* 品牌来自 config.js，HTML 里的静态标题只是首屏兜底 */
document.title = `${brandName} · API`;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
