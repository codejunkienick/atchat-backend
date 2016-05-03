import mongoose, {Schema} from 'mongoose';

const UserReport = new Schema({
  reporter: {type: Schema.ObjectId, ref: 'Account'},
  reported: {type: Schema.ObjectId, ref: 'Account'},
  reason: {
    type: String,
    enum: ['SPAM', 'ABUSIVE']
  },

  date: {type: Date, default: Date.now}
});
export default mongoose.model('UserReport', UserReport);
