import React, { createContext, useContext, ReactNode } from 'react';
import { useMsal, useIsAuthenticated, useAccount } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from '../msal-config';

export interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  provider: 'entra';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = useAccount(accounts[0] ?? null);

  const isLoading = inProgress !== InteractionStatus.None;

  const user: User | null = account
    ? {
        id: account.homeAccountId,
        email: account.username,
        name: account.name ?? account.username,
        provider: 'entra',
      }
    : null;

  const signIn = () => {
    instance.loginRedirect(loginRequest).catch(console.error);
  };

  const signOut = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    }).catch(console.error);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    signIn,
    signOut,
    isAuthenticated,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
