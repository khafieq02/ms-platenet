/**
 * MS-PlateNet - API Client
 * Centralised axios instance for all backend calls.
 */

import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60s for video inference
})

// ─── Models API ──────────────────────────────────────────────────────────────

export const modelsApi = {
  /** Upload a .pt model file */
  upload: (file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/models/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    })
  },

  /** List all uploaded models */
  list: () => api.get('/models'),

  /** Delete a model by filename */
  delete: (filename) => api.delete(`/models/${encodeURIComponent(filename)}`),
}

// ─── Inference API ───────────────────────────────────────────────────────────

export const inferenceApi = {
  /** Run inference on an image file */
  image: (file, modelFilename) => {
    const form = new FormData()
    form.append('file', file)
    form.append('model_filename', modelFilename)
    return api.post('/inference/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** Run inference on a video file */
  video: (file, modelFilename) => {
    const form = new FormData()
    form.append('file', file)
    form.append('model_filename', modelFilename)
    return api.post('/inference/video', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** Run inference on a webcam frame (Blob) */
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
