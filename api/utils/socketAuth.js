import cookieParser from 'cookie-parser';

export function authenticateSocket(sessionStore) {
  return function _authenticateSocket(socket, next) {
    cookieParser("secret")(socket.handshake, {}, function(err){
      if (err) {
        console.log("error in parsing cookie");
        return next(err);
      }
      if (!socket.handshake.signedCookies) {
        console.log("no secureCookies|signedCookies found");
        return next(new Error("no secureCookies found"));
      }
      sessionStore.get(socket.handshake.signedCookies["usersid"], function(err, session){
        socket.session = session;
        if (!err && !session) err = new Error('session not found');
        if (err) {
          console.log('failed connection to socket.io:', err);
        } else {
          // console.log('successful connection to socket.io');
        }
        next(err);
      });
    });
  }
}
