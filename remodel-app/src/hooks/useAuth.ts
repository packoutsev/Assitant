import { useState, useCallback } from 'react';

const PIN_KEY = 'remodel_auth';
const CORRECT_PIN = import.meta.env.VITE_ACCESS_PIN || '1800';

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(() => {
    return sessionStorage.getItem(PIN_KEY) === 'true';
  });

  const login = useCallback((pin: string): boolean => {
    if (pin === CORRECT_PIN) {
      sessionStorage.setItem(PIN_KEY, 'true');
      setAuthenticated(true);
      return true;
    }
    return false;
  }, []);

  return { authenticated, login };
}
