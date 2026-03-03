import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const EMAIL_KEY = 'packouts_auth_email';

export interface AuthorizedUser {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'user';
  apps: string[];
  franchise_id: string;
}

interface AuthContextType {
  user: User | null;
  profile: AuthorizedUser | null;
  loading: boolean;
  error: string | null;
  sendLink: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children, appId = 'sdr' }: { children: ReactNode; appId?: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthorizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount: check if returning from a magic link
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const storedEmail = localStorage.getItem(EMAIL_KEY);
      if (storedEmail) {
        signInWithEmailLink(auth, storedEmail, window.location.href)
          .then(() => {
            localStorage.removeItem(EMAIL_KEY);
            window.history.replaceState(null, '', window.location.pathname);
          })
          .catch((err) => {
            setError('Sign-in link expired or invalid. Please request a new one.');
            setLoading(false);
            console.error('Magic link sign-in failed:', err);
          });
      } else {
        const email = window.prompt('Please enter your email to confirm sign-in:');
        if (email) {
          signInWithEmailLink(auth, email, window.location.href)
            .then(() => {
              window.history.replaceState(null, '', window.location.pathname);
            })
            .catch(() => {
              setError('Sign-in link expired or invalid. Please request a new one.');
              setLoading(false);
            });
        } else {
          setLoading(false);
        }
      }
    }
  }, []);

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

  const sendLink = async (email: string): Promise<boolean> => {
    setError(null);
    try {
      const actionCodeSettings = {
        url: window.location.origin + '/',
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      localStorage.setItem(EMAIL_KEY, email);
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/too-many-requests') {
        setError('Too many requests. Please wait a minute and try again.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Email link sign-in is not enabled. Contact your administrator.');
        console.error('Enable "Email link (passwordless sign-in)" in Firebase Console > Authentication > Sign-in method > Email/Password');
      } else {
        setError('Failed to send sign-in link. Please try again.');
        console.error('sendSignInLinkToEmail error:', err);
      }
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
      sendLink,
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
