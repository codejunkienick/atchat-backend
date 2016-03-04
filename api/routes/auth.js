import Account from '../models/account';
import express from 'express';
import passport from 'passport';
const router = express.Router();
import jwt from 'jsonwebtoken';
import config from '../config';

router.post('/facebook', passport.authenticate('facebook-token'));

export default router;
