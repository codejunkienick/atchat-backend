import 'babel-polyfill';
import http from 'http';
import express from 'express';
import session from 'express-session';
import logger from 'morgan';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import _ from 'lodash';
import SocketIo from 'socket.io';
import mongoose from 'mongoose';
import {Membership, Account} from './models';
import passport from 'passport';
import {Strategy as JwtStrategy, ExtractJwt} from 'passport-jwt';
import FacebookTokenStrategy from 'passport-facebook-token';
import ChatActor from 'helpers/ChatActor';
import {userRoutes, authRoutes} from './routes';
import handleUserSocket from './helpers/ws';
import authenticateToken from 'actions/authenticateToken';
import config from './config';

const app = express();
const MongoStore = require('connect-mongo')(session);
const server = new http.Server(app);
const io = new SocketIo(server);
const chatActor = new ChatActor();
chatActor.run(); // Run CronJobs

_.each(io.nsps, function(nsp) {
  nsp.on('connect', function(socket) {
    if (!socket.auth) {
      console.log('removing socket from', nsp.name);
      delete nsp.connected[socket.id];
    }
  });
});

mongoose.Promise = Promise;
mongoose.connect(config.server.databaseURL);
const sessionStore = new MongoStore({mongooseConnection: mongoose.connection}, function(err) {
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
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }) );
app.use(passport.initialize());
app.use(passport.session());
app.use( (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, X-AUTHENTICATION, X-IP, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});
app.use('/user/', userRoutes);
app.use('/auth/', authRoutes);

passport.use(Account.createStrategy());
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeader(),
  secretOrKey: config.secret
}, function(jwt_payload, done) {
  Account.findOne({_id: jwt_payload._id}, function (err, user) {
    if (err) {
      return done(err, false);
    }
    if (user) {
      done(null, user);
    } else {
      done(null, false);
    }
  });
}));
passport.use(new FacebookTokenStrategy({
    clientID: config.facebook.key,
    clientSecret: config.facebook.secret
  },
  async function(accessToken, refreshToken, profile, done) {
    //check user table for anyone with a facebook ID of profile.id
    try {
      console.log(profile);
      const membershipData = await Membership.findOne({providerUserId: profile.id});
      if (!membershipData) {
        const member = new Membership({
        });
        const account = new Account({
          displayName: profile.displayName,
          social: {
            facebook: profile.id
          }
        });

      } else {
        return done(null, null);
      }
    } catch (err) {
      return done(err);
    }

    }
));
passport.serializeUser(Account.serializeUser());
passport.deserializeUser(Account.deserializeUser());

if (config.apiPort) {
  const runnable = app.listen(config.apiPort, (err) => {
    if (err) {
      console.error(err);
    }
    console.info('----\n==>  API is running on port %s', config.apiPort);
    console.info('==>  Send requests to http://%s:%s', config.apiHost, config.apiPort);
  });

  io.listen(runnable);

  io.on('connection', function (socket) {
    socket.on('authenticate', async function(data) {
      try {
        const user = await authenticateToken(data.token);
        console.log('Authenticated socket ' + socket.id);
        socket.auth = true;
        socket.user = user;
        _.each(io.nsps, function(nsp) {
          if (_.find(nsp.sockets, {id: socket.id})) {
            //console.log('restoring socket to ' + nsp.name);
            nsp.connected[socket.id] = socket;
            socket.emit('authenticated');
            handleUserSocket(chatActor, socket);
          }
        });
      } catch (err) {
        console.log(err);
      }
    });

    setTimeout(function() {
      // If the socket didn't authenticate, disconnect it
      if (!socket.auth) {
        console.log('Disconnecting socket ' + socket.id);
        socket.disconnect('unauthorized');
      }
    }, 1000);
  });
} else {
  console.error('==>     ERROR: No PORT environment variable has been specified');
}
