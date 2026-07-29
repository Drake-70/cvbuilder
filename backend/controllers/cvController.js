const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const CV = require('../models/CV');
const { expandQuestionnaireInput } = require('../services/aiService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload PDF, DOCX, or plain text.'));
    }
  }
}).single('cv');

exports.uploadMiddleware = upload;

exports.uploadCV = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let text = '';
    const mimetype = req.file.mimetype;

    if (mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;
    } else if (mimetype === 'text/plain') {
      text = req.file.buffer.toString('utf-8');
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from the file. Try pasting your CV content instead.' });
    }

    res.json({ cvText: text.trim(), filename: req.file.originalname });
  } catch (err) {
    if (err.message && err.message.includes('Unsupported')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

exports.pasteCV = async (req, res, next) => {
  try {
    const { cvText } = req.body;
    if (!cvText || cvText.trim().length === 0) {
      return res.status(400).json({ error: 'CV text is required' });
    }
    res.json({ cvText: cvText.trim() });
  } catch (err) {
    next(err);
  }
};

exports.buildFromScratch = async (req, res, next) => {
  try {
    const { personalInfo, education, experience, nonTraditionalExperience, skills, language } = req.body;

    if (!personalInfo || !personalInfo.name) {
      return res.status(400).json({ error: 'Personal info with name is required' });
    }

    const expanded = await expandQuestionnaireInput({
      personalInfo,
      education: education || [],
      experience: experience || [],
      nonTraditionalExperience: nonTraditionalExperience || [],
      skills: skills || [],
      language: language || 'en'
    });

    res.json(expanded);
  } catch (err) {
    next(err);
  }
};

exports.expandBullets = async (req, res, next) => {
  try {
    const { items, language } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const expanded = await expandQuestionnaireInput({
      personalInfo: {},
      education: [],
      experience: [],
      nonTraditionalExperience: items,
      skills: [],
      language: language || 'en'
    });

    res.json(expanded);
  } catch (err) {
    next(err);
  }
};

exports.save = async (req, res, next) => {
  try {
    const { label, originalText, parsedSections, source } = req.body;

    const cv = await CV.create({
      userId: req.user._id,
      label: label || 'My CV',
      originalText,
      parsedSections: parsedSections || null,
      source: source || 'upload'
    });

    res.status(201).json(cv);
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const cvs = await CV.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * 50)
      .limit(50);
    res.json(cvs);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const cv = await CV.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cv) {
      return res.status(404).json({ error: 'CV not found' });
    }
    res.json(cv);
  } catch (err) {
    next(err);
  }
};

exports.deleteCV = async (req, res, next) => {
  try {
    const cv = await CV.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!cv) {
      return res.status(404).json({ error: 'CV not found' });
    }
    res.json({ message: 'CV deleted' });
  } catch (err) {
    next(err);
  }
};

const SKILLS_BY_ROLE = {
  'software developer': ['JavaScript', 'Python', 'React', 'Node.js', 'Git', 'SQL', 'REST APIs', 'TypeScript', 'Docker', 'AWS', 'Agile', 'CI/CD'],
  'web developer': ['HTML', 'CSS', 'JavaScript', 'React', 'WordPress', 'PHP', 'MySQL', 'Responsive Design', 'SEO', 'Figma', 'Git', 'REST APIs'],
  'data analyst': ['Excel', 'SQL', 'Python', 'Tableau', 'Power BI', 'Statistics', 'Data Visualization', 'R', 'Google Analytics', 'Machine Learning', 'Pandas', 'Critical Thinking'],
  'marketing': ['Social Media Marketing', 'Google Ads', 'Facebook Ads', 'SEO', 'Content Writing', 'Email Marketing', 'Google Analytics', 'Canva', 'Copywriting', 'CRM', 'Branding', 'Market Research'],
  'accountant': ['QuickBooks', 'Excel', 'Financial Reporting', 'Tax Preparation', 'GAAP', 'Accounts Payable', 'Accounts Receivable', 'Budgeting', 'SAP', 'Payroll', 'Auditing', 'MS Excel'],
  'project manager': ['Agile', 'Scrum', 'MS Project', 'Jira', 'Risk Management', 'Budget Management', 'Stakeholder Management', 'Communication', 'Leadership', 'Planning', 'PMP', 'Kanban'],
  'customer service': ['Communication', 'Problem Solving', 'CRM', 'Zendesk', 'Intercom', 'Conflict Resolution', 'Patience', 'Multitasking', 'Microsoft Office', 'Teamwork', 'Empathy', 'Time Management'],
  'teacher': ['Lesson Planning', 'Classroom Management', 'Student Assessment', 'Curriculum Development', 'Communication', 'Patience', 'Microsoft Office', 'Google Classroom', 'Differentiated Instruction', 'Parent Communication'],
  'nurse': ['Patient Care', 'Vital Signs', 'Medication Administration', 'Electronic Health Records', 'CPR', 'IV Therapy', 'Triage', 'Infection Control', 'Communication', 'Empathy', 'Documentation', 'Teamwork'],
  'driver': ['Driving License', 'Navigation', 'Route Planning', 'Vehicle Maintenance', 'Safety Regulations', 'Time Management', 'Reliability', 'Customer Service', 'Communication', 'Physical Fitness'],
  'mechanic': ['Engine Repair', 'Diagnostics', 'Electrical Systems', 'Brake Systems', 'Transmission', 'Welding', 'Tool Operation', 'Customer Service', 'Problem Solving', 'Manual Dexterity', 'Technical Manuals', 'Preventive Maintenance'],
  'electrician': ['Electrical Wiring', 'Circuit Installation', 'Blueprint Reading', 'Safety Regulations', 'Troubleshooting', 'PLC Programming', 'Motor Controls', 'Conduit Bending', 'National Electrical Code', 'Tool Operation'],
  'plumber': ['Pipe Fitting', 'Drain Cleaning', 'Water Heaters', 'Blueprint Reading', 'Soldering', 'Code Compliance', 'Problem Solving', 'Physical Stamina', 'Tool Operation', 'Customer Service'],
  'cook': ['Food Preparation', 'Kitchen Safety', 'Menu Planning', 'Inventory Management', 'Food Hygiene', 'Time Management', 'Teamwork', 'Creativity', 'Communication', 'Cleanliness'],
  'sewing': ['Pattern Making', 'Fabric Cutting', 'Machine Operation', 'Hand Sewing', 'Textile Knowledge', 'Attention to Detail', 'Color Coordination', 'Measurement', 'Design', 'Alterations'],
  'agriculture': ['Crop Management', 'Soil Analysis', 'Irrigation', 'Pest Control', 'Harvesting', 'Livestock Care', 'Farm Equipment', 'Weather Monitoring', 'Sustainability', 'Physical Stamina'],
  'default': ['Communication', 'Teamwork', 'Problem Solving', 'Time Management', 'Leadership', 'Computer Literacy', 'Microsoft Office', 'Customer Service', 'Organization', 'Adaptability', 'Critical Thinking', 'Interpersonal Skills']
};

exports.getSkillSuggestions = async (req, res) => {
  try {
    const { jobTitle } = req.query;
    if (!jobTitle) return res.json({ skills: SKILLS_BY_ROLE['default'] });

    const lower = jobTitle.toLowerCase();
    const matched = Object.entries(SKILLS_BY_ROLE).find(([key]) => lower.includes(key));
    const skills = matched ? matched[1] : SKILLS_BY_ROLE['default'];
    res.json({ skills });
  } catch (err) {
    res.json({ skills: SKILLS_BY_ROLE['default'] });
  }
};
