import 'babel-polyfill';
import http from 'http';
import express from 'express';
import session from 'express-session';
import httpLogger from 'morgan';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import _ from 'lodash';
import SocketIo from 'socket.io';
import mongoose from 'mongoose';
import passport from 'passport';
import {Account} from 'models';
import {FacebookTokenStrategy, VkontakteTokenStrategy, JwtStategy} from 'helpers/oAuthStrategies';
import authenticateToken from 'helpers/authenticateToken';
import {userRoute, authRoute, reportRoute} from './routes';
import handleUserSocket from './ws';
import {logger, middleware as requestMiddleware} from 'helpers/logger';
import config from './config';
import {test as testPushNotification} from './modules/pushClient';

const app = express();
const MongoStore = require('connect-mongo')(session);
const server = new http.Server(app);
const io = new SocketIo(server);

//Do not send any data to non-authenticated sockets
_.each(io.nsps, function (nsp) {
  nsp.on('connect', function (socket) {
    if (!socket.auth) {
      delete nsp.connected[socket.id];
    }
  });
});

//Setup mongoose connection
mongoose.Promise = Promise; //ES6 promieses
mongoose.connect(config.server.databaseURL);
const sessionStore = new MongoStore({mongooseConnection: mongoose.connection}, function (err) {
  console.log(err || 'connect-mongodb setup ok');
});

app.use(cookieParser(config.secret));
app.use(session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  key: 'usersid',
  cookie: {maxAge: 1200000}
}));
app.use(httpLogger('dev'));
app.use(requestMiddleware);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(passport.initialize());
app.use(passport.session());
//Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, X-AUTHENTICATION, X-IP, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});
app.use('/static', express.static(config.projectDir + '/public'));

//Setup routes
app.use('/user/', userRoute);
app.use('/auth/', authRoute);
app.use('/report/', reportRoute);

// Log errors
app.use(function (err, req, res, next) {
  if (err) {
    logger.error(err);
    next(err);
  }
});

//Setup passport middleware for authentication
passport.use(Account.createStrategy());
passport.serializeUser(Account.serializeUser());
passport.deserializeUser(Account.deserializeUser());
passport.use(JwtStategy());
passport.use(FacebookTokenStrategy());
passport.use(VkontakteTokenStrategy());


if (config.apiPort) {
  const runnable = app.listen(config.apiPort, (err) => {
    if (err) {
      logger.error(err);
    }
    console.log('----\n==>  API is running on port %s', config.apiPort);
    console.log('==>  Send requests to http://%s:%s', config.apiHost, config.apiPort);
  });

  io.listen(runnable);

  io.on('connection', function (socket) {
    socket.on('authenticate', async function (data) {
      try {
        const user = await authenticateToken(data.token);
        logger.debug('Authenticated socket ' + socket.id);
        socket.auth = true;
        socket.user = user;
        //Restore socket to receive data from server
        _.each(io.nsps, function (nsp) {
          if (_.find(nsp.sockets, {id: socket.id})) {
            nsp.connected[socket.id] = socket;
            socket.emit('authenticated');
            handleUserSocket(socket);
          }
        });
        testPushNotification();
      } catch (err) {
        logger.error(err);
      }
    });

    setTimeout(function () {
      // If the socket didn't authenticate, disconnect it
      if (!socket.auth) {
        logger.debug('Disconnecting socket ' + socket.id);
        socket.disconnect('unauthorized');
      }
    }, 1000);
  });
} else {
  console.error('==>     ERROR: No PORT environment variable has been specified');
}
