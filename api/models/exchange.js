import mongoose, {Schema} from 'mongoose';

const Exchange = new Schema({
  user1: {type: Schema.ObjectId, ref: 'Account'},
  user2: {type: Schema.ObjectId, ref: 'Account'},
  result: {
    type: String,
    enum: ['SUCCESS', 'FAILURE']
  },
  chatHistory: [{
    user: {type: Schema.ObjectId, ref: 'Account'},
    message: {type: String, required: true},
    date: {type: Date}
  }],
  date: {type: Date, default: Date.now}
});
export default mongoose.model('Exchange', Exchange);
