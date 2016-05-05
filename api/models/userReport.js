import mongoose, {Schema} from 'mongoose';

export const UserReportReasons = ['SPAM', 'ABUSIVE'];

const UserReport = new Schema({
  reporter: {type: Schema.ObjectId, ref: 'Account'},
  reported: {type: Schema.ObjectId, ref: 'Account'},
  reason: {
    type: String,
    enum: UserReportReasons
  },

  date: {type: Date, default: Date.now}
});

export default mongoose.model('UserReport', UserReport);
