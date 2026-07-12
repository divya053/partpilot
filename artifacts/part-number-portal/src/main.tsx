import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// When the SPA is served from a subpath (e.g. /partpilot/), Vite bakes
// import.meta.env.BASE_URL to "/partpilot/". Prefix every relative API request
// with it so calls hit "/partpilot/api/..." instead of "/api/...". At the site
// root (BASE_URL === "/") this is a no-op and requests stay "/api/...".
const apiBase = import.meta.env.BASE_URL.replace(/\/+$/, '');
if (apiBase) {
  setBaseUrl(apiBase);
}

createRoot(document.getElementById('root')!).render(<App />);
