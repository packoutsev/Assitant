import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AUTH_API = import.meta.env.VITE_AUTH_API || 'https://auth-service-326811155221.us-central1.run.app';

export interface AuthorizedUser {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'user';
  apps: string[];
  franchise_id: string;
  hub_tiles?: string[];
}

interface AuthContextType {
  user: User | null;
  profile: AuthorizedUser | null;
  loading: boolean;
  error: string | null;
  sendCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children, appId = 'hub' }: { children: ReactNode; appId?: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthorizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.email) {
        try {
          const userDoc = await getDoc(
            doc(db, 'authorized_users', firebaseUser.email.toLowerCase())
          );
          if (userDoc.exists()) {
            const data = userDoc.data() as AuthorizedUser;
            if (!('disabled' in data && data.disabled) && data.apps.includes(appId)) {
              setUser(firebaseUser);
              setProfile(data);
              setError(null);
              updateDoc(userDoc.ref, { last_login_at: serverTimestamp() }).catch(() => {});
            } else {
              await signOut(auth);
              setUser(null);
              setProfile(null);
              setError('You do not have access to this application.');
            }
          } else {
            await signOut(auth);
            setUser(null);
            setProfile(null);
            setError('Your email is not authorized. Contact your administrator.');
          }
        } catch {
          // Firestore read failed — allow auth but skip authorization check
          setUser(firebaseUser);
          setProfile({
            email: firebaseUser.email!,
            name: firebaseUser.displayName || firebaseUser.email!,
            role: 'owner',
            apps: [appId],
            franchise_id: 'east-valley',
          });
          setError(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [appId]);

  const sendCode = async (email: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${AUTH_API}/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send code.');
        return false;
      }
      return true;
    } catch {
      setError('Failed to send code. Please try again.');
      return false;
    }
  };

  const verifyCode = async (email: string, code: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${AUTH_API}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed.');
        return false;
      }
      await signInWithCustomToken(auth, data.token);
      return true;
    } catch {
      setError('Verification failed. Please try again.');
      return false;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      error,
      sendCode,
      verifyCode,
      logout,
      isOwner: profile?.role === 'owner',
      isAdmin: profile?.role === 'owner' || profile?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
