const Contact = require('../models/Contact');

exports.submit = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Name, email, subject, and message are required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message must be under 2000 characters' });
    }

    const contact = await Contact.create({
      name,
      email,
      subject,
      message,
      userId: req.user?._id || undefined
    });

    res.status(201).json({ message: 'Message sent successfully', id: contact._id });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [messages, total] = await Promise.all([
      Contact.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Contact.countDocuments()
    ]);
    res.json({ messages, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};
