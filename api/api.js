import 'babel-polyfill';
import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import config from './config';
import http from 'http';
import SocketIo from 'socket.io';
import mongoose from 'mongoose';
import passport from 'passport';
import Account from './models/account';
import Membership from './models/membership';
import routes from './routes/index';
import authRoutes from './routes/auth';
import logger from 'morgan';
import _ from 'lodash';
import {authenticateSocket} from 'actions/socketAuth';
import {Strategy as JwtStrategy, ExtractJwt} from 'passport-jwt';
import FacebookTokenStrategy from 'passport-facebook-token';
import ChatActor from 'helpers/ChatActor';

const app = express();
const MongoStore = require('connect-mongo')(session);
const server = new http.Server(app);
const io = new SocketIo(server);
const chatActor = new ChatActor();
chatActor.run(); // Run CronJobs

_.each(io.nsps, function(nsp){
  nsp.on('connect', function(socket){
    if (!socket.auth) {
      console.log("removing socket from", nsp.name);
      delete nsp.connected[socket.id];
    }
  });
});

mongoose.Promise = Promise;
mongoose.connect(config.server.databaseURL);
const sessionStore = new MongoStore({mongooseConnection: mongoose.connection}, function(err){
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

passport.use(Account.createStrategy());
const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeader(),
  secretOrKey: config.secret
};
passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
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



app.use( (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, X-AUTHENTICATION, X-IP, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

app.use('/user/', routes);
app.use('/auth/', authRoutes);

const bufferSize = 100;
const messageBuffer = new Array(bufferSize);
let messageIndex = 0;

if (config.apiPort) {
  const runnable = app.listen(config.apiPort, (err) => {
    if (err) {
      console.error(err);
    }
    console.info('----\n==>  API is running on port %s', config.apiPort);
    console.info('==>  Send requests to http://%s:%s', config.apiHost, config.apiPort);
  });

  io.listen(runnable);

  async function handleUserSocket(socket) {
    function abortTalk(receiverSocket, msg = "abortTalk", data = {}) {
      chatActor.terminateChat(socket, receiverSocket);
      receiverSocket.emit(msg, data);
    }
    if (!socket.auth) return;
    try {
      const user = socket.user;
      socket.on('findBuddy', (data) => {
        if (chatActor.isUserSearching(socket)) {
          console.log('[SOCKET] User ' + user.username + ' multiple search ' );
          return;
        }
        console.log("[SOCKET] User " + user.username + " started searching");
        chatActor.addSearchingUser(socket)
      });

      socket.on('denyExchange', () => {
        const receiver = chatActor.getChatUser(socket);
        abortTalk(socket, receiver.socket, "exchangeFailure");
      });
      socket.on('exchange', (data) => {
        const receiver = chatActor.getExchangeUser(socket);
        if (receiver) {
          const {status} = receiver;
          console.log(status + " " + receiver.socket.user.username);
          switch (status) {
            case "PENDING":
                  chatActor.acceptExchange(receiver.socket);
                  break;
            case "ACCEPT":
                  console.log("YAY");
                  abortTalk(receiver.socket, "exchangeSuccess", receiver.socket.user);
                  Account.addFriend(user.username, receiver.socket.user.username);
                  break;
            default:
              break;
          }
        }
      });

      socket.on('stopFindingBuddy', (data) => {
        console.log('[SOCKET] User ' + user.username 1+ ' stopped searching');
        chatActor.removeSearchingUser(socket);
      });

      socket.on('newMessage', (data) => {
        console.log('[SOCKET] User ' + user.username + ' sends message to User ' + data.username);
        let receiver = chatActor.getChatUser(socket);
        receiver.emit("newMessage", data.message);
      });

      socket.on('disconnect', () => {
        console.log('[SOCKET] ' + user.username + ' disconnected from ws');
        chatActor.removeSearchingUser(socket);
        const messageReceiver = chatActor.getChatUser(socket);
        const exchangeReceiver = chatActor.getExchangeUser(socket);
        if (messageReceiver) {
          abortTalk(socket, messageReceiver);
        }
        if (exchangeReceiver) {
          abortTalk(socket, exchangeReceiver.socket);
        }
        socket.disconnect();
      });
    } catch (err) {
      console.log(err);
    }
  }

  io.on('connection', function (socket) {
    socket.on('authenticate', async function(data){
      try {
        const user = await authenticateSocket(data.token);
        console.log("Authenticated socket ", socket.id);
        socket.auth = true;
        socket.user = user;
        _.each(io.nsps, function(nsp) {
          if(_.find(nsp.sockets, {id: socket.id})) {
            console.log("restoring socket to", nsp.name);
            nsp.connected[socket.id] = socket;

            socket.emit('authenticated');
            handleUserSocket(socket);
          }
        });
      } catch (err) {
        console.log(err);
      }
    });

    setTimeout(function(){
      //If the socket didn't authenticate, disconnect it
      if (!socket.auth) {
        console.log("Disconnecting socket ", socket.id);
        socket.disconnect('unauthorized');
      }
    }, 1000);
  });
} else {
  console.error('==>     ERROR: No PORT environment variable has been specified');
}