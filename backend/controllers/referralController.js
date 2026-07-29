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

exports.applyCode = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    const referral = await Referral.findOne({ code });
    if (!referral) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    if (referral.referrerUserId.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot use your own referral code' });
    }

    if (referral.referredUserId) {
      return res.status(400).json({ error: 'This code has already been used' });
    }

    referral.referredUserId = req.user._id;
    await referral.save();

    res.json({ message: 'Referral code applied successfully!' });
  } catch (err) {
    next(err);
  }
};

exports.grantReward = async (referredUserId) => {
  // Called when a referred user completes their first paid document
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
    const referral = await Referral.findOne({ referrerUserId: req.user._id });
    const user = req.user;

    const totalReferrals = await Referral.countDocuments({ referrerUserId: req.user._id });
    const successfulReferrals = await Referral.countDocuments({ referrerUserId: req.user._id, referredUserId: { $ne: null } });

    res.json({
      code: referral?.code || null,
      totalReferrals,
      successfulReferrals,
      credits: user.freeDocumentCredits || 0
    });
  } catch (err) {
    next(err);
  }
};
