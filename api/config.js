require('babel-polyfill');

const environment = {
  development: {
    isProduction: false
  },
  production: {
    isProduction: true
  }
}[process.env.NODE_ENV || 'development'];

module.exports = Object.assign({
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT,
  apiHost: process.env.APIHOST || '127.0.0.1',
  apiPort: process.env.APIPORT || 3001,
  server: {
    databaseURL: 'mongodb://localhost/speedchat'
  },
  chatDuration: 1000*60, //60 sec
  exchangeDuration: 1000*100000,
  secret: 'superdupersecretkey', // change in production
  vk: {
    key: 'ShCbhk2r54RBvVTWxp4v'
  },
  facebook: {
    secret: '537e383991d7185928cadf4eeb72c9ce',
    key: '1571521829833486'
  },
  instagram: {
    key: '9b953660803c4a2291cb61f27a60324b',
    secret: '436c20f846e94ba78bbce428467facd6'
  },
  twitter: {
    key: 'qzQYml2K1ZrDtrfEhForcZcIm',
    secret: 'IxDLx9dJGn0XeV7k6W9vqkQkwmmtU2vPUZpspX5QtWUof2898k'
  }

}, environment);
