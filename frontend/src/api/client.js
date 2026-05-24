import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000"
})

export const getSampleDishes = ()     => api.get("/api/dishes/sample").then(r => r.data.dishes)
export const getContext       = (date) => api.get(`/api/context/${date}`).then(r => r.data)
export const getForecast      = (body) => api.post("/api/predict", body).then(r => r.data)
export const uploadSales      = (file) => {
  const form = new FormData()
  form.append("file", file)
  return api.post("/api/upload-sales", form).then(r => r.data)
}