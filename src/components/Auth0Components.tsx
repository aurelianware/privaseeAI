import { useMsal, useIsAuthenticated, useAccount } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { User, LogIn, LogOut, Loader } from 'lucide-react'
import { loginRequest } from '../msal-config'

// Loading component
export const AuthLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-900">
    <div className="text-center text-white">
      <Loader className="h-8 w-8 animate-spin mx-auto mb-4" />
      <p>Loading authentication...</p>
    </div>
  </div>
)

// Login component
export const AuthLogin = () => {
  const { instance, inProgress } = useMsal()
  const isLoading = inProgress !== InteractionStatus.None

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch(console.error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-xl">
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 bg-blue-500 rounded-full flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Security Monitoring
          </h2>
          <p className="text-gray-400">
            Sign in with your Microsoft account
          </p>
        </div>

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <LogIn className="h-4 w-4 mr-2" />
          )}
          {isLoading ? 'Signing in...' : 'Sign in with Microsoft'}
        </button>

        <p className="mt-4 text-xs text-gray-500 text-center">
          Secured by Microsoft Entra ID (OIDC)
        </p>
      </div>
    </div>
  )
}

// User profile dropdown
export const UserProfileDropdown = () => {
  const { instance, accounts } = useMsal()
  const account = useAccount(accounts[0] ?? null)

  if (!account) return null

  const handleLogout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    }).catch(console.error)
  }

  return (
    <div className="flex items-center space-x-3">
      <div className="hidden md:block text-sm">
        <p className="text-white font-medium">{account.name}</p>
        <p className="text-gray-400 text-xs">{account.username}</p>
      </div>

      <button
        onClick={handleLogout}
        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}

// Protected route wrapper
interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const isLoading = inProgress !== InteractionStatus.None

  if (isLoading) {
    return <AuthLoading />
  }

  if (!isAuthenticated) {
    return <AuthLogin />
  }

  return <>{children}</>
}