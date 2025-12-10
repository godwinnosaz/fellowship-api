const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create subdirectories for different file types
        let subfolder = 'misc';

        if (file.fieldname === 'receipt') {
            subfolder = 'receipts';
        } else if (file.fieldname === 'logo') {
            subfolder = 'logos';
        } else if (file.fieldname === 'resource') {
            subfolder = 'resources';
        }

        const dir = path.join(uploadDir, subfolder);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp-originalname
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter - accept only images and PDFs
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only images (JPEG, PNG, GIF) and PDFs are allowed'));
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max file size
    },
    fileFilter: fileFilter
});

module.exports = upload;
