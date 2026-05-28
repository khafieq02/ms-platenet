/**
 * MS-PlateNet - App Context
 * Global state: uploaded models list + active model selection.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { modelsApi } from '../utils/api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [models, setModels] = useState([])
  const [activeModel, setActiveModel] = useState(null) // filename string
  const [loadingModels, setLoadingModels] = useState(false)
  const [error, setError] = useState(null)

  const fetchModels = useCallback(async () => {
    setLoadingModels(true)
    setError(null)
    try {
      const res = await modelsApi.list()
      setModels(res.data.models)
    } catch (e) {
      setError('Could not connect to backend. Is FastAPI running?')
    } finally {
      setLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // If active model was deleted, clear it
  useEffect(() => {
    if (activeModel && !models.find(m => m.filename === activeModel)) {
      setActiveModel(null)
    }
  }, [models, activeModel])

  return (
    <AppContext.Provider value={{
      models,
      activeModel,
      setActiveModel,
      loadingModels,
      error,
      fetchModels,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
