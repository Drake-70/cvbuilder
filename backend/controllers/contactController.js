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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
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

/**
 * Listing moved to `adminController.listContacts`.
 *
 * It used to live here and was mounted at `/api/admin/contacts`. Two list
 * implementations for one inbox is how the two drift, and the version here had
 * none of what the dashboard needs: no status filter, no per-status counts, no
 * search, and unbounded `limit` straight from the query string. The admin
 * controller has all of that and shares the workflow module.
 */
