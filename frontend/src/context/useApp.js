import { useContext } from 'react';
import { AppContext } from './AppContext';

// Separate file so Vite HMR can Fast Refresh AppContext.jsx without conflict.
// Rule: a file can export EITHER components OR hooks, not both.
export const useApp = () => useContext(AppContext);
