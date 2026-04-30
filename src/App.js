import React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import NavMenu from './components/NavMenu'
import { NostrProvider, useNostr } from './context/NostrContext'
import Feed from './pages/Feed'
import Login from './pages/Login'
import Settings from './pages/Settings'

function Protected ({ children }) {
  const { pubkeyHex } = useNostr()
  if (!pubkeyHex) {
    return <Navigate to='/login' replace />
  }
  return children
}

function AppShell () {
  const location = useLocation()
  return (
    <div className='app-container'>
      <NavMenu currentPath={location.pathname} />
      <main className='main-content'>
        <Routes>
          <Route path='/login' element={<Login />} />
          <Route
            path='/feed'
            element={
              <Protected>
                <Feed />
              </Protected>
            }
          />
          <Route
            path='/settings'
            element={
              <Protected>
                <Settings />
              </Protected>
            }
          />
          <Route path='/' element={<Navigate to='/feed' replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App () {
  return (
    <NostrProvider>
      <AppShell />
    </NostrProvider>
  )
}
