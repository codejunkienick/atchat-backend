import express from 'express';
import {UserReport} from '../models';
import passport from 'passport';
const router = express.Router();

router.post('/', passport.authenticate('jwt'), async function (req, res, next) {
  try {
    const report = new UserReport({
      reporter: req.user._id,
      reported: req.body.reportedUserId,
      reason: req.body.reason
    });
    await report.save();
    res.status(200).send();
  } catch (err) {
    res.status(400).send({error: err.message})
  }
});

export default router;