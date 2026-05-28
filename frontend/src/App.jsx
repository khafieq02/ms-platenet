/**
 * MS-PlateNet - App Root
 * Sets up routing and global context provider.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './hooks/useAppContext'
import Layout from './components/layout/Layout'

import Dashboard from './pages/Dashboard'
import ModelManager from './pages/ModelManager'
import InferenceTester from './pages/InferenceTester'
import LiveCamera from './pages/LiveCamera'
import Settings from './pages/Settings'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="models" element={<ModelManager />} />
            <Route path="inference" element={<InferenceTester />} />
            <Route path="camera" element={<LiveCamera />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
