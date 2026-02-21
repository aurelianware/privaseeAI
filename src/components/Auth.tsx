// Authentication Components — Microsoft Entra ID
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface AuthButtonProps {
  className?: string
}

export const AuthButton = ({ className = '' }: AuthButtonProps) => {
  const { user, isLoading, signIn, signOut, isAuthenticated } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      setIsSigningOut(false)
    }
  }

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-10 bg-gray-200 rounded-md w-24"></div>
      </div>
    )
  }

  if (isAuthenticated && user) {
    return (
      <div className={`flex items-center space-x-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900">
              {user.name}
            </p>
            <p className="text-xs text-gray-500">
              {user.email}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    )
  }

  return (
    <div className={`space-x-2 ${className}`}>
      <button
        onClick={() => signIn()}
        disabled={isLoading}
        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
      >
        {/* Microsoft logo */}
        <svg className="w-4 h-4 mr-2" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
          <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
        </svg>
        {isLoading ? 'Loading...' : 'Sign in with Microsoft'}
      </button>
    </div>
  )
}

// User Profile Dropdown Component
export const UserProfileDropdown = () => {
  const { user, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  if (!user) return null

  const handleSignOut = async () => {
    setIsOpen(false)
    await signOut()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || 'User'}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {user.name?.[0] || user.email[0].toUpperCase()}
            </span>
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
          <div className="px-4 py-2 border-b">
            <p className="text-sm font-medium text-gray-900">
              {user.name}
            </p>
            <p className="text-xs text-gray-500">
              {user.email}
            </p>
            <p className="text-xs text-blue-500 capitalize">
              via {user.provider}
            </p>
          </div>
          <a
            href="/profile"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Profile Settings
          </a>
          <a
            href="/subscription"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Subscription
          </a>
          <button
            onClick={handleSignOut}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// Protected Route Component
interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const ProtectedRoute = ({ children, fallback }: ProtectedRouteProps) => {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Sign in to continue
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Access your security monitoring dashboard
              </p>
            </div>
            <div className="flex justify-center">
              <AuthButton />
            </div>
          </div>
        </div>
      )
    )
  }

  return <>{children}</>
}