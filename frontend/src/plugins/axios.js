import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL

if (!baseURL || !baseURL.trim()) {
    throw new Error('Configure VITE_API_URL com o endereço da API antes de iniciar o frontend.')
}

export default axios.create({ baseURL: baseURL.trim() })
