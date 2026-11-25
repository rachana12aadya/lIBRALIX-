import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { ensureUserDocument } from '../services/firestoreService';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  connectingGmail: boolean;
  authError: string | null;
  googleAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  connectGmail: () => Promise<string | null>;
  clearGoogleAccessToken: () => void;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Access token kept strictly in memory (never persisted to localStorage/sessionStorage).
let cachedGoogleAccessToken: string | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        try {
          await ensureUserDocument({
            uid: nextUser.uid,
            displayName: nextUser.displayName ?? '',
            email: nextUser.email ?? '',
          });
        } catch (err) {
          setAuthError(
            err instanceof Error ? err.message : 'Unable to initialize your workspace.'
          );
        }
        setGoogleAccessToken(cachedGoogleAccessToken);
      } else {
        cachedGoogleAccessToken = null;
        setGoogleAccessToken(null);
      }
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function signInWithGoogle() {
    setAuthError(null);
    setSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedGoogleAccessToken = credential.accessToken;
        setGoogleAccessToken(credential.accessToken);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup was closed before completing. Please try again.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Your browser blocked the Google Sign-In popup. Please allow popups for this site and try again.'
        );
      } else {
        setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function connectGmail(): Promise<string | null> {
    setAuthError(null);
    setConnectingGmail(true);
    try {
      const result = auth.currentUser
        ? await reauthenticateWithPopup(auth.currentUser, googleProvider)
        : await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Could not obtain Gmail permission token. Please try again.');
      }
      cachedGoogleAccessToken = credential.accessToken;
      setGoogleAccessToken(credential.accessToken);
      return credential.accessToken;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        throw new Error('Gmail authorization popup was closed before completing.');
      }
      if (code === 'auth/popup-blocked') {
        throw new Error('Popup was blocked by your browser. Please allow popups and try again.');
      }
      throw err instanceof Error ? err : new Error('Could not connect Gmail.');
    } finally {
      setConnectingGmail(false);
    }
  }

  function clearGoogleAccessToken() {
    cachedGoogleAccessToken = null;
    setGoogleAccessToken(null);
  }

  async function signOutUser() {
    setAuthError(null);
    try {
      cachedGoogleAccessToken = null;
      setGoogleAccessToken(null);
      await signOut(auth);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signingIn,
        connectingGmail,
        authError,
        googleAccessToken,
        signInWithGoogle,
        connectGmail,
        clearGoogleAccessToken,
        signOutUser,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
