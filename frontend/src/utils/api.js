/**
 * MS-PlateNet - API Client
 * Uses relative URLs — works for both:
 *   - Local dev (Vite proxy to localhost:8000)
 *   - Production via ngrok (frontend served by FastAPI on port 8000)
 */

import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

export const modelsApi = {
  upload: (file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/models/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    })
  },
  list:   ()         => api.get('/models'),
  delete: (filename) => api.delete(`/models/${encodeURIComponent(filename)}`),
}

export const inferenceApi = {
  image: (file, modelFilename) => {
    const form = new FormData()
    form.append('file', file)
    form.append('model_filename', modelFilename)
    return api.post('/inference/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  video: (file, modelFilename) => {
    const form = new FormData()
    form.append('file', file)
    form.append('model_filename', modelFilename)
    return api.post('/inference/video', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  frame: (blob, modelFilename) => {
    const form = new FormData()
    form.append('file', blob, 'frame.jpg')
    form.append('model_filename', modelFilename)
    return api.post('/inference/frame', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export default api
