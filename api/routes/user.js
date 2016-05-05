import {Account, Exchange} from '../models';
import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import config from '../config';
import multer from 'multer';
import path from 'path';

const router = express.Router();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, config.projectDir + '/public/avatars/')
  },
  filename: function (req, file, cb) {
    cb(null, req.user._id + path.extname(file.originalname))
  }
});
const uploading = multer({
  storage: storage,
  limits: {fileSize: 1000000, files:1}
});

router.post('/profile', passport.authenticate('jwt', {session: false}), uploading.single('avatar'), async function (req, res) {
  const {displayName, locale} = req.body;
  //TODO: Add validation
  req.user.displayName = (displayName) ? displayName : req.user.displayName;
  req.user.avatar = (req.file) ? 'http://' + config.apiHost + ':' + config.apiPort + '/static/avatars/' + req.file.filename : req.user.avatar;
  req.user.save((err) => {
    if (err) return res.status(400).send({error: err});
    res.status(200).send({user: req.user});
  })
});

router.get('/profile', passport.authenticate('jwt', {session: false}), uploading.single('avatar'), function (req, res) {
  res.status(200).send({user: req.user});
});

router.get('/friends', passport.authenticate('jwt', {session: false}), async function (req, res) {
  const userWithFriends = await req.user.populate('friends').execPopulate();
  res.status(200).send({friends: userWithFriends.friends});
});

router.get('/exchanges', passport.authenticate('jwt', {session: false}), function (req, res) {
  const date = req.query.date;
  //TODO: rewrite accepted date format in ISO or UTC not just ms
  const dateFrom = (date) ? new Date(parseInt(decodeURIComponent(date))) : null;
  let query = {
    $or: [{user1: req.user._id}, {user2: req.user._id}]
  };
  query = (dateFrom) ? {...query, date: {$lte: dateFrom}} : query;
  //TODO: Populate user that is not user who made a request
  Exchange.find(query).sort('-date').limit(10).exec((err, exchanges) => {
    return res.status(200).send({exchanges});
  });

  //const exchanges = await Exchange.getUserExchanges(req.user._id, createdBefore);

});

export default router;
