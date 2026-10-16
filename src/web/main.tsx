import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {MicrosoftSignIn} from './components/MicrosoftSignIn';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{import.meta.env.VITE_RUNTIME_MODE==='browser'?<MicrosoftSignIn><App/></MicrosoftSignIn>:<App/>}</React.StrictMode>);
