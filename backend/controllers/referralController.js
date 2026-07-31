const Referral = require('../models/Referral');
const User = require('../models/User');

exports.getMyCode = async (req, res, next) => {
  try {
    let referral = await Referral.findOne({ referrerUserId: req.user._id });

    if (!referral) {
      referral = await Referral.create({ referrerUserId: req.user._id });
    }

    res.json({ code: referral.code, rewardGranted: referral.rewardGranted });
  } catch (err) {
    next(err);
  }
};

exports.applyReferralCode = async (code, userId) => {
  if (!code) return;

  const referral = await Referral.findOne({ code });
  if (!referral) throw Object.assign(new Error('Invalid referral code'), { statusCode: 404 });

  if (referral.referrerUserId.toString() === userId.toString()) {
    throw Object.assign(new Error('You cannot use your own referral code'), { statusCode: 400 });
  }

  if (referral.referredUserId) {
    throw Object.assign(new Error('This code has already been used'), { statusCode: 400 });
  }

  referral.referredUserId = userId;
  await referral.save();

  await Promise.all([
    User.findByIdAndUpdate(referral.referrerUserId, { $inc: { freeDocumentCredits: 1 } }),
    User.findByIdAndUpdate(userId, { $inc: { freeDocumentCredits: 1 } })
  ]);
};

exports.applyCode = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    await exports.applyReferralCode(code, req.user._id);

    res.json({ message: 'Referral code applied successfully! You both got a free download credit.' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

exports.grantReward = async (referredUserId) => {
  const referral = await Referral.findOne({ referredUserId, rewardGranted: false });
  if (!referral) return;

  referral.rewardGranted = true;
  await referral.save();

  await User.findByIdAndUpdate(referral.referrerUserId, {
    $inc: { freeDocumentCredits: 1 }
  });
};

exports.getStats = async (req, res, next) => {
  try {
    let referral = await Referral.findOne({ referrerUserId: req.user._id });
    if (!referral) {
      referral = await Referral.create({ referrerUserId: req.user._id });
    }
    const user = req.user;

    const successfulReferrals = await Referral.countDocuments({ referrerUserId: req.user._id, referredUserId: { $ne: null } });

    res.json({
      code: referral.code,
      totalReferrals: successfulReferrals,
      successfulReferrals,
      credits: user.freeDocumentCredits || 0
    });
  } catch (err) {
    next(err);
  }
};
