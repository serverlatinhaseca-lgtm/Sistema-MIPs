const API = window.location.protocol === 'https:'
  ? ''
  : `http://${window.location.hostname}:7001`;

export default API;