import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Lemma root element is missing');
createRoot(root).render(
  <StrictMode>
    <div className="ground" aria-hidden="true" />
  </StrictMode>,
);
