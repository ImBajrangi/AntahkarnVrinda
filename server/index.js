import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// Configure Multer for file storage
// Ensure we keep original filenames and handle folder structures if possible
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // If client sends a relative path (for folders), create deeply nested directories
        let destPath = UPLOADS_DIR;
        if (req.body.relativePath) {
            const dirPath = path.dirname(req.body.relativePath);
            if (dirPath !== '.') {
                destPath = path.join(UPLOADS_DIR, dirPath);
                if (!fs.existsSync(destPath)) {
                    fs.mkdirSync(destPath, { recursive: true });
                }
            }
        }
        cb(null, destPath);
    },
    filename: (req, file, cb) => {
        // We try to safely use the original name
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

// API Routes

// 1. Upload files
app.post('/api/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    res.json({
        message: `Successfully uploaded ${req.files.length} file(s)`,
        files: req.files.map(f => ({
            filename: f.originalname,
            size: f.size,
            path: f.path.replace(UPLOADS_DIR, '')
        }))
    });
});

// Helper to recursively get all files in a directory
function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            const stats = fs.statSync(fullPath);
            // Generate a relative path for the frontend
            const relativePath = fullPath.replace(UPLOADS_DIR, '');

            arrayOfFiles.push({
                id: relativePath,
                name: file,
                path: relativePath,
                size: stats.size,
                lastModified: stats.mtime
            });
        }
    });

    return arrayOfFiles;
}

// 2. List all files
app.get('/api/files', (req, res) => {
    try {
        const files = getAllFiles(UPLOADS_DIR);
        res.json(files);
    } catch (error) {
        console.error('Error reading files:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// 3. Download a specific file
app.get('/api/download', (req, res) => {
    const filepath = req.query.path; // e.g., /folder/file.txt

    if (!filepath) {
        return res.status(400).json({ error: 'File path is required' });
    }

    // Prevent directory traversal attacks
    const normalizedPath = path.normalize(filepath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.join(UPLOADS_DIR, normalizedPath);

    // Ensure the resolved path is still within the UPLOADS_DIR
    if (!absolutePath.startsWith(UPLOADS_DIR)) {
        return res.status(403).json({ error: 'Invalid file path' });
    }

    if (fs.existsSync(absolutePath)) {
        res.download(absolutePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// 4. Delete a file
app.delete('/api/files', (req, res) => {
    const filepath = req.query.path;

    if (!filepath) {
        return res.status(400).json({ error: 'File path is required' });
    }

    const normalizedPath = path.normalize(filepath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.join(UPLOADS_DIR, normalizedPath);

    if (!absolutePath.startsWith(UPLOADS_DIR)) {
        return res.status(403).json({ error: 'Invalid file path' });
    }

    try {
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);

            // Try to clean up empty directories after deletion
            const dirPath = path.dirname(absolutePath);
            if (dirPath !== UPLOADS_DIR && fs.readdirSync(dirPath).length === 0) {
                fs.rmdirSync(dirPath);
            }

            res.json({ message: 'File deleted successfully' });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Get local IP addresses for display
function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push(net.address);
            }
        }
    }
    return addresses;
}

// Serve static frontend files in production
const CLIENT_BUILD_PATH = path.join(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_BUILD_PATH)) {
    app.use(express.static(CLIENT_BUILD_PATH));
    app.use((req, res) => {
        res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Local Share Server is running!`);
    console.log(`\n📁 Files are saved to: ${UPLOADS_DIR}`);
    console.log(`\n🌐 Access the app on other devices using these URLs:`);

    const ips = getLocalIpAddresses();
    console.log(`   http://localhost:${PORT} (This machine)`);
    ips.forEach(ip => {
        console.log(`   http://${ip}:${PORT}`);
    });
    console.log('\n');
});
