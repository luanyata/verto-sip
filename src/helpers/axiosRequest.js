import axios from 'axios'

const axiosRequest = axios.defaults.headers = {
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Expires': '0',
}

export default axiosRequest