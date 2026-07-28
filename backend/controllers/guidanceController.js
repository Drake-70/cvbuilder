const { getStructureAdvice } = require('../services/guidanceService');

exports.getAdvice = async (req, res, next) => {
  try {
    const { cvData } = req.body;

    if (!cvData) {
      return res.status(400).json({ error: 'CV data is required' });
    }

    const result = getStructureAdvice(cvData);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
