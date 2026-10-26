import axios from 'axios'
import { installAuthClient } from './authClient.js'

const baseURL = import.meta.env.VITE_API_URL

if (!baseURL || !baseURL.trim()) {
    throw new Error('Configure VITE_API_URL com o endereço da API antes de iniciar o frontend.')
}

const api = axios.create({ baseURL: baseURL.trim(), withCredentials: true })
export const { clearCsrf, onUnauthorized } = installAuthClient(api)
export default api
